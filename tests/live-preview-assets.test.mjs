import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await fs.readFile(new URL("../app/site-editor/live-preview-assets.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createLivePreviewAssets } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const first = { id: "11111111-1111-4111-8111-111111111111" };
const uploaded = { id: "22222222-2222-4222-8222-222222222222" };
const album = "33333333-3333-4333-8333-333333333333";
const draft = (members, title = "Album") => ({ collections: [{ id: album, name: title, assetIds: members.map(asset => asset.id) }] });
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const requests = [], snapshots = [];
  const controller = createLivePreviewAssets(() => new Promise((resolve, reject) => requests.push({ resolve, reject })), state => snapshots.push(state));
  return { controller, requests, snapshots, state: () => snapshots.at(-1) };
}
async function initialized() {
  const f = fixture();
  const started = f.controller.start();
  f.requests[0].resolve([first]);
  await started;
  return f;
}

test("a late older list cannot remove a photo already loaded by a newer request", async () => {
  const f = await initialized();
  f.controller.observe(draft([first])); // The album UUID has not been requested yet.
  f.controller.observe(draft([first, uploaded]));
  assert.equal(f.requests.length, 3, "A new reference can refresh while an older request is pending");
  f.requests[2].resolve([first, uploaded]);
  await settle();
  assert.deepEqual(f.state().assets, [first, uploaded]);
  const snapshotCount = f.snapshots.length;
  f.requests[1].resolve([first]);
  await settle();
  assert.equal(f.snapshots.length, snapshotCount, "An obsolete success does not publish state");
  assert.deepEqual(f.state().assets, [first, uploaded]);
});

test("an obsolete failure does not replace the successful latest request with an error", async () => {
  const f = await initialized();
  f.controller.observe(draft([first]));
  f.controller.observe(draft([first, uploaded]));
  f.requests[2].resolve([first, uploaded]);
  await settle();
  const snapshotCount = f.snapshots.length;
  f.requests[1].reject(new Error("Late 503"));
  await settle();
  assert.equal(f.snapshots.length, snapshotCount);
  assert.deepEqual(f.state(), { assets: [first, uploaded], loading: false, failed: false });
});

test("latest failure preserves old photos and remains retryable after an older success", async () => {
  const f = await initialized();
  f.controller.observe(draft([first]));
  f.controller.observe(draft([first, uploaded]));
  f.requests[2].reject(new Error("503"));
  await settle();
  assert.deepEqual(f.state(), { assets: [first], loading: false, failed: true });
  f.requests[1].resolve([first]);
  await settle();
  assert.equal(f.state().failed, true, "An obsolete success cannot dismiss the current error");
  f.controller.observe(draft([first, uploaded], "Edited title after the network recovered"));
  assert.equal(f.requests.length, 3, "Typing does not repeatedly retry the same missing identity");
  f.controller.retry();
  assert.equal(f.requests.length, 4, "The same failed identities have an explicit recovery path");
  assert.deepEqual(f.state(), { assets: [first], loading: true, failed: true }, "The retry UI remains visible while loading");
  f.controller.retry();
  assert.equal(f.requests.length, 4, "Repeated retry clicks do not start duplicate requests");
  f.requests[3].resolve([first, uploaded]);
  await settle();
  assert.deepEqual(f.state(), { assets: [first, uploaded], loading: false, failed: false });
});

test("an initial load failure can be retried without reopening the preview", async () => {
  const f = fixture();
  const started = f.controller.start();
  f.controller.observe(draft([first]));
  f.requests[0].reject(new Error("Offline"));
  await started;
  assert.deepEqual(f.state(), { assets: null, loading: false, failed: true });
  f.controller.retry();
  f.requests[1].resolve([first]);
  await settle();
  f.controller.observe(draft([first]));
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.state(), { assets: [first], loading: false, failed: false });
});

test("album UUIDs and missing assets never create an automatic request loop", async () => {
  const f = await initialized();
  const missing = draft([first, uploaded]);
  f.controller.observe(missing);
  f.requests[1].resolve([first]);
  await settle();
  for (let i = 0; i < 10; i++) f.controller.observe(draft([first, uploaded], `Title ${i}`));
  assert.equal(f.requests.length, 2, "Successful omission and unrelated text edits do not refetch");
  f.controller.retry();
  f.requests[2].reject(new Error("503"));
  await settle();
  for (let i = 0; i < 10; i++) f.controller.observe(missing);
  assert.equal(f.requests.length, 3, "Failure does not schedule an automatic retry");
  assert.equal(f.state().failed, true);
});

test("a different new photo can recover the list after an earlier failure", async () => {
  const f = await initialized();
  f.controller.observe(draft([first]));
  f.requests[1].reject(new Error("503"));
  await settle();
  f.controller.observe(draft([first, uploaded]));
  assert.equal(f.requests.length, 3);
  f.requests[2].resolve([first, uploaded]);
  await settle();
  assert.deepEqual(f.state(), { assets: [first, uploaded], loading: false, failed: false });
});

test("disposed preview ignores pending successes, failures and later commands", async () => {
  for (const outcome of ["resolve", "reject"]) {
    const f = fixture();
    const started = f.controller.start();
    const snapshotCount = f.snapshots.length;
    f.controller.dispose();
    f.requests[0][outcome](outcome === "resolve" ? [first] : new Error("Offline"));
    await started;
    f.controller.retry();
    f.controller.observe(draft([first, uploaded]));
    await f.controller.start();
    assert.equal(f.snapshots.length, snapshotCount);
    assert.equal(f.requests.length, 1);
  }
});
