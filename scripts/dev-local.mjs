#!/usr/bin/env node

import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const STOP_TIMEOUT_MS = 3_000;

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child, timeoutMs) {
  if (hasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(value);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
    child.once("exit", onExit);
  });
}

export function windowsTaskkillArguments(pid) {
  if (!Number.isInteger(pid) || pid < 1) throw new TypeError("A positive child PID is required");
  return ["/PID", String(pid), "/T", "/F"];
}

export async function stopChildProcess(child, {
  graceful = false,
  platform = process.platform,
  execFileImpl = execFileAsync,
  waitForExitImpl = waitForExit,
} = {}) {
  if (!child || hasExited(child)) return;

  if (graceful && child.connected && typeof child.send === "function") {
    try {
      child.send({ type: "shutdown" });
      if (await waitForExitImpl(child, STOP_TIMEOUT_MS)) return;
    } catch {
      // Fall through to process-tree termination.
    }
  }

  if (!Number.isInteger(child.pid) || child.pid < 1) return;
  if (platform === "win32") {
    try {
      await execFileImpl("taskkill.exe", windowsTaskkillArguments(child.pid), {
        timeout: STOP_TIMEOUT_MS,
        windowsHide: true,
      });
    } catch {
      // Re-check before falling back to direct child termination.
    }
    if (hasExited(child) || await waitForExitImpl(child, STOP_TIMEOUT_MS)) return;
    try {
      child.kill("SIGTERM");
    } catch {
      // A final liveness check below distinguishes an exit race from failure.
    }
    if (hasExited(child) || await waitForExitImpl(child, STOP_TIMEOUT_MS)) return;
    throw new Error("Unable to stop a local development child process");
  }

  try {
    child.kill("SIGTERM");
  } catch {
    return;
  }
  if (await waitForExitImpl(child, STOP_TIMEOUT_MS)) return;
  try {
    child.kill("SIGKILL");
  } catch {
    // The child exited after the timeout check.
  }
}

export function createDevLocalSupervisor({
  projectRoot,
  nodeExecutable = process.execPath,
  reportError = console.error,
  spawnProcess = spawn,
  stopProcess = stopChildProcess,
} = {}) {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") {
    throw new TypeError("projectRoot is required");
  }

  const resolvedProjectRoot = path.resolve(projectRoot);
  const vinextCli = path.join(resolvedProjectRoot, "node_modules", "vinext", "dist", "cli.js");
  const serviceScript = path.join(resolvedProjectRoot, "scripts", "photo-import-server.mjs");
  const children = new Map();
  let started = false;
  let shutdownPromise = null;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });

  function spawnNamed(name, args, stdio) {
    const child = spawnProcess(nodeExecutable, args, {
      cwd: resolvedProjectRoot,
      detached: false,
      env: process.env,
      stdio,
      windowsHide: true,
    });
    children.set(name, child);
    child.once("error", () => {
      void shutdown({ exitCode: 1, reason: `${name}-spawn-error` });
    });
    child.once("exit", (code, signal) => {
      if (shutdownPromise) return;
      const exitCode = Number.isInteger(code) && code > 0 ? code : 1;
      void shutdown({ exitCode, reason: `${name}-exit-${signal ?? code ?? "unknown"}` });
    });
    return child;
  }

  function start() {
    if (started) throw new Error("The local development supervisor has already started");
    started = true;
    try {
      spawnNamed(
        "web",
        [vinextCli, "dev", "--hostname", "127.0.0.1", "--port", "3001"],
        "inherit",
      );
      spawnNamed(
        "photo-import",
        [serviceScript],
        ["inherit", "inherit", "inherit", "ipc"],
      );
    } catch {
      void shutdown({ exitCode: 1, reason: "spawn-error" });
    }
    return done;
  }

  function shutdown({ exitCode = 0, reason = "requested" } = {}) {
    if (shutdownPromise) return shutdownPromise;
    let resolveShutdown;
    let rejectShutdown;
    shutdownPromise = new Promise((resolve, reject) => {
      resolveShutdown = resolve;
      rejectShutdown = reject;
    });
    void (async () => {
      try {
        const runningChildren = [...children.entries()];
        const cleanupResults = await Promise.allSettled(runningChildren.map(([name, child]) => stopProcess(child, {
          graceful: name === "photo-import",
          name,
          reason,
        })));
        const cleanupFailed = cleanupResults.some((result) => result.status === "rejected");
        const finalExitCode = cleanupFailed ? 1 : exitCode;
        if (cleanupFailed) reportError("Unable to stop every local development child process.");
        resolveDone(finalExitCode);
        resolveShutdown(finalExitCode);
      } catch (error) {
        rejectShutdown(error);
      }
    })();
    return shutdownPromise;
  }

  return {
    children,
    done,
    shutdown,
    start,
  };
}

export async function runDevLocal({
  projectRoot,
  processObject = process,
  supervisorFactory = createDevLocalSupervisor,
} = {}) {
  const supervisor = supervisorFactory({ projectRoot });
  let signalCount = 0;

  const handleSignal = (signal) => {
    signalCount += 1;
    if (signalCount > 1) {
      processObject.exitCode = signal === "SIGINT" ? 130 : 143;
      return;
    }
    void supervisor.shutdown({
      exitCode: signal === "SIGINT" ? 130 : 143,
      reason: signal,
    });
  };
  const onSigint = () => handleSignal("SIGINT");
  const onSigterm = () => handleSignal("SIGTERM");
  processObject.on("SIGINT", onSigint);
  processObject.on("SIGTERM", onSigterm);

  try {
    const exitCode = await supervisor.start();
    processObject.exitCode = exitCode;
    return exitCode;
  } finally {
    processObject.off("SIGINT", onSigint);
    processObject.off("SIGTERM", onSigterm);
  }
}

const scriptPath = fileURLToPath(import.meta.url);
const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(scriptPath).href;

if (isMain) {
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  await runDevLocal({ projectRoot });
}
