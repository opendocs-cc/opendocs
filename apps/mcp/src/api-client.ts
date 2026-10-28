import { config } from "./config";

/**
 * A small typed client for the OpenDocs REST API, called as the signed-in
 * user with their MCP access token. Every tool goes through it, so plan
 * limits, permissions, version history and audit events behave exactly as
 * they do for the CLI.
 */

export type ApiErrorBody = {
  error?: string;
  message?: string;
  error_description?: string;
  [key: string]: unknown;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message ?? body.error_description ?? body.error ?? `HTTP ${status}`);
  }
  get code(): string {
    return this.body.error ?? `http_${this.status}`;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export class ApiClient {
  constructor(
    private readonly token: string,
    private readonly client: string,
  ) {}

  private url(path: string, query?: Query): string {
    const url = new URL(`${config.apiUrl}/api/v1${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async request<T>(
    method: string,
    path: string,
    options: { query?: Query; body?: unknown; timeoutMs?: number } = {},
  ): Promise<T> {
    const res = await fetch(this.url(path, options.query), {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "X-OpenDocs-Client": this.client,
        "User-Agent": `opendocs-mcp/${config.version}`,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text.slice(0, 500) };
      }
    }
    if (!res.ok) {
      throw new ApiError(res.status, (data as ApiErrorBody) ?? {});
    }
    return data as T;
  }

  get<T>(path: string, query?: Query) {
    return this.request<T>("GET", path, { query });
  }
  post<T>(path: string, body?: unknown, query?: Query, timeoutMs?: number) {
    return this.request<T>("POST", path, { body: body ?? {}, query, timeoutMs });
  }
  put<T>(path: string, body?: unknown, query?: Query) {
    return this.request<T>("PUT", path, { body: body ?? {}, query });
  }
  patch<T>(path: string, body?: unknown, query?: Query) {
    return this.request<T>("PATCH", path, { body: body ?? {}, query });
  }
  delete<T>(path: string, body?: unknown, query?: Query) {
    return this.request<T>("DELETE", path, { body, query });
  }
}
