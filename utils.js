// utils.js — pure utility functions with no side effects (no DB connection,
// no server startup). Extracted from server.js specifically so they can be
// unit tested in isolation — server.js connects to Turso and calls
// app.listen() at import time, which makes it awkward to import just a
// couple of functions from it for testing.

export function sanitizeString(str) {
  if (typeof str !== "string") return "";
  return str.trim().substring(0, 5000);
}

export function sanitizeEmail(email) {
  if (typeof email !== "string") return "";
  const trimmed = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : "";
}

export function escapeXml(unsafe) {
  if (!unsafe) return "";
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
    }
  });
}

/**
 * Whether a post's category matches a selected filter value.
 * Extracted as its own function specifically because of a real bug found
 * earlier in this project: category text was lowercased before comparison,
 * but the filter value wasn't, so every filter except "All Posts" silently
 * hid every single post. This function — and its test — exist to make sure
 * that exact bug can't come back unnoticed.
 */
export function matchesFilter(postCategory, filterValue) {
  if (filterValue === "all") return true;
  if (!postCategory) return false;
  return postCategory.toLowerCase().includes(filterValue.toLowerCase());
}

/**
 * Validates a comment submission using the same rules as POST /api/comments
 * in server.js. Returns sanitized values on success so the caller doesn't
 * have to sanitize twice.
 */
export function validateComment({ postId, name, text }) {
  const sanitizedPostId = sanitizeString(postId);
  const sanitizedName = sanitizeString(name || "Anonymous");
  const sanitizedText = sanitizeString(text);

  if (!sanitizedPostId || !sanitizedText || sanitizedText.length < 2) {
    return {
      valid: false,
      error: "Missing or invalid required fields (name, text required, min 2 chars)",
    };
  }

  return {
    valid: true,
    sanitized: { postId: sanitizedPostId, name: sanitizedName, text: sanitizedText },
  };
}

/**
 * Validates a newsletter subscription email using the same rules as
 * POST /api/subscribe in server.js.
 */
export function validateSubscribeEmail(email) {
  const sanitized = sanitizeEmail(email);
  if (!sanitized) {
    return { valid: false, error: "Invalid email address" };
  }
  return { valid: true, sanitized };
}
