type SocialEntry = Readonly<{ label: string; handle: string }>;

const MAX_SOCIAL_URL_LENGTH = 2048;

export function findQqContact(entries: readonly SocialEntry[]): string | null {
  const entry = entries.find(({ label, handle }) => (
    label.trim().toUpperCase() === "QQ" && handle.trim().length > 0
  ));
  return entry?.handle.trim() ?? null;
}
export function getSafeSocialUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_SOCIAL_URL_LENGTH) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
