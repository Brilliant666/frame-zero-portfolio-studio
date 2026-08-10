interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  raw<T = unknown>(): Promise<T[]>;
  run<T = unknown>(): Promise<T>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

declare module "cloudflare:workers" {
  export const env: Readonly<Record<string, unknown>>;
}
