// embeddings.js — shared helper for getting text embeddings from Hugging
// Face's free Inference API.
//
// Uses the official @huggingface/inference client library rather than a
// hand-rolled fetch() to a raw endpoint URL — HF has restructured their
// inference routing more than once ("Inference Providers"), and the client
// library handles that routing correctly regardless of future changes on
// their end, instead of us needing to track the exact current URL ourselves.
//
// Setup:
//   npm install @huggingface/inference
//   Get a free token at https://huggingface.co/settings/tokens (no card required)
//   Add to .env: HF_TOKEN=hf_xxxxxxxxxxxx

import { InferenceClient } from "@huggingface/inference";

const MODEL = "sentence-transformers/all-MiniLM-L6-v2";

let client = null;
function getClient() {
  if (!process.env.HF_TOKEN) {
    throw new Error("HF_TOKEN environment variable is not set.");
  }
  if (!client) {
    client = new InferenceClient(process.env.HF_TOKEN);
  }
  return client;
}

/**
 * Get a single embedding vector (array of floats) for a piece of text.
 * Handles both response shapes this task can return: a flat sentence
 * vector, or a per-token 2D array (mean-pooled here if so).
 */
export async function getEmbedding(text) {
  const hf = getClient();

  const result = await hf.featureExtraction({
    model: MODEL,
    inputs: text.slice(0, 8000), // keep well within the model's input limit
  });

  // Flat vector: [0.1, 0.2, ...]
  if (Array.isArray(result) && typeof result[0] === "number") {
    return result;
  }

  // Per-token vectors: [[...], [...], ...] — mean-pool into one sentence vector.
  if (Array.isArray(result) && Array.isArray(result[0])) {
    const dims = result[0].length;
    const pooled = new Array(dims).fill(0);
    for (const tokenVec of result) {
      for (let i = 0; i < dims; i++) pooled[i] += tokenVec[i];
    }
    return pooled.map((v) => v / result.length);
  }

  throw new Error("Unexpected embedding response shape from Hugging Face.");
}

/**
 * Cosine similarity between two equal-length vectors, range [-1, 1].
 */
export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
