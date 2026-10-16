import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = await fs.readFile(new URL('../app/premium-gallery-proof/scene-wheel.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports });
const { createSceneWheelGate } = exports;
const input = (now, deltaY = 100, extra = {}) => ({ deltaX: 0, deltaY, deltaMode: 0, viewportHeight: 900, now, transitioning: false, canScroll: false, ...extra });

test('first substantial wheel input changes a scene immediately', () => {
  assert.equal(createSceneWheelGate().accept(input(0)), 1);
  assert.equal(createSceneWheelGate().accept(input(0, -100)), -1);
});

test('small same-direction inputs accumulate instead of being discarded', () => {
  const gate = createSceneWheelGate();
  assert.deepEqual([0, 30, 60, 90, 120].map(now => gate.accept(input(now, 10))), [0, 0, 0, 1, 0]);
});

test('a new gesture responds at 650ms after a completed transition, without a one-second lock', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0)), 1);
  assert.equal(gate.accept(input(100, 100, { transitioning: true })), 0);
  assert.equal(gate.accept(input(650)), 1);
});

test('decaying inertia cannot jump again even after one second', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0)), 1);
  for (let now = 30; now <= 1500; now += 30) {
    assert.equal(gate.accept(input(now, 200 * 0.97 ** (now / 30), { transitioning: now < 500 })), 0, `inertia at ${now}ms`);
  }
  assert.equal(gate.accept(input(1680)), 1);
});

test('direction reversal resets accumulated distance and can reverse a completed transition', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0, 30)), 0);
  assert.equal(gate.accept(input(20, -10)), 0);
  assert.equal(gate.accept(input(40, -26)), -1);
  assert.equal(gate.accept(input(60, 100)), 1);
});

test('animation-time reversal is not queued but a new reverse input is accepted after completion', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0)), 1);
  assert.equal(gate.accept(input(450, -100, { transitioning: true })), 0);
  assert.equal(gate.accept(input(520, -100)), -1);
  assert.equal(gate.accept(input(700, -100)), -1);
});

test('six seconds of reverse input starting during animation does not remain blocked', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0)), 1);
  let transitionUntil = 420;
  const accepted = [];
  for (let now = 55; now <= 6000; now += 55) {
    const transitioning = now < transitionUntil;
    const result = gate.accept(input(now, -100, { transitioning }));
    if (transitioning) assert.equal(result, 0, `no queued reversal during animation at ${now}`);
    if (result) { accepted.push(now); transitionUntil = now + 420; }
  }
  assert.equal(accepted[0], 440, 'first post-transition input reverses without an idle gap');
  assert.ok(accepted.length >= 8, 'continued reverse input remains usable throughout six seconds');
  assert.ok(accepted.at(-1) > 5500, 'no later stall');
});

test('six seconds of sustained strong input can continue after each actual animation', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0)), 1);
  let transitionUntil = 420;
  const accepted = [];
  for (let now = 60; now <= 6000; now += 60) {
    const transitioning = now < transitionUntil;
    const result = gate.accept(input(now, 100, { transitioning }));
    if (transitioning) assert.equal(result, 0);
    if (result) { accepted.push(now); transitionUntil = now + 420; }
  }
  assert.equal(accepted[0], 540, 'three new strong inputs are required after the animation');
  assert.ok(accepted.length >= 8);
  assert.ok(accepted.at(-1) > 5500);
});

test('new strong pulses can resume after a decaying tail without an idle gap', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0)), 1);
  for (const [index, amount] of [90, 70, 50, 30, 10].entries()) {
    assert.equal(gate.accept(input((index + 1) * 30, amount)), 0);
  }
  assert.deepEqual([180, 210, 240].map(now => gate.accept(input(now, 80))), [0, 0, 1]);
});

test('sub-threshold noise and decreasing pulses do not build continued intent', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0)), 1);
  for (let now = 30; now < 3000; now += 30) assert.equal(gate.accept(input(now, 12)), 0);
  for (const [index, amount] of [100, 90, 80, 70, 60, 50, 40].entries()) {
    assert.equal(gate.accept(input(3000 + index * 30, amount)), 0);
  }
});

test('continued input needs both three pulses and sufficient total movement', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0)), 1);
  assert.deepEqual([30, 60, 90, 120].map(now => gate.accept(input(now, 36))), [0, 0, 0, 1]);
});

test('content boundary permits continued strong input only after three new pulses', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0, 100, { canScroll: true })), 0);
  assert.equal(gate.accept(input(50, 100, { canScroll: true })), 0);
  assert.deepEqual([100, 160, 220].map(now => gate.accept(input(now))), [0, 0, 1]);
});

test('content boundary retains decreasing inertia and resets pulses if content can scroll again', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0, 100, { canScroll: true })), 0);
  for (const [index, amount] of [100, 90, 80, 70, 60, 50, 40].entries()) {
    assert.equal(gate.accept(input(30 + index * 30, amount)), 0);
  }
  assert.equal(gate.accept(input(250)), 0);
  assert.equal(gate.accept(input(280)), 0);
  assert.equal(gate.accept(input(310, 100, { canScroll: true })), 0);
  assert.deepEqual([340, 370, 400].map(now => gate.accept(input(now))), [0, 0, 1]);
});

test('content scrolling consumes the gesture through its boundary; a fresh gesture can leave', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0, 100, { canScroll: true })), 0);
  assert.equal(gate.accept(input(50, 100, { canScroll: true })), 0);
  assert.equal(gate.accept(input(100)), 0);
  assert.equal(gate.accept(input(160)), 0);
  assert.equal(gate.accept(input(340)), 1);
});

test('a pause of 180ms resets an incomplete accumulation', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0, 30)), 0);
  assert.equal(gate.accept(input(180, 10)), 0);
  assert.equal(gate.accept(input(200, 26)), 1);
});

test('line and page deltas normalize to pixels', () => {
  const lines = createSceneWheelGate();
  assert.equal(lines.accept(input(0, 2, { deltaMode: 1 })), 0);
  assert.equal(lines.accept(input(20, 0.25, { deltaMode: 1 })), 1);
  const pages = createSceneWheelGate();
  assert.equal(pages.accept(input(0, -0.02, { deltaMode: 2, viewportHeight: 900 })), 0);
  assert.equal(pages.accept(input(20, -0.02, { deltaMode: 2, viewportHeight: 900 })), -1);
});

test('horizontal, zero, non-finite and invalid-mode inputs cannot trigger or extend a gesture', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0)), 1);
  for (const extra of [
    { deltaX: 200 }, { deltaY: 0 }, { deltaY: NaN }, { deltaX: Infinity },
    { now: NaN }, { deltaMode: 3 }, { deltaMode: 2, viewportHeight: Infinity },
  ]) assert.equal(gate.accept(input(170, 100, extra)), 0);
  assert.equal(gate.accept(input(180)), 1);
});

test('reset clears prior gesture state for explicit navigation', () => {
  const gate = createSceneWheelGate();
  assert.equal(gate.accept(input(0)), 1);
  gate.reset();
  assert.equal(gate.accept(input(10)), 1);
});
