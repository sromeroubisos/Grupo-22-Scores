import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { G22Client } from "./g22Client.js";
import { registerG22Tools } from "./tools.js";

type StreamableSession = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

type SseSession = {
  server: McpServer;
  transport: SSEServerTransport;
};

const config = loadConfig();
const streamableSessions = new Map<string, StreamableSession>();
const sseSessions = new Map<string, SseSession>();
const sseMessagePath = joinPath(config.mcpPath, "messages");
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb", type: ["application/json", "application/*+json"] }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "g22scores-mcp-server",
    mcp_path: config.mcpPath,
    sse_message_path: sseMessagePath,
    tools: ["search_match", "update_result"]
  });
});

app.options(config.mcpPath, (_req, res) => {
  res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
  res.status(204).end();
});

app.post(config.mcpPath, async (req, res) => {
  try {
    const sessionId = singleHeader(req, "mcp-session-id");
    let session = sessionId ? streamableSessions.get(sessionId) : undefined;

    if (!session) {
      if (sessionId) {
        sendJsonRpcError(res, 404, -32001, "Session not found.");
        return;
      }

      if (!containsInitializeRequest(req.body)) {
        sendJsonRpcError(res, 400, -32600, "Bad Request: expected an MCP initialize request.");
        return;
      }

      session = await createSession();
    }

    await session.transport.handleRequest(req, res, req.body);
  } catch (error) {
    handleServerError(res, error);
  }
});

app.get(config.mcpPath, async (req, res) => {
  const sessionId = singleHeader(req, "mcp-session-id");

  if (!sessionId && acceptsEventStream(req)) {
    await createSseSession(res, sseMessagePath);
    return;
  }

  await handleExistingSessionRequest(req, res);
});

app.delete(config.mcpPath, handleExistingSessionRequest);
app.get("/sse", async (_req, res) => {
  await createSseSession(res, "/messages");
});
app.post(sseMessagePath, handleSseMessageRequest);
app.post("/messages", handleSseMessageRequest);

app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    error: "not_found",
    message: `Use ${config.mcpPath} for MCP traffic or /health for health checks.`
  });
});

const httpServer = app.listen(config.port, () => {
  console.log(`G22 Scores MCP server listening on http://localhost:${config.port}${config.mcpPath}`);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function handleExistingSessionRequest(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = singleHeader(req, "mcp-session-id");

    if (!sessionId) {
      sendJsonRpcError(res, 400, -32600, "Bad Request: Mcp-Session-Id header is required.");
      return;
    }

    const session = streamableSessions.get(sessionId);

    if (!session) {
      sendJsonRpcError(res, 404, -32001, "Session not found.");
      return;
    }

    await session.transport.handleRequest(req, res);
  } catch (error) {
    handleServerError(res, error);
  }
}

async function createSession(): Promise<StreamableSession> {
  const server = createMcpServer();
  let transport: StreamableHTTPServerTransport;

  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (sessionId) => {
      streamableSessions.set(sessionId, { server, transport });
    }
  });

  transport.onclose = () => {
    const sessionId = transport.sessionId;

    if (sessionId) {
      streamableSessions.delete(sessionId);
    }

    void server.close();
  };

  await server.connect(transport);

  return { server, transport };
}

function createMcpServer(): McpServer {
  const client = new G22Client({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs
  });
  const server = new McpServer({
    name: "g22scores",
    version: "1.0.0"
  });

  registerG22Tools(server, client);

  return server;
}

async function createSseSession(res: Response, messagePath: string): Promise<void> {
  const server = createMcpServer();
  const transport = new SSEServerTransport(messagePath, res);

  transport.onclose = () => {
    sseSessions.delete(transport.sessionId);
    void server.close();
  };

  sseSessions.set(transport.sessionId, { server, transport });
  await server.connect(transport);
}

async function handleSseMessageRequest(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;

    if (!sessionId) {
      res.status(400).send("Missing sessionId query parameter.");
      return;
    }

    const session = sseSessions.get(sessionId);

    if (!session) {
      res.status(404).send("SSE session not found.");
      return;
    }

    await session.transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    handleServerError(res, error);
  }
}

function containsInitializeRequest(body: unknown): boolean {
  if (Array.isArray(body)) {
    return body.some((entry) => isInitializeRequest(entry));
  }

  return isInitializeRequest(body);
}

function singleHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function acceptsEventStream(req: Request): boolean {
  const accept = singleHeader(req, "accept") ?? "";
  return accept.includes("text/event-stream");
}

function joinPath(basePath: string, childPath: string): string {
  return `${basePath.replace(/\/+$/, "")}/${childPath.replace(/^\/+/, "")}`;
}

function sendJsonRpcError(
  res: Response,
  status: number,
  code: number,
  message: string
): void {
  if (res.headersSent) {
    res.end();
    return;
  }

  res.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null
  });
}

function handleServerError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);

  sendJsonRpcError(res, 500, -32603, message);
}

function shutdown(signal: string): void {
  console.log(`Received ${signal}; closing G22 Scores MCP server.`);

  for (const session of streamableSessions.values()) {
    void session.transport.close();
    void session.server.close();
  }

  for (const session of sseSessions.values()) {
    void session.transport.close();
    void session.server.close();
  }

  streamableSessions.clear();
  sseSessions.clear();
  httpServer.close(() => process.exit(0));
}
