export function canOpenCollectionProof(mode: string, hostname: string, search: string) {
  return mode === "development"
    && (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")
    && new URLSearchParams(search).get("collections") === "preview";
}
