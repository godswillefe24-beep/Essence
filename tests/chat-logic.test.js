// tests/chat-logic.test.js — run with: node --test
//
// Tests chat.js's retrieval logic directly. Most of it (tokenize,
// scorePostKeyword, getRelevantPostsKeyword, buildSystemPrompt) takes data
// as plain arguments already, so no mocking is needed at all.
// getRelevantPostsEmbedding is the one exception — it calls an embedding
// API — so it accepts the embedding function as an optional parameter
// (embedFn), and tests inject a fake one instead of hitting Hugging Face
// for real or relying on experimental module-mocking APIs.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tokenize,
  scorePostKeyword,
  buildMatchedPost,
  getRelevantPostsKeyword,
  getRelevantPostsEmbedding,
  buildSystemPrompt,
  extractAssistantText,
} from "../routes/chat.js";

test("extractAssistantText", () => {
  assert.equal(
    extractAssistantText({ choices: [{ delta: { content: "streamed" } }] }),
    "streamed",
  );
  assert.equal(
    extractAssistantText({ choices: [{ message: { content: "json" } }] }),
    "json",
  );
  assert.equal(
    extractAssistantText({
      choices: [{ delta: { content: [{ type: "text", text: "parts" }] } }],
    }),
    "parts",
  );
});

test("tokenize", async (t) => {
  await t.test("lowercases and splits on whitespace", () => {
    assert.deepEqual(tokenize("Hello World"), ["hello", "world"]);
  });

  await t.test("strips punctuation", () => {
    assert.deepEqual(tokenize("What's JWT-based auth?"), [
      "what",
      "jwt",
      "based",
      "auth",
    ]);
  });

  await t.test("drops words 2 characters or shorter", () => {
    assert.deepEqual(tokenize("is a to be do"), []);
  });

  await t.test("handles empty/null input without throwing", () => {
    assert.deepEqual(tokenize(""), []);
    assert.deepEqual(tokenize(null), []);
    assert.deepEqual(tokenize(undefined), []);
  });
});

test("scorePostKeyword", async (t) => {
  const post = {
    title: "Understanding Digital Marketing",
    excerpt: "A guide to SEO and social media.",
  };

  await t.test(
    "title matches score higher than body matches (3x weight)",
    () => {
      const titleMatch = scorePostKeyword(post, ["marketing"]);
      const bodyOnlyMatch = scorePostKeyword(post, ["social"]);
      assert.ok(titleMatch > bodyOnlyMatch);
    },
  );

  await t.test("no matching terms scores 0", () => {
    assert.equal(scorePostKeyword(post, ["quantum", "computing"]), 0);
  });

  await t.test("multiple matching terms accumulate score", () => {
    const oneTerm = scorePostKeyword(post, ["marketing"]);
    const twoTerms = scorePostKeyword(post, ["marketing", "seo"]);
    assert.ok(twoTerms > oneTerm);
  });
});

test("getRelevantPostsKeyword", async (t) => {
  const posts = [
    {
      slug: "post9",
      title: "Understanding Digital Marketing",
      excerpt: "SEO, social media, email marketing.",
    },
    {
      slug: "post16",
      title: "Rare Programming Languages",
      excerpt: "Brainfuck, Whitespace, Piet.",
    },
  ];

  await t.test("returns the matching post for a relevant query", async () => {
    const results = getRelevantPostsKeyword(
      "tell me about digital marketing",
      posts,
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].slug, "post9");
  });

  await t.test(
    "returns nothing for a query below the minimum keyword score",
    () => {
      // A single incidental match (score 1) shouldn't qualify — this is the
      // exact fix for the wrong-post-citation bug found earlier.
      const results = getRelevantPostsKeyword(
        "what about brainfuck specifically",
        posts,
      );
      assert.equal(results.length, 0);
    },
  );

  await t.test("returns nothing for a completely unrelated query", () => {
    const results = getRelevantPostsKeyword("recipe for chocolate cake", posts);
    assert.equal(results.length, 0);
  });

  await t.test("returns nothing for an empty query", () => {
    const results = getRelevantPostsKeyword("", posts);
    assert.equal(results.length, 0);
  });
});

