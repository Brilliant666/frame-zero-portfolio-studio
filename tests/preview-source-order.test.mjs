import assert from "node:assert/strict";
import test from "node:test";
import { planSourceMtimeOrder } from "../scripts/lib/preview-source-order.mjs";
test("verified source mtime sorts stably without changing membership, cover, focus or other data", () => {
  const [a,b,c] = ["a","b","c"].map(letter => letter.repeat(64));
  const content = { brand: "unchanged", collections: [{ id:"one", assetIds:[a,b,c], coverAssetId:c, focusAssetId:a }, { id:"unknown",assetIds:["legacy"] }] };
  const records = [{assetId:a,sourceHash:a,mtimeMs:1},{assetId:b,sourceHash:b,mtimeMs:2},{assetId:c,sourceHash:c,mtimeMs:2}];
  const plan = planSourceMtimeOrder(content,records);
  assert.deepEqual(plan.content.collections[0], {...content.collections[0],assetIds:[b,c,a]});
  assert.deepEqual(plan.content.collections[1],content.collections[1]);
  assert.deepEqual(content.collections[0].assetIds,[a,b,c]);
  assert.equal(plan.results[1].status,"SOURCE_MTIME_UNAVAILABLE");
  assert.equal(plan.content.brand,content.brand);
});
test("missing, conflicting, import-time or mismatched identity metadata cannot silently sort", () => {
  const a="a".repeat(64), b="b".repeat(64), content={collections:[{id:"one",assetIds:[a,b]}]};
  for (const records of [[],[{assetId:a,sourceHash:a,addedAt:2}], [{assetId:a,sourceHash:b,mtimeMs:2}],
    [{assetId:a,sourceHash:a,mtimeMs:2},{assetId:a,sourceHash:a,mtimeMs:3},{assetId:b,sourceHash:b,mtimeMs:9}]]) {
    const plan=planSourceMtimeOrder(content,records);
    assert.deepEqual(plan.content,content); assert.equal(plan.results[0].status,"SOURCE_MTIME_UNAVAILABLE");
  }
});
