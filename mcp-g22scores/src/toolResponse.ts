import { G22HttpError } from "./g22Client.js";
import type { ApiToolOutput } from "./schemas.js";

type McpToolContent = {
  type: "text";
  text: string;
};

export type McpToolResult = {
  content: McpToolContent[];
  structuredContent: ApiToolOutput;
  isError?: boolean;
};

export function successResult(endpoint: string, httpStatus: number, apiResponse: unknown): McpToolResult {
  const structuredContent: ApiToolOutput = {
    ok: true,
    endpoint,
    http_status: httpStatus,
    api_response: apiResponse
  };

  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent
  };
}

export function errorResult(endpoint: string, error: unknown): McpToolResult {
  const structuredContent = error instanceof G22HttpError
    ? fromHttpError(error)
    : fromGenericError(endpoint, error);

  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
    isError: true
  };
}

function fromHttpError(error: G22HttpError): ApiToolOutput {
  const code = detectKnownErrorCode(error.status, error.body);

  return {
    ok: false,
    endpoint: error.endpoint,
    http_status: error.status,
    api_response: error.body,
    error: {
      code,
      message: messageForKnownError(code, error.status),
      details: error.body
    }
  };
}

function fromGenericError(endpoint: string, error: unknown): ApiToolOutput {
  return {
    ok: false,
    endpoint,
    error: {
      code: "request_failed",
      message: error instanceof Error ? error.message : String(error)
    }
  };
}

function detectKnownErrorCode(status: number, body: unknown): string {
  const apiCode = extractApiCode(body);

  if (status === 401) {
    return "unauthorized";
  }

  if (status === 404 && isHtmlLikeBody(body)) {
    return "endpoint_not_found";
  }

  if (status === 404) {
    return apiCode ?? "match_not_found";
  }

  if (status === 409 && (apiCode === "match_ambiguous" || apiCode === "teams_reversed")) {
    return apiCode;
  }

  if (status === 409) {
    return "conflict";
  }

  return apiCode ?? "http_error";
}

function extractApiCode(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const record = body as Record<string, unknown>;

  if (typeof record.code === "string") {
    return record.code;
  }

  if (typeof record.error === "string") {
    return record.error;
  }

  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;

    if (typeof nested.code === "string") {
      return nested.code;
    }

    if (typeof nested.type === "string") {
      return nested.type;
    }
  }

  if (typeof record.type === "string") {
    return record.type;
  }

  return undefined;
}

function isHtmlLikeBody(body: unknown): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }

  const record = body as Record<string, unknown>;
  const contentType = typeof record.content_type === "string" ? record.content_type.toLowerCase() : "";
  const preview = typeof record.body_preview === "string" ? record.body_preview.trim().toLowerCase() : "";

  return contentType.includes("text/html") || preview.startsWith("<!doctype html") || preview.startsWith("<html");
}

function messageForKnownError(code: string, status: number): string {
  switch (code) {
    case "unauthorized":
      return "La API de G22 rechazo la credencial. Revisar G22_API_KEY.";
    case "match_not_found":
      return "La API de G22 no encontro ningun partido con esos criterios.";
    case "match_ambiguous":
      return "La API de G22 encontro mas de un partido posible. Agregar match_id o mas filtros.";
    case "teams_reversed":
      return "La API de G22 detecto los equipos invertidos. Confirmar local/visitante antes de actualizar.";
    case "endpoint_not_found":
      return "El endpoint REST no existe o no esta desplegado en la URL configurada.";
    case "conflict":
      return "La API de G22 devolvio un conflicto HTTP 409.";
    default:
      return `La API de G22 devolvio HTTP ${status}.`;
  }
}
