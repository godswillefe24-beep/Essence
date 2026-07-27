// tests/embeddings.test.js — run with: node --test
//
// Only tests cosineSimilarity (pure math, no network calls). getEmbedding()
// itself calls the Hugging Face API and isn't covered here — that would be
// an integration test requiring a real HF_TOKEN and network access, not a
// unit test. If you want that coverage too, it belongs in a separate
// integration test file that's skipped in normal CI runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity } from "../embeddings.js";

test("cosineSimilarity", async (t) => {
  await t.test("identical vectors have similarity 1", () => {
    const v = [1, 2, 3];
    assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 1e-9);
  });

  await t.test("orthogonal vectors have similarity 0", () => {
    assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9);
  });

  await t.test("opposite vectors have similarity -1", () => {
    assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [-1, -2, -3]) - -1) < 1e-9);
  });

  await t.test("similarity is symmetric: sim(a,b) === sim(b,a)", () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    assert.equal(cosineSimilarity(a, b), cosineSimilarity(b, a));
  });

  await t.test("a zero vector returns 0 instead of NaN (division by zero guard)", () => {
    assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
  });

  await t.test("scaling a vector doesn't change similarity (cosine is scale-invariant)", () => {
    const a = [1, 2, 3];
    const bScaled = [2, 4, 6]; // same direction as a, different magnitude
    assert.ok(Math.abs(cosineSimilarity(a, bScaled) - 1) < 1e-9);
  });
});
