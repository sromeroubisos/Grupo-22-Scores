import "dotenv/config";

export type AppConfig = {
  baseUrl: string;
  apiKey: string;
  port: number;
  mcpPath: string;
  timeoutMs: number;
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

export function loadConfig(): AppConfig {
  return {
    baseUrl: normalizeBaseUrl(readRequiredEnv("G22_BASE_URL")),
    apiKey: readRequiredEnv("G22_API_KEY"),
    port: readIntEnv("PORT", 3001),
    mcpPath: normalizePath(process.env.MCP_PATH ?? "/mcp"),
    timeoutMs: readIntEnv("G22_TIMEOUT_MS", 20000)
  };
}
