export function reviewedHistoryMetadata(text) {
  return text.split(/\r?\n/)
    // Git's object ID line is structural; indented commit messages stay scanned.
    .filter(line => !/^commit (?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(line))
    // Only the exact public attribution value is exempt, with Git trailer casing.
    .filter(line => !/^    [Cc][Oo]-[Aa][Uu][Tt][Hh][Oo][Rr][Ee][Dd]-[Bb][Yy]: Claude Code <noreply@anthropic[.]com>$/.test(line))
    .join('\n');
}
