export type AutosaveInput = {
  enabled: boolean;
  dirty: boolean;
  /** Anything that makes a save unsafe or meaningless: loading, saving, conflict, pending confirmation, open pickers. */
  blocked: boolean;
  /** Identity of the current draft; a failed attempt is never retried for the same draft. */
  version: unknown;
  failedVersion: unknown;
};

/** Pure decision, kept separate from timers so it can be tested without React. */
export function shouldAutosave({ enabled, dirty, blocked, version, failedVersion }: AutosaveInput) {
  return enabled && dirty && !blocked && version !== failedVersion;
}
