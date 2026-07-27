// tests/validation.test.js — run with: node --test
//
// Tests the validation logic used by POST /api/comments and POST /api/subscribe.
// This is deliberately NOT a full HTTP integration test against a running
// server + database — Node's module-mocking API needed to fake out db.js
// is still experimental and has several open bugs around ES module import
// mocking (see nodejs/node#59163, #53807). Testing the extracted validation
// logic directly is more reliable and covers the actual business rules;
// what it does NOT cover is Express routing/middleware/DB integration itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateComment, validateSubscribeEmail } from "../utils.js";

test("validateComment", async (t) => {
  await t.test("accepts a valid comment", () => {
    const result = validateComment({ postId: "5", name: "Jamie", text: "Great post!" });
    assert.equal(result.valid, true);
    assert.deepEqual(result.sanitized, { postId: "5", name: "Jamie", text: "Great post!" });
  });

  await t.test("rejects missing postId", () => {
    const result = validateComment({ postId: "", name: "Jamie", text: "Great post!" });
    assert.equal(result.valid, false);
  });

  await t.test("rejects missing text", () => {
    const result = validateComment({ postId: "5", name: "Jamie", text: "" });
    assert.equal(result.valid, false);
  });

  await t.test("rejects text under 2 characters", () => {
    const result = validateComment({ postId: "5", name: "Jamie", text: "a" });
    assert.equal(result.valid, false);
  });

  await t.test("accepts text at exactly 2 characters (boundary)", () => {
    const result = validateComment({ postId: "5", name: "Jamie", text: "ok" });
    assert.equal(result.valid, true);
  });

  await t.test("defaults name to 'Anonymous' when missing", () => {
    const result = validateComment({ postId: "5", name: "", text: "Nice read" });
    assert.equal(result.valid, true);
    assert.equal(result.sanitized.name, "Anonymous");
  });

  await t.test("trims whitespace from all fields", () => {
    const result = validateComment({ postId: " 5 ", name: " Jamie ", text: "  Nice read  " });
    assert.equal(result.valid, true);
    assert.equal(result.sanitized.postId, "5");
    assert.equal(result.sanitized.name, "Jamie");
    assert.equal(result.sanitized.text, "Nice read");
  });
});

test("validateSubscribeEmail", async (t) => {
  await t.test("accepts a valid email", () => {
    const result = validateSubscribeEmail("reader@example.com");
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, "reader@example.com");
  });

  await t.test("rejects an invalid email", () => {
    const result = validateSubscribeEmail("not-an-email");
    assert.equal(result.valid, false);
    assert.equal(result.error, "Invalid email address");
  });

  await t.test("rejects an empty string", () => {
    const result = validateSubscribeEmail("");
    assert.equal(result.valid, false);
  });

  await t.test("lowercases and trims a messy but valid email", () => {
    const result = validateSubscribeEmail("  Reader@Example.COM  ");
    assert.equal(result.valid, true);
    assert.equal(result.sanitized, "reader@example.com");
  });
});
