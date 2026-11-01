import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

async function moduleUrl(file, dependencies = {}) {
  let source = ts.transpileModule(await fs.readFile(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [name, value] of Object.entries(dependencies)) source = source.replace(`from "${name}"`, `from "${value}"`);
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const policy = await moduleUrl("app/photo-ratio-policy.ts");
const library = await import(await moduleUrl("app/photo-library.ts", { "./photo-ratio-policy": policy }));
const source = await fs.readFile(new URL("../app/admin/advanced/focus-position-field.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// Run the real component's handlers and state transitions without a server or DB.
function fixture(initial = "50% 50%") {
  const state = [], commits = [];
  let cursor = 0, tree, value = initial;
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, require(name) {
    if (name === "react") return { useState(initialValue) {
      const index = cursor++;
      if (!(index in state)) state[index] = initialValue;
      return [state[index], next => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
    } };
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "../../photo-library") return library;
    if (name.endsWith(".module.css")) return { default: { field: "field" } };
    throw new Error(`Unexpected import: ${name}`);
  } };
  vm.runInNewContext(compiled, context);
  const children = () => tree.props.children;
  const input = () => children().find(node => node?.type === "input");
  const render = () => {
    cursor = 0;
    tree = context.exports.default({ value, onCommit(next) { commits.push(next); value = next; } });
  };
  render();
  const blur = () => {
    input().props.onBlur({ currentTarget: { value: input().props.value } });
    render();
  };
  return {
    commits,
    normalize: context.exports.normalizeFocusInput,
    text: () => input().props.value,
    message: () => children().find(node => node?.props?.role === "status")?.props.children,
    change(next) { input().props.onChange({ currentTarget: { value: next } }); render(); },
    acknowledge(next) { value = next; render(); },
    blur,
    key(key, isComposing = false) {
      let prevented = false;
      input().props.onKeyDown({ key, nativeEvent: { isComposing }, preventDefault() { prevented = true; }, currentTarget: { blur } });
      return prevented;
    },
  };
}

test("partial and complete focus drafts survive autosave acknowledgements until blur", () => {
  const f = fixture();
  for (const text of ["", "2", "20%", "20% ", "20% 8", "20% 80% "]) {
    f.change(text);
    // Another field's save can finish after the 1500ms pause while this input is active.
    f.acknowledge("50% 50%");
    assert.equal(f.text(), text);
    assert.deepEqual(f.commits, [], "Typing never puts incomplete focus text in the provider");
  }
  f.blur();
  assert.deepEqual(f.commits, ["20% 80%"]);
  assert.equal(f.text(), "20% 80%");
  f.acknowledge("20% 80%");
  assert.equal(f.text(), "20% 80%");
});

test("blur and Enter use the shared percentage clamping and formatting", () => {
  const f = fixture();
  f.change("  -5% 150%  "); f.blur();
  assert.deepEqual(f.commits, ["0% 100%"]);
  f.change("22.1234% 80.5555%");
  assert.equal(f.key("Enter"), true);
  assert.equal(f.text(), "22.12% 80.56%");
  assert.deepEqual(f.commits, ["0% 100%", "22.12% 80.56%"]);
  f.blur();
  assert.equal(f.commits.length, 2, "A later blur does not submit the same value again");
});

test("invalid input restores the latest committed value with feedback and never writes a default", () => {
  for (const invalid of ["", "20%", "center", "20 80", "50% 50%;position:fixed", "Infinity% 20%", `${"9".repeat(400)}% 20%`]) {
    const f = fixture("20% 80%");
    f.change(invalid);
    f.acknowledge("25% 75%");
    assert.equal(f.text(), invalid);
    f.blur();
    assert.equal(f.text(), "25% 75%");
    assert.match(f.message(), /格式无效，已恢复上次有效值/);
    assert.deepEqual(f.commits, []);
    f.change("30% 70%");
    assert.equal(f.message(), undefined);
    f.blur();
    assert.deepEqual(f.commits, ["30% 70%"]);
  }
});

test("an idle field follows external content and IME Enter does not submit", () => {
  const f = fixture();
  f.acknowledge("30% 70%");
  assert.equal(f.text(), "30% 70%");
  f.change("40% 60%");
  assert.equal(f.key("Enter", true), false);
  assert.equal(f.key("a"), false);
  assert.deepEqual(f.commits, []);
  assert.equal(f.text(), "40% 60%");
  f.key("Enter");
  assert.deepEqual(f.commits, ["40% 60%"]);
  assert.equal(f.normalize("0% -0%"), "0% 0%");
});
