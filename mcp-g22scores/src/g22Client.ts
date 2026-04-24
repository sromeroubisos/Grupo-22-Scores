export type JsonObject = Record<string, unknown>;

export type G22ApiResponse = {
  status: number;
  body: unknown;
};

export class G22HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly endpoint: string;

  constructor(endpoint: string, status: number, body: unknown) {
    super(`G22 API request failed with HTTP ${status}`);
    this.name = "G22HttpError";
    this.status = status;
    this.body = body;
    this.endpoint = endpoint;
  }
}

export type G22ClientOptions = {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

export class G22Client {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: G22ClientOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
  }

  async post(endpoint: string, payload: JsonObject): Promise<G22ApiResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(stripUndefined(payload)),
        signal: controller.signal
      });

      const body = await readResponseBody(response);

      if (!response.ok) {
        throw new G22HttpError(endpoint, response.status, body);
      }

      return {
        status: response.status,
        body
      };
    } catch (error) {
      if (error instanceof G22HttpError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`G22 API request timed out after ${this.timeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([entryKey, entryValue]) => [entryKey, stripUndefined(entryValue)])
    );
  }

  return value;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return JSON.parse(text);
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      content_type: contentType || null,
      body_preview: text.slice(0, 1000)
    };
  }
}
