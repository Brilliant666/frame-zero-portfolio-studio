import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
import { readAccountConfig } from "./lib/account-config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, target = "development", ...extra] = process.argv.slice(2);
const targets = {
  development: { file: ".env.accounts.local", port: 55432, database: "frame_zero_accounts", origin: 3003 },
  test: { file: ".env.accounts.test", port: 55433, database: "frame_zero_accounts_test", origin: 3004 },
};

function docker(args, timeout = 30_000) {
  return new Promise((accept, reject) => {
    const child = spawn("docker", args, { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Docker operation timed out; daemon was not restarted and volumes were not removed."));
    }, timeout);
    child.stdout.on("data", (chunk) => { if (output.length < 65_536) output += chunk; });
    // Docker errors may echo environment values; deliberately do not relay them.
    child.stderr.resume();
    child.on("error", () => { clearTimeout(timer); reject(new Error("Docker executable is unavailable.")); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) accept(output);
      else reject(new Error("Docker operation failed; inspect Docker locally. No volume deletion was requested."));
    });
  });
}

function compose(args, timeout) {
  return docker(["compose", "--project-name", "frame-zero-accounts", "--file", "compose.accounts.yml", ...args], timeout);
}

async function requireFreePort(port) {
  await new Promise((accept, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`Local port ${port} is occupied; no existing service was stopped.`)));
    server.listen(port, "127.0.0.1", () => server.close(accept));
  });
}

function init() {
  for (const item of Object.values(targets)) {
    try {
      execFileSync("git", ["check-ignore", "--quiet", item.file], { cwd: root, windowsHide: true, stdio: "ignore", timeout: 5_000 });
    } catch {
      throw new Error("Account environment files must be gitignored before initialization.");
    }
  }
  for (const item of Object.values(targets)) {
    const path = resolve(root, item.file);
    if (existsSync(path)) { console.log(`${item.file}: preserved existing configuration.`); continue; }
    const password = randomBytes(32).toString("hex");
    const secret = randomBytes(48).toString("hex");
    const contents = [
      "# Private local account environment. Never commit this file.",
      "FRAME_ZERO_LOCAL_ACCOUNTS=1",
      `FRAME_ZERO_ACCOUNT_DATABASE_URL=postgresql://frame_zero_operator:${password}@127.0.0.1:${item.port}/${item.database}`,
      `FRAME_ZERO_ACCOUNT_SECRET=${secret}`,
      `FRAME_ZERO_ACCOUNT_ORIGIN=http://127.0.0.1:${item.origin}`,
      "POSTGRES_USER=frame_zero_operator",
      `POSTGRES_PASSWORD=${password}`,
      `POSTGRES_DB=${item.database}`,
      "",
    ].join("\n");
    writeFileSync(path, contents, { flag: "wx", mode: 0o600 });
    console.log(`${item.file}: created private credentials (not displayed).`);
  }
}

async function main() {
  if (extra.length || !Object.hasOwn(targets, target) || !["init", "status", "up", "stop"].includes(command)) {
    throw new Error("Usage: node scripts/account-db.mjs <init|status|up|stop> [development|test]");
  }
  if (command === "init") return init();
  const item = targets[target];
  if (!existsSync(resolve(root, item.file))) throw new Error("Run account-db.mjs init first.");
  loadEnvFile(resolve(root, item.file));
  const config = readAccountConfig();
  if (config.isTest !== (target === "test")) throw new Error("Environment and requested database target disagree.");
  if (command === "status") {
    const output = await compose(["ps", "--format", "json", target]);
    const lines = output.trim();
    if (!lines) { console.log(`${target}: stopped or not created.`); return; }
    const records = lines.startsWith("[") ? JSON.parse(lines) : lines.split(/\r?\n/).map((line) => JSON.parse(line));
    for (const record of records) console.log(`${target}: ${record.State ?? "unknown"}; health=${record.Health ?? "unknown"}; loopback port=${item.port}`);
  } else if (command === "stop") {
    await compose(["stop", "--timeout", "15", target], 25_000);
    console.log(`${target}: stopped; persistent volume retained.`);
  } else {
    const running = (await compose(["ps", "--status", "running", "--quiet", target])).trim();
    if (!running) await requireFreePort(item.port);
    await compose(["up", "--detach", "--wait", "--wait-timeout", "60", target], 120_000);
    console.log(`${target}: healthy on 127.0.0.1:${item.port}; persistent project volume retained.`);
  }
}

main().catch((error) => {
  // Never print exception causes, configuration objects, or Docker stderr.
  console.error(error instanceof Error && /^(Usage:|Docker |Local port |Environment |Run account-|Local accounts |Invalid local |Account )/.test(error.message)
    ? error.message : "Local database command failed; no credentials were printed.");
  process.exitCode = 1;
});
