import { execFileSync, spawnSync } from "node:child_process";

const repository = process.argv[2];
const branches = process.argv.slice(3);
const gh = process.env.GH_BIN || "gh";
const MAX_BUFFER = 64 * 1024 * 1024;

if (!repository || branches.length === 0) {
  throw new Error("Usage: publish-git-data-api.mjs OWNER/REPO BRANCH [BRANCH ...]");
}

function gitText(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: MAX_BUFFER }).trim();
}

function gitBuffer(...args) {
  return execFileSync("git", args, { encoding: null, maxBuffer: MAX_BUFFER });
}

function ghApi(endpoint, { method = "GET", body, allowFailure = false } = {}) {
  const args = ["api"];
  if (method !== "GET") args.push("--method", method);
  args.push(endpoint);
  if (body !== undefined) args.push("--input", "-");

  const result = spawnSync(gh, args, {
    encoding: "utf8",
    input: body === undefined ? undefined : JSON.stringify(body),
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
  });

  if (result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(`GitHub API ${method} ${endpoint} failed: ${result.stderr.trim()}`);
  }

  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}

function parseBatchTypes(shas) {
  const result = spawnSync("git", ["cat-file", "--batch-check=%(objectname) %(objecttype)"], {
    encoding: "utf8",
    input: `${shas.join("\n")}\n`,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return new Map(result.stdout.trim().split(/\r?\n/).map((line) => line.split(" ")));
}

function parseIdentity(line) {
  const match = /^(.*) <([^<>]+)> (\d+) ([+-])(\d{2})(\d{2})$/.exec(line);
  if (!match) throw new Error(`Unable to parse Git identity: ${line}`);

  const offsetMinutes = (Number(match[5]) * 60 + Number(match[6])) * (match[4] === "+" ? 1 : -1);
  const localTime = new Date(Number(match[3]) * 1000 + offsetMinutes * 60_000)
    .toISOString()
    .replace("Z", `${match[4]}${match[5]}:${match[6]}`);

  return { name: match[1], email: match[2], date: localTime };
}

function parseCommit(localSha) {
  const raw = gitBuffer("cat-file", "commit", localSha).toString("utf8");
  const separator = raw.indexOf("\n\n");
  if (separator === -1) throw new Error(`Malformed commit object: ${localSha}`);

  const headers = raw.slice(0, separator).split("\n");
  const author = headers.find((line) => line.startsWith("author "))?.slice(7);
  const committer = headers.find((line) => line.startsWith("committer "))?.slice(10);
  if (!author || !committer) throw new Error(`Commit identity missing: ${localSha}`);

  return {
    message: raw.slice(separator + 2),
    author: parseIdentity(author),
    committer: parseIdentity(committer),
  };
}

function parseTree(localTreeSha) {
  const raw = gitBuffer("ls-tree", "-r", "-z", localTreeSha).toString("utf8");
  return raw.split("\0").filter(Boolean).map((entry) => {
    const tab = entry.indexOf("\t");
    const [mode, type, sha] = entry.slice(0, tab).split(" ");
    return { path: entry.slice(tab + 1), mode, type, sha };
  });
}

const objectLines = gitText("rev-list", "--objects", ...branches).split(/\r?\n/).filter(Boolean);
const objectShas = [...new Set(objectLines.map((line) => line.split(" ", 1)[0]))];
const objectTypes = parseBatchTypes(objectShas);
const blobShas = objectShas.filter((sha) => objectTypes.get(sha) === "blob");
const commits = gitText("rev-list", "--topo-order", "--reverse", ...branches).split(/\r?\n/).filter(Boolean);
const localTrees = [...new Set(commits.map((sha) => gitText("show", "-s", "--format=%T", sha)))];

let seedBranch = null;
const existingBranches = ghApi(`repos/${repository}/branches?per_page=1`);
if (Array.isArray(existingBranches) && existingBranches.length === 0) {
  ghApi(`repos/${repository}/contents/.frame-zero-seed`, {
    method: "PUT",
    body: {
      message: "chore: initialize repository transport",
      content: Buffer.from("Temporary transport seed.\n").toString("base64"),
    },
  });
  seedBranch = ghApi(`repos/${repository}`).default_branch;
  console.log(`Initialized temporary seed branch: ${seedBranch}`);
}

console.log(`Publishing ${blobShas.length} blobs, ${localTrees.length} trees, and ${commits.length} commits through GitHub Git Data API.`);

for (let index = 0; index < blobShas.length; index += 1) {
  const localSha = blobShas[index];
  const content = gitBuffer("cat-file", "blob", localSha).toString("base64");
  const created = ghApi(`repos/${repository}/git/blobs`, {
    method: "POST",
    body: { content, encoding: "base64" },
  });
  if (created.sha !== localSha) throw new Error(`Blob SHA mismatch: ${localSha} != ${created.sha}`);
  if ((index + 1) % 20 === 0 || index + 1 === blobShas.length) console.log(`Blobs ${index + 1}/${blobShas.length}`);
}

for (let index = 0; index < localTrees.length; index += 1) {
  const localSha = localTrees[index];
  const created = ghApi(`repos/${repository}/git/trees`, {
    method: "POST",
    body: { tree: parseTree(localSha) },
  });
  if (created.sha !== localSha) throw new Error(`Tree SHA mismatch: ${localSha} != ${created.sha}`);
  if ((index + 1) % 10 === 0 || index + 1 === localTrees.length) console.log(`Trees ${index + 1}/${localTrees.length}`);
}

const remoteCommits = new Map();
for (let index = 0; index < commits.length; index += 1) {
  const localSha = commits[index];
  const tree = gitText("show", "-s", "--format=%T", localSha);
  const parents = gitText("show", "-s", "--format=%P", localSha)
    .split(" ")
    .filter(Boolean)
    .map((parent) => remoteCommits.get(parent) ?? parent);
  const created = ghApi(`repos/${repository}/git/commits`, {
    method: "POST",
    body: { ...parseCommit(localSha), tree, parents },
  });
  if (created.sha !== localSha) throw new Error(`Commit SHA mismatch: ${localSha} != ${created.sha}`);
  remoteCommits.set(localSha, created.sha);
  console.log(`Commits ${index + 1}/${commits.length}: ${localSha.slice(0, 7)}`);
}

for (const branch of branches) {
  const localSha = gitText("rev-parse", branch);
  const refEndpoint = `repos/${repository}/git/refs/heads/${branch}`;
  const existing = ghApi(refEndpoint, { allowFailure: true });
  if (existing) {
    if (existing.object?.sha !== localSha) {
      ghApi(refEndpoint, { method: "PATCH", body: { sha: localSha, force: false } });
    }
  } else {
    ghApi(`repos/${repository}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: localSha },
    });
  }
  execFileSync("git", ["update-ref", `refs/remotes/origin/${branch}`, localSha]);
  execFileSync("git", ["branch", `--set-upstream-to=origin/${branch}`, branch], { stdio: "ignore" });
  console.log(`Branch ${branch} -> ${localSha.slice(0, 7)}`);
}

ghApi(`repos/${repository}`, {
  method: "PATCH",
  body: { default_branch: "codex/template-gallery" },
});

if (seedBranch && !branches.includes(seedBranch)) {
  ghApi(`repos/${repository}/git/refs/heads/${seedBranch}`, { method: "DELETE" });
  console.log(`Removed temporary seed branch: ${seedBranch}`);
}

console.log(`Git Data API publication complete: https://github.com/${repository}`);
