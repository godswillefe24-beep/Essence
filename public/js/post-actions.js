// public/js/post-actions.js
//
// Adds a like button (per-post, backed by /api/analytics/like/:postId) and
// share buttons to individual post pages. Self-contained — doesn't depend
// on enhancements.js (which only runs on the homepage and pulls in several
// other features not asked for here).
//
// Drop in near the end of each post page, after ../script.js:
//   <link rel="stylesheet" href="../public/css/post-actions.css">
//   <script src="../public/js/post-actions.js"></script>

(function () {
  // Legacy posts (post1..post16): posts.id is a bare number, decoupled
  // from the slug ("post5.html" -> id "5"). Admin-created posts: id and
  // slug are the SAME string (server.js sets postMeta.slug = id on
  // creation), so for those the full slug IS the real id. Try the legacy
  // numeric pattern first; fall back to the full slug otherwise — that
  // fallback is exactly what previously made this whole widget silently
  // not render at all on any admin-created post (the old regex required
  // digits immediately after "post", which a hyphenated id never has).
  const slugMatch = window.location.pathname.match(/\/posts\/([^/]+)\.html/);
  if (!slugMatch) return; // not a post page, nothing to do
  const slug = slugMatch[1];
  const legacyMatch = slug.match(/^post(\d+)$/);
  const postId = legacyMatch ? legacyMatch[1] : slug;

  const LIKED_KEY = `essence-liked-${postId}`;

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function shareUrls(pageTitle, pageUrl) {
    return {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(pageTitle)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`,
    };
  }

  function showCopiedFeedback(button) {
    const original = button.textContent;
    button.textContent = "Copied!";
    setTimeout(() => {
      button.textContent = original;
    }, 1500);
  }

  async function buildWidget() {
    const article = document.querySelector("article");
    if (!article) return;

    const container = el("div", "post-actions");

    // ---- Like button ----
    const likeBtn = el("button", "post-like-btn");
    const likeIcon = el("span", "post-like-icon", "\u2764\ufe0f");
    const likeCount = el("span", "post-like-count", "\u2026");
    likeBtn.appendChild(likeIcon);
    likeBtn.appendChild(likeCount);

    const alreadyLiked = localStorage.getItem(LIKED_KEY) === "true";
    if (alreadyLiked) likeBtn.classList.add("liked");

    try {
      const res = await fetch(`/api/analytics/likes/${postId}`);
      const data = await res.json();
      likeCount.textContent = data.likes;
    } catch {
      likeCount.textContent = "0";
    }

    likeBtn.addEventListener("click", async () => {
      const isLiked = likeBtn.classList.contains("liked");
      const endpoint = isLiked
        ? `/api/analytics/unlike/${postId}`
        : `/api/analytics/like/${postId}`;

      likeBtn.disabled = true;
      try {
        const res = await fetch(endpoint, { method: "POST" });
        const data = await res.json();
        likeCount.textContent = data.likes;
        likeBtn.classList.toggle("liked", !isLiked);
        localStorage.setItem(LIKED_KEY, String(!isLiked));
      } catch {
        // silently ignore — not critical to page function
      } finally {
        likeBtn.disabled = false;
      }
    });

    // ---- Share buttons ----
    const shareWrap = el("div", "post-share");
    shareWrap.appendChild(el("span", "post-share-label", "Share:"));

    const urls = shareUrls(document.title, window.location.href);

    const fbBtn = el("button", "post-share-btn post-share-facebook");
    fbBtn.innerHTML =
      '<svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="M13.5 22v-8h2.75l.41-3h-3.16V9.08c0-.87.24-1.46 1.5-1.46h1.8V4.94c-.31-.04-1.38-.14-2.63-.14-2.6 0-4.38 1.59-4.38 4.5V11H7v3h2.79v8h3.71Z" /></svg>';
    fbBtn.title = "Share on Facebook";
    fbBtn.setAttribute("aria-label", "Share on Facebook");
    fbBtn.addEventListener("click", () =>
      window.open(urls.facebook, "share", "width=600,height=400"),
    );

    const twBtn = el("button", "post-share-btn post-share-twitter");
    twBtn.innerHTML =
      '<svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="M18.9 2H22l-6.77 7.74L23.2 22h-6.25l-4.9-6.4L6.45 22H3.33l7.24-8.28L2.8 2h6.4l4.43 5.86L18.9 2Zm-1.1 17.9h1.73L8.26 3.98H6.4L17.8 19.9Z" /></svg>';
    twBtn.title = "Share on X";
    twBtn.setAttribute("aria-label", "Share on X");
    twBtn.addEventListener("click", () =>
      window.open(urls.twitter, "share", "width=600,height=400"),
    );

    const liBtn = el("button", "post-share-btn post-share-linkedin");
    liBtn.innerHTML =
      '<svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="M6.5 8.25H3V21h3.5V8.25ZM4.75 3A2.05 2.05 0 1 0 4.75 7.1 2.05 2.05 0 0 0 4.75 3ZM21 13.67c0-3.82-2.04-5.6-4.77-5.6-2.2 0-3.18 1.21-3.73 2.06V8.25H9V21h3.5v-6.3c0-1.66.31-3.27 2.37-3.27 2.03 0 2.05 1.9 2.05 3.38V21H21v-7.33Z" /></svg>';
    liBtn.title = "Share on LinkedIn";
    liBtn.setAttribute("aria-label", "Share on LinkedIn");
    liBtn.addEventListener("click", () =>
      window.open(urls.linkedin, "share", "width=600,height=400"),
    );

    const copyBtn = el("button", "post-share-btn post-share-copy");
    copyBtn.innerHTML =
      '<svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="M10.59 13.41a1.99 1.99 0 0 0 2.82 0l3.59-3.59a2 2 0 0 0-2.82-2.82l-1.3 1.3-1.42-1.42 1.3-1.3a4 4 0 0 1 5.65 5.66l-3.59 3.59a4 4 0 0 1-5.65 0l1.42-1.42Zm2.82-2.82a1.99 1.99 0 0 0-2.82 0L7 14.18A2 2 0 0 0 9.82 17l1.3-1.3 1.42 1.42-1.3 1.3a4 4 0 0 1-5.65-5.66l3.59-3.59a4 4 0 0 1 5.65 0l-1.42 1.42Z" /></svg>';
    copyBtn.title = "Copy link";
    copyBtn.setAttribute("aria-label", "Copy link to this post");
    copyBtn.addEventListener("click", () => {
      navigator.clipboard
        .writeText(window.location.href)
        .then(() => showCopiedFeedback(copyBtn))
        .catch(() => {});
    });

    shareWrap.appendChild(fbBtn);
    shareWrap.appendChild(twBtn);
    shareWrap.appendChild(liBtn);
    shareWrap.appendChild(copyBtn);

    container.appendChild(likeBtn);
    container.appendChild(shareWrap);

    // Insert right before the comments section if present, otherwise at
    // the end of the article.
    const commentsSection = article.querySelector(".comments-section");
    if (commentsSection) {
      commentsSection.parentNode.insertBefore(container, commentsSection);
    } else {
      article.appendChild(container);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
