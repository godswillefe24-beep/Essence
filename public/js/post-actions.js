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

    const fbBtn = el("button", "post-share-btn post-share-facebook", "f");
    fbBtn.title = "Share on Facebook";
    fbBtn.addEventListener("click", () => window.open(urls.facebook, "share", "width=600,height=400"));

    const twBtn = el("button", "post-share-btn post-share-twitter", "\uD835\uDD4F");
    twBtn.title = "Share on X";
    twBtn.addEventListener("click", () => window.open(urls.twitter, "share", "width=600,height=400"));

    const liBtn = el("button", "post-share-btn post-share-linkedin", "in");
    liBtn.title = "Share on LinkedIn";
    liBtn.addEventListener("click", () => window.open(urls.linkedin, "share", "width=600,height=400"));

    const copyBtn = el("button", "post-share-btn post-share-copy", "\uD83D\uDD17");
    copyBtn.title = "Copy link";
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
