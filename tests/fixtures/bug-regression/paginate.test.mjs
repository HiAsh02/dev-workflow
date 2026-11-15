import test from "node:test";
import assert from "node:assert/strict";
import { paginate } from "./paginate.mjs";

test("page 1 returns first pageSize items", () => {
  assert.deepEqual(paginate(["a", "b", "c", "d"], 1, 2), ["a", "b"]);
});
