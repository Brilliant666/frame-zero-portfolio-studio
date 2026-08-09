import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import test from "node:test";
import {
  createDevLocalSupervisor,
  LOCAL_PHOTO_IMPORT_ORIGIN_ENV,
  LOCAL_PHOTO_IMPORT_PORT_ENV,
  originFromPhotoImportReadyMessage,
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

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeHarness({
  processEnvironment = {
    FRAME_ZERO_UNRELATED: "preserved",
    [LOCAL_PHOTO_IMPORT_ORIGIN_ENV]: "http://127.0.0.1:3999",
    [LOCAL_PHOTO_IMPORT_PORT_ENV]: "3999",
  },
  readyTimeoutMs = 1_000,
  throwOnWebSpawn = false,
} = {}) {
  const calls = [];
  const importer = new FakeChild(4102, { connected: true });
  const web = new FakeChild(4101);
  const stopped = [];
  const reports = [];
  let spawnIndex = 0;
  const supervisor = createDevLocalSupervisor({
    projectRoot: path.resolve("temporary-project"),
    nodeExecutable: "test-node",
    processEnvironment,
    readyTimeoutMs,
    reportError: (message) => reports.push(message),
    spawnProcess(command, args, options) {
      calls.push({ args, command, options });
      spawnIndex += 1;
      if (spawnIndex === 1) return importer;
      if (throwOnWebSpawn) throw new Error("web spawn failed");
      return web;
    },
    async stopProcess(child, options) {
      stopped.push({ child, options });
      if (child.exitCode === null && child.signalCode === null) child.finish(0, "TEST_STOP");
    },
  });
  return { calls, importer, processEnvironment, reports, stopped, supervisor, web };
}

async function signalReady(harness, message = { type: "ready", host: "127.0.0.1", port: 43123 }) {
  harness.importer.emit("message", message);
  await nextTurn();
}

test("the supervisor starts the dynamic importer before vinext and injects its validated origin", async () => {
  const harness = makeHarness();
  const originalEnvironment = { ...harness.processEnvironment };
  const completion = harness.supervisor.start();

  assert.equal(harness.calls.length, 1);
  const importerCall = harness.calls[0];
  assert.equal(importerCall.command, "test-node");
  assert.match(importerCall.args[0].replaceAll("\\", "/"), /scripts\/photo-import-server\.mjs$/);
  assert.deepEqual(importerCall.options.stdio, ["inherit", "inherit", "inherit", "ipc"]);
  assert.equal(importerCall.options.detached, false);
  assert.equal(importerCall.options.windowsHide, true);
  assert.equal(importerCall.options.env.FRAME_ZERO_UNRELATED, "preserved");
  assert.equal(importerCall.options.env[LOCAL_PHOTO_IMPORT_PORT_ENV], "0");
  assert.deepEqual(harness.processEnvironment, originalEnvironment);

  await signalReady(harness);
  assert.equal(harness.calls.length, 2);
  const webCall = harness.calls[1];
  assert.equal(webCall.command, "test-node");
  assert.match(webCall.args[0].replaceAll("\\", "/"), /node_modules\/vinext\/dist\/cli\.js$/);
  assert.deepEqual(webCall.args.slice(1), ["dev", "--hostname", "127.0.0.1", "--port", "3001"]);
  assert.equal(webCall.options.stdio, "inherit");
  assert.equal(webCall.options.env.FRAME_ZERO_UNRELATED, "preserved");
  assert.equal(
    webCall.options.env[LOCAL_PHOTO_IMPORT_ORIGIN_ENV],
    "http://127.0.0.1:43123",
  );
  assert.deepEqual(harness.processEnvironment, originalEnvironment);

  await harness.supervisor.shutdown({ exitCode: 0, reason: "test-complete" });
  assert.equal(await completion, 0);
  assert.equal(harness.stopped.length, 2);
  assert.equal(harness.stopped.find((item) => item.child === harness.importer).options.graceful, true);
  assert.equal(harness.stopped.find((item) => item.child === harness.web).options.graceful, false);
});

test("ready messages are fail-closed for missing, invalid, non-loopback, or extra data", async (t) => {
  const cases = [
    ["missing port", { type: "ready", host: "127.0.0.1" }],
    ["zero port", { type: "ready", host: "127.0.0.1", port: 0 }],
    ["oversized port", { type: "ready", host: "127.0.0.1", port: 65_536 }],
    ["string port", { type: "ready", host: "127.0.0.1", port: "3003" }],
    ["localhost host", { type: "ready", host: "localhost", port: 3003 }],
    ["wildcard host", { type: "ready", host: "0.0.0.0", port: 3003 }],
    ["extra path", { type: "ready", host: "127.0.0.1", port: 3003, cwd: "private" }],
  ];

  for (const [name, message] of cases) {
    await t.test(name, async () => {
      const harness = makeHarness();
      const completion = harness.supervisor.start();
      await signalReady(harness, message);
      assert.equal(await completion, 1);
      assert.equal(harness.calls.length, 1);
      assert.deepEqual([...harness.supervisor.children.keys()], ["photo-import"]);
      assert.equal(harness.reports.length, 1);
    });
  }
});

test("the ready-message parser accepts only the exact loopback IPC contract", () => {
  assert.equal(
    originFromPhotoImportReadyMessage({ type: "ready", host: "127.0.0.1", port: 65535 }),
    "http://127.0.0.1:65535",
  );
  assert.throws(
    () => originFromPhotoImportReadyMessage({ type: "ready", host: "127.0.0.1", port: 3003, path: "x" }),
    /invalid ready message/,
  );
});

test("an importer crash before ready fails cleanly and never starts the web child", async () => {
  const harness = makeHarness();
  const completion = harness.supervisor.start();
  harness.importer.finish(7);
  assert.equal(await completion, 7);
  assert.equal(harness.calls.length, 1);
  assert.ok(!harness.supervisor.children.has("web"));
});

test("an importer spawn error before ready fails cleanly and never starts the web child", async () => {
  const harness = makeHarness();
  const completion = harness.supervisor.start();
  harness.importer.emit("error", new Error("private executable path"));
  assert.equal(await completion, 1);
  assert.equal(harness.calls.length, 1);
  assert.ok(!harness.supervisor.children.has("web"));
});

test("an importer that never becomes ready times out without starting the web child", async () => {
  const harness = makeHarness({ readyTimeoutMs: 10 });
  const completion = harness.supervisor.start();
  assert.equal(await completion, 1);
  assert.equal(harness.calls.length, 1);
  assert.ok(!harness.supervisor.children.has("web"));
  assert.ok(harness.stopped.some((item) => item.child === harness.importer && item.options.graceful));
});

test("a web spawn failure after importer readiness cleanly stops the importer", async () => {
  const harness = makeHarness({ throwOnWebSpawn: true });
  const completion = harness.supervisor.start();
  await signalReady(harness);
  assert.equal(await completion, 1);
  assert.equal(harness.calls.length, 2);
  assert.ok(harness.stopped.some((item) => item.child === harness.importer && item.options.graceful));
});

test("an unexpected web crash stops the importer and propagates a failing exit code", async () => {
  const harness = makeHarness();
  const completion = harness.supervisor.start();
  await signalReady(harness);
  harness.web.finish(7);
  assert.equal(await completion, 7);
  assert.ok(harness.stopped.some((item) => item.child === harness.importer));
});

test("an unexpected importer exit after ready stops vinext and a clean exit is still unexpected", async () => {
  const harness = makeHarness();
  const completion = harness.supervisor.start();
  await signalReady(harness);
  harness.importer.finish(0);
  assert.equal(await completion, 1);
  assert.ok(harness.stopped.some((item) => item.child === harness.web));
});

test("SIGINT and SIGTERM request idempotent cleanup through runDevLocal", async () => {
  for (const [signal, expectedCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    const processObject = new EventEmitter();
    processObject.exitCode = null;
    const harness = makeHarness();

    const running = runDevLocal({
      processObject,
      projectRoot: path.resolve("temporary-project"),
      supervisorFactory: () => harness.supervisor,
    });
    await signalReady(harness);
    assert.equal(harness.calls.length, 2);
    processObject.emit(signal);
    assert.equal(await running, expectedCode);
    assert.equal(processObject.exitCode, expectedCode);
    assert.equal(harness.stopped.length, 2);
    assert.ok(harness.stopped.some((item) => item.child === harness.importer && item.options.graceful));
    assert.ok(harness.stopped.some((item) => item.child === harness.web && !item.options.graceful));
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
  const importer = new FakeChild(4422, { connected: true });
  const web = new FakeChild(4421);
  const children = [importer, web];
  let childIndex = 0;
  const reports = [];
  const supervisor = createDevLocalSupervisor({
    projectRoot: path.resolve("temporary-project"),
    nodeExecutable: "test-node",
    readyTimeoutMs: 1_000,
    reportError: (message) => reports.push(message),
    spawnProcess: () => children[childIndex++],
    stopProcess: async (child) => {
      if (child === web) throw new Error("still running");
      child.finish(0, "TEST_STOP");
    },
  });
  const completion = supervisor.start();
  importer.emit("message", { type: "ready", host: "127.0.0.1", port: 3003 });
  await nextTurn();
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
