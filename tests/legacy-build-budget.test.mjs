import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("legacy rollback budget keeps public and Admin route accounting explicit", async () => {
  const source = await fs.readFile(
    new URL("../scripts/check-build-budget.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /const MAX_PUBLIC_JS = 550 \* 1024/);
  assert.match(source, /const MAX_ADMIN_JS = 160 \* 1024/);
  assert.match(source, /const MAX_ADMIN_ENTRY_JS = 80 \* 1024/);
  assert.match(source, /source\.startsWith\("app\/admin\/"\)/);
  assert.match(source, /public client JS/);
  assert.match(source, /Admin dynamic JS/);
  assert.match(source, /lazy JS is/);
  assert.doesNotMatch(source, /MAX_PUBLIC_JS\s*=\s*(?:5[6-9]\d|[6-9]\d\d) \* 1024/);
});
