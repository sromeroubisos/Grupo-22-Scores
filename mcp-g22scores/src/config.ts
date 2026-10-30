import "dotenv/config";

export type AppConfig = {
  baseUrl: string;
  apiKey: string;
  port: number;
  mcpPath: string;
  timeoutMs: number;
  /**
   * Token que tiene que mandar el CLIENTE de este MCP (no confundir con
   * G22_API_KEY, que es la que este servidor manda a la API). null solo con
   * MCP_ALLOW_NO_AUTH=true.
   */
  inboundToken: string | null;
  /** Interfaz donde escucha: sin auth, solo loopback. */
  host: string;
  /** Tope de sesiones SSE vivas a la vez. */
  maxSseSessions: number;
};

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }

  return value;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function normalizePath(path: string): string {
  const trimmed = path.trim();

  if (!trimmed) {
    return "/mcp";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * La auth de entrada es obligatoria. Antes el servidor no pedia nada: quien
 * conociera la URL podia llamar a `update_result` y cambiar marcadores con la
 * API key del servidor. Si falta MCP_INBOUND_TOKEN el proceso no arranca
 * (falla cerrado). Para desarrollo local se puede apagar con
 * MCP_ALLOW_NO_AUTH=true explicito, y en ese caso escucha solo en 127.0.0.1
 * para que no quede expuesto en la red.
 */
function readInboundAuth(): { inboundToken: string | null; host: string } {
  const token = process.env.MCP_INBOUND_TOKEN?.trim() ?? "";
  const allowNoAuth = process.env.MCP_ALLOW_NO_AUTH?.trim() === "true";

  if (token) {
    if (token.length < 32) {
      throw new Error("MCP_INBOUND_TOKEN must be at least 32 characters long.");
    }

    return { inboundToken: token, host: process.env.HOST?.trim() || "0.0.0.0" };
  }

  if (allowNoAuth) {
    console.warn("MCP_ALLOW_NO_AUTH=true: inbound auth DISABLED, binding to 127.0.0.1 only.");
    return { inboundToken: null, host: "127.0.0.1" };
  }

  throw new Error(
    "Missing required environment variable: MCP_INBOUND_TOKEN (set MCP_ALLOW_NO_AUTH=true only for local development)."
  );
}

export function loadConfig(): AppConfig {
  const { inboundToken, host } = readInboundAuth();

  return {
    inboundToken,
    host,
    maxSseSessions: readIntEnv("MCP_MAX_SSE_SESSIONS", 20),
    baseUrl: normalizeBaseUrl(readRequiredEnv("G22_BASE_URL")),
    apiKey: readRequiredEnv("G22_API_KEY"),
    port: readIntEnv("PORT", 3001),
    mcpPath: normalizePath(process.env.MCP_PATH ?? "/mcp"),
    timeoutMs: readIntEnv("G22_TIMEOUT_MS", 20000)
  };
}
