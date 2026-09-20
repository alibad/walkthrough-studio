import assert from "node:assert/strict";
import test from "node:test";
import { stalenessVerdict } from "../apps/hub/src/lib/run-history";

test("fresh means no commits, a clean tree, and at most 30 days", () => {
  assert.equal(stalenessVerdict({ commitsSince: 0, ageDays: 0 }), "fresh");
  assert.equal(stalenessVerdict({ commitsSince: 0, ageDays: 30 }), "fresh");
});

test("one commit, age over 30 days, or a dirty tree is stale", () => {
  assert.equal(stalenessVerdict({ commitsSince: 1, ageDays: 0 }), "stale");
  assert.equal(stalenessVerdict({ commitsSince: 0, ageDays: 30.01 }), "stale");
  assert.equal(stalenessVerdict({ commitsSince: 0, ageDays: 0, dirty: true }), "stale");
  assert.equal(stalenessVerdict({ commitsSince: 10, ageDays: 90 }), "stale");
});

test("more than ten commits or more than 90 days is very stale", () => {
  assert.equal(stalenessVerdict({ commitsSince: 11, ageDays: 0 }), "very-stale");
  assert.equal(stalenessVerdict({ commitsSince: 0, ageDays: 90.01 }), "very-stale");
});
