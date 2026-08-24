const MAX_SOCIAL_INPUT_LENGTH = 2048;
const SOCIAL_URL_PATTERN = /https:\/\/[^\s<>"'`，。；：！？）】》」』]+/giu;
const TRAILING_SHARE_PUNCTUATION = /[.,;:!?\])}，。；：！？）】》」』]+$/u;

export function getSafeSocialUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_SOCIAL_INPUT_LENGTH) return null;

  const matches = candidate.match(SOCIAL_URL_PATTERN);
  if (!matches || matches.length !== 1) return null;
  const urlCandidate = matches[0].replace(TRAILING_SHARE_PUNCTUATION, "");
  if (!urlCandidate || urlCandidate.length > MAX_SOCIAL_INPUT_LENGTH) return null;

  try {
    const url = new URL(urlCandidate);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
