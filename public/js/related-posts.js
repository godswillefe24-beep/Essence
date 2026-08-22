// public/js/related-posts.js
//
// Shows 2-3 related posts (same category, excluding the current post) near
// the end of each post page. Self-contained — doesn't depend on
// enhancements.js or the /api/posts/related/:category endpoint's fallback
// behavior (that endpoint returns unrelated posts if none match the
// category, which isn't quite right for a "related posts" section — this
// widget just shows nothing if there's genuinely nothing related, which is
// more honest than showing unrelated posts under a "Related" heading).
//
// Drop in near the end of each post page, after post-actions.js:
//   <script src="../public/js/related-posts.js"></script>

(function () {
  // Legacy posts (post1..post16): posts.id is a bare number, decoupled
  // from the slug ("post5.html" -> id "5"). Admin-created posts: id and
  // slug are the SAME string (server.js sets postMeta.slug = id on
  // creation), so for those the full slug IS the real id/slug. Try the
  // legacy numeric pattern first; fall back to the full slug otherwise —
  // that fallback is exactly what previously made this whole widget
  // silently never render on any admin-created post (the old regex
  // required digits immediately after "post", which a title-based or
  // hyphenated slug never has).
  const slugMatch = window.location.pathname.match(/\/posts\/([^/]+)\.html/);
  if (!slugMatch) return;
  const slug = slugMatch[1];
  const legacyMatch = slug.match(/^post(\d+)$/);
  const currentId = legacyMatch ? legacyMatch[1] : slug;
  const currentSlug = slug;

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  async function buildWidget() {
    let posts;
    try {
      const res = await fetch('/api/posts?limit=1000');
      const data = await res.json();
      posts = Array.isArray(data) ? data : data.posts || [];
    } catch {
      return; // fail silently — related posts are a nice-to-have, not critical
    }

    const currentPost = posts.find((p) => p.slug === currentSlug || p.id === currentId);
    if (!currentPost || !currentPost.category) return;

    const related = posts
      .filter((p) => p.slug !== currentSlug && p.category === currentPost.category)
      .slice(0, 3);

    if (related.length === 0) return;

    const article = document.querySelector('article');
    if (!article) return;

    const section = el('div', 'related-posts-widget');
    section.appendChild(el('h3', 'related-posts-title', 'Related Posts'));

    const grid = el('div', 'related-posts-grid');
    related.forEach((post) => {
      const card = el('a', 'related-post-card');
      card.href = `${post.slug}.html`;
      card.appendChild(el('span', 'related-post-category', post.category));
      card.appendChild(el('h4', 'related-post-title', post.title));
      if (post.excerpt) {
        card.appendChild(el('p', 'related-post-excerpt', post.excerpt.slice(0, 100) + (post.excerpt.length > 100 ? '…' : '')));
      }
      grid.appendChild(card);
    });
    section.appendChild(grid);

    // Insert after the like/share bar if present, otherwise after the
    // article content, but always before comments.
    const postActions = article.querySelector('.post-actions');
    const commentsSection = article.querySelector('.comments-section');

    if (postActions) {
      postActions.parentNode.insertBefore(section, postActions.nextSibling);
    } else if (commentsSection) {
      commentsSection.parentNode.insertBefore(section, commentsSection);
    } else {
      article.appendChild(section);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildWidget);
  } else {
    buildWidget();
  }
})();
