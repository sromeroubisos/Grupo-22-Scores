import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { G22Client } from "./g22Client.js";
import { registerG22Tools } from "./tools.js";

type Session = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

const config = loadConfig();
const sessions = new Map<string, Session>();
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb", type: ["application/json", "application/*+json"] }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "g22scores-mcp-server",
    mcp_path: config.mcpPath
  });
});

app.options(config.mcpPath, (_req, res) => {
  res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
  res.status(204).end();
});

app.post(config.mcpPath, async (req, res) => {
  try {
    const sessionId = singleHeader(req, "mcp-session-id");
    let session = sessionId ? sessions.get(sessionId) : undefined;

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

app.get(config.mcpPath, handleExistingSessionRequest);
app.delete(config.mcpPath, handleExistingSessionRequest);

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

    const session = sessions.get(sessionId);

    if (!session) {
      sendJsonRpcError(res, 404, -32001, "Session not found.");
      return;
    }

    await session.transport.handleRequest(req, res);
  } catch (error) {
    handleServerError(res, error);
  }
}

async function createSession(): Promise<Session> {
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

  let transport: StreamableHTTPServerTransport;

  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (sessionId) => {
      sessions.set(sessionId, { server, transport });
    }
  });

  transport.onclose = () => {
    const sessionId = transport.sessionId;

    if (sessionId) {
      sessions.delete(sessionId);
    }

    void server.close();
  };

  await server.connect(transport);

  return { server, transport };
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

  for (const session of sessions.values()) {
    void session.transport.close();
    void session.server.close();
  }

  sessions.clear();
  httpServer.close(() => process.exit(0));
}
