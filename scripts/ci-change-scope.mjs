import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA = /^[a-f0-9]{40}$/;
const full = (reason) => ({ runFull: true, reason, files: [] });

// A small allowlist: unknown paths, CI, tests, assets and executable Markdown
// always retain the complete checks. Never classify only the latest commit.
export function isDocumentationPath(filename) {
  if (typeof filename !== "string" || /[\\\u0000-\u001f\u007f\ufffd]/.test(filename)) return false;
  if (filename.split("/").some((part) => !part || part === "." || part === "..")) return false;
  return filename === "README.md" || /^docs\/.+\.md$/.test(filename);
}

export function classifyChanges({ eventName, event, cwd = process.cwd() }) {
  if (eventName !== "pull_request") return full("Main pushes and manual/unknown events run the full checks.");
  const base = event?.pull_request?.base?.sha;
  const head = event?.pull_request?.head?.sha;
  if (!SHA.test(base ?? "") || !SHA.test(head ?? "")) return full("Missing or invalid PR commit metadata.");
  const git = (...args) => execFileSync("git", args, {
    cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const mergeBase = git("merge-base", base, head).trim();
    if (!SHA.test(mergeBase)) return full("Unable to resolve the PR merge base.");
    const files = git("diff", "--no-renames", "--name-only", "-z", mergeBase, head, "--").split("\0").filter(Boolean);
    if (!files.length || files.some((file) => !isDocumentationPath(file))) {
      return { ...full("The PR includes runtime, tooling, policy or unknown paths."), files };
    }
    // Deletions are safe here. Symlinks, submodules and executable files are not
    // prose-only, regardless of their .md suffix.
    const entries = git("ls-tree", "-r", "-z", head, "--", ...files).split("\0").filter(Boolean);
    if (entries.some((entry) => !entry.startsWith("100644 blob "))) return full("Documentation includes a non-regular file.");
    return { runFull: false, reason: "Only regular README.md / docs Markdown changed.", files, mergeBase, head };
  } catch {
    return full("PR history or change scope could not be verified; keeping full checks.");
  }
}

export function runScope(env = process.env, cwd = process.cwd()) {
  let event;
  try { event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")); } catch { /* Full checks without a usable event. */ }
  const result = classifyChanges({ eventName: env.GITHUB_EVENT_NAME, event, cwd });
  if (!result.runFull) {
    // A docs result still performs a real check; failures fail the job rather
    // than reporting an untested success. Public Safety runs independently.
    execFileSync("git", ["diff", "--check", result.mergeBase, result.head, "--"], { cwd, stdio: "inherit" });
  }
  const label = result.runFull ? "FULL" : "DOCS_ONLY";
  console.log(`CI scope: ${label}. ${result.reason} (${result.files.length} changed paths)`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `run_full=${result.runFull}\n`);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY,
    `## CI scope: ${label}\n\n${result.reason}\n\n${result.runFull
      ? "The existing build, runtime and integration checks remain enabled."
      : "Checked the complete PR diff for whitespace errors. Heavy runtime checks are not executed for this prose-only PR; Public repository safety still runs. Main pushes and manual runs remain full."}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runScope();
