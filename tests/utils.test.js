// tests/utils.test.js — run with: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeString,
  sanitizeEmail,
  escapeXml,
  matchesFilter,
  buildPagination,
} from "../utils.js";

test("sanitizeString", async (t) => {
  await t.test("trims whitespace", () => {
    assert.equal(sanitizeString("  hello  "), "hello");
  });

  await t.test("caps length at 5000 characters", () => {
    const long = "a".repeat(6000);
    assert.equal(sanitizeString(long).length, 5000);
  });

  await t.test("returns empty string for non-string input", () => {
    assert.equal(sanitizeString(null), "");
    assert.equal(sanitizeString(undefined), "");
    assert.equal(sanitizeString(42), "");
    assert.equal(sanitizeString({}), "");
  });

  await t.test("empty string stays empty", () => {
    assert.equal(sanitizeString(""), "");
  });
});

test("sanitizeEmail", async (t) => {
  await t.test("accepts a valid email and lowercases it", () => {
    assert.equal(sanitizeEmail("Person@Example.COM"), "person@example.com");
  });

  await t.test("trims whitespace", () => {
    assert.equal(sanitizeEmail("  person@example.com  "), "person@example.com");
  });

  await t.test("rejects missing @ symbol", () => {
    assert.equal(sanitizeEmail("not-an-email"), "");
  });

  await t.test("rejects missing domain", () => {
    assert.equal(sanitizeEmail("person@"), "");
  });

  await t.test("rejects missing TLD", () => {
    assert.equal(sanitizeEmail("person@example"), "");
  });

  await t.test("returns empty string for non-string input", () => {
    assert.equal(sanitizeEmail(null), "");
    assert.equal(sanitizeEmail(12345), "");
  });
});

test("escapeXml", async (t) => {
  await t.test("escapes all five special characters", () => {
    assert.equal(
      escapeXml(`<a href="x">Tom & Jerry's</a>`),
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;",
    );
  });

  await t.test("leaves plain text unchanged", () => {
    assert.equal(
      escapeXml("plain text, no special chars"),
      "plain text, no special chars",
    );
  });

  await t.test("returns empty string for falsy input", () => {
    assert.equal(escapeXml(""), "");
    assert.equal(escapeXml(null), "");
    assert.equal(escapeXml(undefined), "");
  });
});

test("matchesFilter — regression test for the case-sensitivity bug", async (t) => {
  await t.test(
    "'all' filter matches everything, including empty category",
    () => {
      assert.equal(matchesFilter("Technology", "all"), true);
      assert.equal(matchesFilter("", "all"), true);
    },
  );

  await t.test("matches when category and filter share the same case", () => {
    assert.equal(matchesFilter("Technology", "Technology"), true);
  });

  await t.test(
    "matches when category is lowercase (as stored/displayed) and filter is capitalized (as in data-filter attributes) — this is the exact scenario that broke every filter button before the fix",
    () => {
      assert.equal(matchesFilter("technology", "Technology"), true);
      assert.equal(matchesFilter("thoughts", "Thoughts"), true);
      assert.equal(matchesFilter("entertainment", "Entertainment"), true);
    },
  );

  await t.test("does not match a genuinely different category", () => {
    assert.equal(matchesFilter("Technology", "Writing"), false);
  });

  await t.test("returns false for posts with no category", () => {
    assert.equal(matchesFilter(null, "Technology"), false);
    assert.equal(matchesFilter("", "Technology"), false);
  });

  await t.test(
    "matches partial/multi-category strings (e.g. 'Code, Ideas')",
    () => {
      assert.equal(matchesFilter("Code, Ideas", "Code"), true);
      assert.equal(matchesFilter("Code, Ideas", "code"), true);
    },
  );
});

test("buildPagination", async (t) => {
  await t.test("computes correct metadata for the first page", () => {
    assert.deepEqual(buildPagination({ total: 25, page: 1, limit: 10 }), {
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasPrev: false,
      hasNext: true,
      offset: 0,
    });
  });

  await t.test("clamps page numbers to at least one", () => {
    assert.deepEqual(buildPagination({ total: 15, page: 0, limit: 5 }), {
      page: 1,
      limit: 5,
      total: 15,
      totalPages: 3,
      hasPrev: false,
      hasNext: true,
      offset: 0,
    });
  });
});