test("getRelevantPostsEmbedding — using an injected fake embedding function", async (t) => {
  // Simple 3-dimensional vectors for clarity, not real embeddings.
  const posts = [
    {
      slug: "post-a",
      title: "Post A",
      excerpt: "About A",
      embedding: JSON.stringify([1, 0, 0]),
    },
    {
      slug: "post-b",
      title: "Post B",
      excerpt: "About B",
      embedding: JSON.stringify([0, 1, 0]),
    },
    {
      slug: "post-c",
      title: "Post C",
      excerpt: "About C",
      embedding: JSON.stringify([0.9, 0.1, 0]),
    },
  ];
  const fakeEmbedFn = async () => [1, 0, 0]; // pretend the query embeds identically to post A

  await t.test("ranks the closest-matching post first", async () => {
    const results = await getRelevantPostsEmbedding(
      "query text",
      posts,
      fakeEmbedFn,
    );
    assert.equal(results[0].slug, "post-a");
  });

  await t.test("excludes posts below the similarity threshold", async () => {
    const results = await getRelevantPostsEmbedding(
      "query text",
      posts,
      fakeEmbedFn,
    );
    const slugs = results.map((r) => r.slug);
    assert.ok(!slugs.includes("post-b"));
  });

  await t.test(
    "throws when no posts have embeddings yet (caller is expected to catch and fall back to keyword search)",
    async () => {
      const postsWithoutEmbeddings = [
        { slug: "post-x", title: "X", excerpt: "x" },
      ];
      await assert.rejects(() =>
        getRelevantPostsEmbedding("query", postsWithoutEmbeddings, fakeEmbedFn),
      );
    },
  );
});

test("buildMatchedPost", async (t) => {
  await t.test(
    "falls back to the DB excerpt when the static HTML file isn't found",
    () => {
      const result = buildMatchedPost({
        slug: "nonexistent-post",
        title: "Test Post",
        excerpt: "Fallback excerpt text",
      });
      assert.equal(result.title, "Test Post");
      assert.equal(result.slug, "nonexistent-post");
      assert.equal(result.url, "/posts/nonexistent-post.html");
      assert.equal(result.excerpt, "Fallback excerpt text");
    },
  );
});

test("buildSystemPrompt", async (t) => {
  await t.test("includes page content when pageContext is provided", () => {
    const prompt = buildSystemPrompt([], {
      title: "My Post",
      url: "/posts/post1.html",
      content: "The article body text.",
    });
    assert.match(prompt, /The article body text\./);
    assert.match(prompt, /My Post/);
    assert.match(prompt, /Do not say you can't see the page/);
    assert.match(prompt, /BEGIN PAGE REFERENCE/);
  });

  await t.test("includes relevant post excerpts when provided", () => {
    const prompt = buildSystemPrompt(
      [{ title: "Related Post", excerpt: "Related content here." }],
      null,
    );
    assert.match(prompt, /Related Post/);
    assert.match(prompt, /Related content here\./);
    assert.match(prompt, /BEGIN POST REFERENCE/);
  });

  await t.test(
    "includes the 'no content' fallback instruction when nothing is provided",
    () => {
      const prompt = buildSystemPrompt([], null);
      assert.match(prompt, /say so plainly/);
    },
  );

  await t.test(
    "never claims it can't see the page when pageContext IS provided (regression test for the original bug)",
    () => {
      const prompt = buildSystemPrompt([], {
        title: "X",
        url: "/x",
        content: "Some real content.",
      });
      assert.doesNotMatch(
        prompt,
        /No specific page or post content was provided/,
      );
    },
  );
});
