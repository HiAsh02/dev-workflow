import test from "node:test";
import assert from "node:assert/strict";
import { greet } from "./hello.mjs";

test("greet formats provided and default names", () => {
  assert.equal(greet("dev-workflow"), "Hello, dev-workflow!");
  assert.equal(greet("  "), "Hello, world!");
});
