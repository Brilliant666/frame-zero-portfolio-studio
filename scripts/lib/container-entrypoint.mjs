// Docker Engine 29 / API 1.52+ omits empty Entrypoint fields in image inspect.
// Only absent, null and empty arrays represent no entrypoint in this contract.
export function hasNoContainerEntrypoint(config) {
  if (config === null || typeof config !== "object" || Array.isArray(config)) return false;
  const entrypoint = config.Entrypoint;
  return entrypoint === undefined || entrypoint === null
    || (Array.isArray(entrypoint) && entrypoint.length === 0);
}
