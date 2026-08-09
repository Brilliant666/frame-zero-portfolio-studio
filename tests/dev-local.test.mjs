import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import test from "node:test";
import {
  createDevLocalSupervisor,
  runDevLocal,
  stopChildProcess,
  windowsTaskkillArguments,
} from "../scripts/dev-local.mjs";

class FakeChild extends EventEmitter {
  constructor(pid, { connected = false } = {}) {
    super();
    this.connected = connected;
    this.exitCode = null;
    this.pid = pid;
    this.sent = [];
    this.signalCode = null;
  }

  send(message) {
    this.sent.push(message);
  }

  finish(code = 0, signal = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
  }
}

function makeHarness() {
  const calls = [];
  const children = [new FakeChild(4101), new FakeChild(4102, { connected: true })];
  const stopped = [];
  let childIndex = 0;
  const supervisor = createDevLocalSupervisor({
    projectRoot: path.resolve("temporary-project"),
    nodeExecutable: "test-node",
    spawnProcess(command, args, options) {
      calls.push({ args, command, options });
      return children[childIndex++];
    },
    async stopProcess(child, options) {
      stopped.push({ child, options });
      if (child.exitCode === null && child.signalCode === null) child.finish(0, "TEST_STOP");
    },
  });
  return { calls, children, stopped, supervisor };
}

test("the supervisor directly starts vinext and the loopback import service without a shell", async () => {
  const { calls, stopped, supervisor } = makeHarness();
  const completion = supervisor.start();
  assert.equal(calls.length, 2);

  const [web, importer] = calls;
  assert.equal(web.command, "test-node");
  assert.match(web.args[0].replaceAll("\\", "/"), /node_modules\/vinext\/dist\/cli\.js$/);
  assert.deepEqual(web.args.slice(1), ["dev", "--hostname", "127.0.0.1", "--port", "3001"]);
  assert.equal(web.options.detached, false);
  assert.equal(web.options.windowsHide, true);
  assert.equal(web.options.stdio, "inherit");

  assert.equal(importer.command, "test-node");
  assert.match(importer.args[0].replaceAll("\\", "/"), /scripts\/photo-import-server\.mjs$/);
  assert.deepEqual(importer.options.stdio, ["inherit", "inherit", "inherit", "ipc"]);

  await supervisor.shutdown({ exitCode: 0, reason: "test-complete" });
  assert.equal(await completion, 0);
  assert.equal(stopped.length, 2);
  assert.equal(stopped.find((item) => item.child.pid === 4101).options.graceful, false);
  assert.equal(stopped.find((item) => item.child.pid === 4102).options.graceful, true);
});

test("an unexpected web crash stops the importer and propagates a failing exit code", async () => {
  const { children, stopped, supervisor } = makeHarness();
  const completion = supervisor.start();
  children[0].finish(7);
  assert.equal(await completion, 7);
  assert.ok(stopped.some((item) => item.child === children[1]));
});

test("an unexpected importer exit stops vinext and a clean child exit is still unexpected", async () => {
  const { children, stopped, supervisor } = makeHarness();
  const completion = supervisor.start();
  children[1].finish(0);
  assert.equal(await completion, 1);
  assert.ok(stopped.some((item) => item.child === children[0]));
});

test("spawn errors clean every child and resolve once", async () => {
  const { children, stopped, supervisor } = makeHarness();
  const completion = supervisor.start();
  children[1].emit("error", new Error("private executable path"));
  const [firstResult, secondResult] = await Promise.all([
    completion,
    supervisor.shutdown({ exitCode: 9, reason: "duplicate-shutdown" }),
  ]);
  assert.equal(firstResult, 1);
  assert.equal(secondResult, 1);
  assert.equal(stopped.length, 2);
});

test("SIGINT and SIGTERM request idempotent cleanup through runDevLocal", async () => {
  for (const [signal, expectedCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    const processObject = new EventEmitter();
    processObject.exitCode = null;
    let resolveStart;
    const startResult = new Promise((resolve) => { resolveStart = resolve; });
    const shutdownCalls = [];
    const supervisor = {
      shutdown(options) {
        shutdownCalls.push(options);
        resolveStart(options.exitCode);
        return Promise.resolve(options.exitCode);
      },
      start() {
        return startResult;
      },
    };

    const running = runDevLocal({
      processObject,
      projectRoot: path.resolve("temporary-project"),
      supervisorFactory: () => supervisor,
    });
    processObject.emit(signal);
    assert.equal(await running, expectedCode);
    assert.equal(processObject.exitCode, expectedCode);
    assert.deepEqual(shutdownCalls, [{ exitCode: expectedCode, reason: signal }]);
    assert.equal(processObject.listenerCount("SIGINT"), 0);
    assert.equal(processObject.listenerCount("SIGTERM"), 0);
  }
});

test("Windows tree cleanup can target only the known child PID", () => {
  assert.deepEqual(windowsTaskkillArguments(4312), ["/PID", "4312", "/T", "/F"]);
  assert.throws(() => windowsTaskkillArguments(0), /positive child PID/);
  assert.throws(() => windowsTaskkillArguments(Number.NaN), /positive child PID/);
});

test("Windows cleanup falls back to the direct child when taskkill fails", async () => {
  const child = new FakeChild(4412);
  const signals = [];
  child.kill = (signal) => {
    signals.push(signal);
    child.finish(null, signal);
    return true;
  };

  await stopChildProcess(child, {
    platform: "win32",
    execFileImpl: async () => { throw new Error("taskkill unavailable"); },
    waitForExitImpl: async () => false,
  });
  assert.deepEqual(signals, ["SIGTERM"]);
  assert.equal(child.signalCode, "SIGTERM");
});

test("Windows cleanup reports a child that remains alive", async () => {
  const child = new FakeChild(4413);
  child.kill = () => true;
  await assert.rejects(
    stopChildProcess(child, {
      platform: "win32",
      execFileImpl: async () => undefined,
      waitForExitImpl: async () => false,
    }),
    /Unable to stop a local development child process/,
  );
});

test("the supervisor returns failure when any child cleanup fails", async () => {
  const children = [new FakeChild(4421), new FakeChild(4422, { connected: true })];
  let childIndex = 0;
  const reports = [];
  const supervisor = createDevLocalSupervisor({
    projectRoot: path.resolve("temporary-project"),
    nodeExecutable: "test-node",
    reportError: (message) => reports.push(message),
    spawnProcess: () => children[childIndex++],
    stopProcess: async (child) => {
      if (child.pid === 4421) throw new Error("still running");
      child.finish(0, "TEST_STOP");
    },
  });
  const completion = supervisor.start();
  assert.equal(await supervisor.shutdown({ exitCode: 0, reason: "test" }), 1);
  assert.equal(await completion, 1);
  assert.deepEqual(reports, ["Unable to stop every local development child process."]);
});

test("the import service receives a graceful IPC shutdown before tree termination", async () => {
  const child = new FakeChild(4512, { connected: true });
  const stopping = stopChildProcess(child, { graceful: true });
  assert.deepEqual(child.sent, [{ type: "shutdown" }]);
  child.finish(0);
  await stopping;
});
