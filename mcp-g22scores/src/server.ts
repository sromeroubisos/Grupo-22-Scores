import { createHash, timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { G22Client } from "./g22Client.js";
import { registerG22Tools } from "./tools.js";

type SseSession = {
  server: McpServer;
  transport: SSEServerTransport;
};

const config = loadConfig();
const sseSessions = new Map<string, SseSession>();
const sseMessagePath = joinPath(config.mcpPath, "messages");
const app = express();

app.disable("x-powered-by");

// La auth va ANTES del parser de JSON: un pedido sin token no llega a que se
// lea su body. /health queda abierto (no expone nada) para el hosting.
const expectedTokenHash = config.inboundToken ? sha256(config.inboundToken) : null;
app.use([config.mcpPath, sseMessagePath, "/sse", "/messages"], requireInboundAuth);

app.use(express.json({ limit: "1mb", type: ["application/json", "application/*+json"] }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "g22scores-mcp-server",
    mcp_path: config.mcpPath,
    transport: "streamable_http_stateless",
    sse_message_path: sseMessagePath,
    tools: ["search_match", "update_result"]
  });
});

app.options(config.mcpPath, (_req, res) => {
  // (Ya paso por requireInboundAuth, que deja pasar el preflight sin token.)
  res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
  res.status(204).end();
});

app.post(config.mcpPath, async (req, res) => {
  await handleStreamableHttpRequest(req, res);
});

app.get(config.mcpPath, async (req, res) => {
  if (acceptsEventStream(req) && !singleHeader(req, "mcp-protocol-version")) {
    await createSseSession(res, sseMessagePath);
    return;
  }

  sendJsonRpcError(res, 405, -32000, "Method not allowed. Send MCP JSON-RPC requests with POST.");
});

app.delete(config.mcpPath, (_req, res) => {
  sendJsonRpcError(res, 405, -32000, "Method not allowed. This MCP endpoint is stateless.");
});

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

const httpServer = app.listen(config.port, config.host, () => {
  console.log(
    `G22 Scores MCP server listening on http://${config.host}:${config.port}${config.mcpPath}` +
      (config.inboundToken ? " (inbound auth: bearer token)" : " (inbound auth: DISABLED)")
  );
});

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Authorization: Bearer <MCP_INBOUND_TOKEN>. Se comparan los SHA-256 con
 * timingSafeEqual: los dos buffers miden siempre 32 bytes (timingSafeEqual
 * exige igual largo) y el tiempo no filtra cuantos caracteres coinciden.
 */
function requireInboundAuth(req: Request, res: Response, next: NextFunction): void {
  if (!expectedTokenHash || req.method === "OPTIONS") {
    next();
    return;
  }

  const header = singleHeader(req, "authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const provided = match?.[1]?.trim() ?? "";

  if (provided && timingSafeEqual(sha256(provided), expectedTokenHash)) {
    next();
    return;
  }

  res.setHeader("WWW-Authenticate", 'Bearer realm="g22scores-mcp"');
  sendJsonRpcError(res, 401, -32001, "Unauthorized.");
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function handleStreamableHttpRequest(req: Request, res: Response): Promise<void> {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  let closed = false;
  const close = () => {
    if (closed) {
      return;
    }

    closed = true;
    void transport.close();
    void server.close();
  };

  try {
    res.on("close", close);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    handleServerError(res, error);
  } finally {
    close();
  }
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
  // Cada sesion SSE es una conexion abierta con su propio McpServer: sin tope,
  // un cliente que abre y no cierra se come la memoria del proceso.
  if (sseSessions.size >= config.maxSseSessions) {
    res.setHeader("Retry-After", "30");
    sendJsonRpcError(res, 503, -32000, "Too many open SSE sessions. Try again later.");
    return;
  }

  const server = createMcpServer();
  const transport = new SSEServerTransport(messagePath, res);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) {
      return;
    }

    cleaned = true;
    sseSessions.delete(transport.sessionId);
    void server.close();
  };

  transport.onclose = cleanup;
  // onclose no siempre se dispara si el cliente corta la conexion de golpe:
  // el "close" de la respuesta HTTP es la red de seguridad.
  res.on("close", () => {
    cleanup();
    void transport.close();
  });

  sseSessions.set(transport.sessionId, { server, transport });

  try {
    await server.connect(transport);
  } catch (error) {
    cleanup();
    handleServerError(res, error);
  }
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

  for (const session of sseSessions.values()) {
    void session.transport.close();
    void session.server.close();
  }

  sseSessions.clear();
  httpServer.close(() => process.exit(0));
}
