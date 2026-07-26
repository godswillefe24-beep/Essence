// embeddings.js — shared helper for getting text embeddings from Hugging
// Face's free Inference API (hosted, not run locally — avoids the RAM cost
// of loading a model into your own Render process).
//
// Setup:
//   Get a free token at https://huggingface.co/settings/tokens (no card required)
//   Add to .env: HF_TOKEN=hf_xxxxxxxxxxxx

const HF_MODEL = "sentence-transformers/all-MiniLM-L6-v2";
const HF_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

/**
 * Get a single embedding vector (array of floats) for a piece of text.
 * Handles both response shapes HF's feature-extraction task can return:
 * a flat sentence vector, or a per-token 2D array (mean-pooled here if so).
 * Retries once with wait_for_model on a cold-start 503.
 */
export async function getEmbedding(text, { retried = false } = {}) {
  if (!process.env.HF_TOKEN) {
    throw new Error("HF_TOKEN environment variable is not set.");
  }

  const response = await fetch(HF_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: text.slice(0, 8000), // keep well within the model's input limit
      options: { wait_for_model: true },
    }),
  });

  if (response.status === 503 && !retried) {
    // Model is cold-starting on HF's side — wait a moment and retry once.
    await new Promise((r) => setTimeout(r, 4000));
    return getEmbedding(text, { retried: true });
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `HF embeddings request failed (${response.status}): ${errText}`,
    );
  }

  const data = await response.json();

  // Flat vector: [0.1, 0.2, ...]
  if (Array.isArray(data) && typeof data[0] === "number") {
    return data;
  }

  // Per-token vectors: [[...], [...], ...] — mean-pool into one sentence vector.
  if (Array.isArray(data) && Array.isArray(data[0])) {
    const dims = data[0].length;
    const pooled = new Array(dims).fill(0);
    for (const tokenVec of data) {
      for (let i = 0; i < dims; i++) pooled[i] += tokenVec[i];
    }
    return pooled.map((v) => v / data.length);
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
