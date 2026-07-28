import assert from "node:assert/strict";
import test from "node:test";

import { renderPointBudget } from "./renderBudget.js";

test("keeps small point clouds on the direct download path", () => {
  assert.equal(renderPointBudget({
    size_bytes: 5 * 1024 * 1024,
    point_count: 150_000,
  }), null);
});

test("keeps the render payload near six megabytes for awning.las", () => {
  const budget = renderPointBudget({
    size_bytes: 30_648_915,
    point_count: 901_432,
  });

  assert.ok(budget >= 180_000 && budget <= 190_000);
});

test("bounds extremely large point-cloud samples", () => {
  const budget = renderPointBudget({
    size_bytes: 4_000_000_000,
    point_count: 100_000_000,
  });

  assert.ok(budget >= 100_000 && budget <= 500_000);
});
