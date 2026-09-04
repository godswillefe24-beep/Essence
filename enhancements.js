// ====================================================
// WORLD-CLASS BLOG ENHANCEMENT
// Reading Time, Related Posts, Social Sharing & More
// ====================================================

// ====================================================
// UTILITY FUNCTIONS
// ====================================================

/**
 * Calculate reading time based on word count
 * Average reader reads 200 words per minute
 */
function calculateReadingTime(text) {
  const wordsPerMinute = 200;
  const wordCount = text.trim().split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / wordsPerMinute);
  return readingTime;
}

/**
 * Format date to readable format
 */
function formatDate(dateString) {
  const options = { year: "numeric", month: "long", day: "numeric" };
  return new Date(dateString).toLocaleDateString("en-US", options);
}

/**
 * Get category color based on category name
 */
function getCategoryColor(category) {
  const colors = {
    writing: "#3b82f6",
    code: "#ef4444",
    ideas: "#f59e0b",
    design: "#10b981",
    tech: "#8b5cf6",
    tutorial: "#06b6d4",
  };
  return colors[category.toLowerCase()] || "#6366f1";
}

/**
 * Show toast notification
 */
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const icons = {
    success: "✓",
    error: "✕",
    info: "ℹ",
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideInUp 0.3s ease-out reverse";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Generate breadcrumbs
 */
function generateBreadcrumbs(pageType, pageName) {
  return `
    <nav class="breadcrumbs">
      <div class="breadcrumb-item"><a href="/">Home</a></div>
      <span class="breadcrumb-separator">/</span>
      <div class="breadcrumb-item"><a href="/">${pageType}</a></div>
      <span class="breadcrumb-separator">/</span>
      <div class="breadcrumb-item">${pageName}</div>
    </nav>
  `;
}

// ====================================================
// READING TIME & POST METADATA
// ====================================================

async function enhancePostMetadata() {
  const posts = document.querySelectorAll(".post, article");

  posts.forEach((post) => {
    const contentElement =
      post.querySelector(".post-preview, .post-content, .content") || post;
    const content = [...contentElement.querySelectorAll("p, li, h2, h3")]
      .filter((element) => !element.closest(".post-meta"))
      .map((element) => element.innerText)
      .join(" ");
    const readingTime = calculateReadingTime(content);

    let metaContainer = post.querySelector(".post-meta");
    if (!metaContainer) {
      metaContainer = document.createElement("div");
      metaContainer.className = "post-meta";
      post.insertAdjacentElement("afterbegin", metaContainer);
    }

    const readingLabel =
      readingTime === 1 ? "1 min read" : `${readingTime} min read`;
    const readingTimeHTML = `<span class="meta-item reading-time">📖 ${readingLabel}</span>`;

    // Guards against BOTH this function's own class ('reading-time', for
    // when it runs twice) AND index.html's separately hardcoded markup
    // ('meta-reading') — without the second check, the homepage's
    // featured post (which already shows a hand-written "⏱️ X min read")
    // would get a second, dynamically-calculated estimate appended next
    // to it, which can visibly disagree with the hardcoded value.
    if (
      !metaContainer.innerHTML.includes("reading-time") &&
      !metaContainer.innerHTML.includes("meta-reading")
    ) {
      metaContainer.innerHTML = metaContainer.innerHTML
        .replace(/⏱️\s*less than 1|📖\s*Calculating reading time\.\.\./g, "")
        .trim();
      metaContainer.insertAdjacentHTML("beforeend", readingTimeHTML);
    }
  });
}

// ====================================================
// RELATED POSTS
// ====================================================

async function loadRelatedPosts(currentPostCategory, limit = 3) {
  try {
    const response = await fetch("/api/posts?limit=1000");
    const data = await response.json();
    const posts = Array.isArray(data) ? data : data.posts || [];

    // Filter related posts by same category
    const relatedPosts = posts
      .filter((p) => p.category === currentPostCategory)
      .slice(0, limit);

    if (relatedPosts.length === 0) return;

    const relatedContainer =
      document.querySelector(".related-posts") ||
      document.createElement("section");

    if (!document.querySelector(".related-posts")) {
      relatedContainer.className = "related-posts";
      const mainContent = document.querySelector("main") || document.body;
      mainContent.appendChild(relatedContainer);
    }

    const gridHTML = `
      <h2>Related Posts</h2>
      <div class="related-posts-grid">
        ${relatedPosts
          .map(
            (post) => `
          <a href="/posts/${post.slug}.html" class="related-post-card">
            <img src="https://via.placeholder.com/400x300?text=${encodeURIComponent(post.title)}" alt="${post.title}">
            <div class="related-post-content">
              <span class="related-post-category">${post.category}</span>
              <h3 class="related-post-title">${post.title}</h3>
              <p class="related-post-excerpt">${post.excerpt}</p>
              <span class="related-post-date">${formatDate(post.date)}</span>
            </div>
          </a>
        `,
          )
          .join("")}
      </div>
    `;

    relatedContainer.innerHTML = gridHTML;
  } catch (error) {
    console.error("Error loading related posts:", error);
  }
}

// ====================================================
// SOCIAL SHARING
// ====================================================

function initializeSocialSharing() {
  const pageTitle = document.title;
  const pageUrl = window.location.href;
  const pageDescription =
    document.querySelector('meta[name="description"]')?.content || pageTitle;

  const shareContainer = document.createElement("div");
  shareContainer.className = "social-share";
  shareContainer.innerHTML = `
    <span class="share-label">Share:</span>
    <button class="share-btn share-facebook" title="Share on Facebook" onclick="shareSocial('facebook')">f</button>
    <button class="share-btn share-twitter" title="Share on Twitter" onclick="shareSocial('twitter')">𝕏</button>
    <button class="share-btn share-linkedin" title="Share on LinkedIn" onclick="shareSocial('linkedin')">in</button>
    <button class="share-btn share-copy" title="Copy link" onclick="copyShareLink()">🔗</button>
  `;

  window.shareSocial = function (platform) {
    const urls = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(pageTitle)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`,
    };

    if (urls[platform]) {
      window.open(urls[platform], "share", "width=600,height=400");
    }
  };

  window.copyShareLink = function () {
    navigator.clipboard
      .writeText(pageUrl)
      .then(() => {
        showToast("Link copied to clipboard!", "success");
      })
      .catch(() => {
        showToast("Failed to copy link", "error");
      });
  };

  // Insert after post title or at top of main content
  const insertPoint =
    document.querySelector("article") ||
    document.querySelector("main") ||
    document.body;
  insertPoint.insertAdjacentElement("beforeend", shareContainer);
}

// ====================================================
// TABLE OF CONTENTS
// (removed — script.js's generateTOCAndAuthor() replaces this; see note
// in the init() function below)
// ====================================================

// ====================================================
// ADVANCED SEARCH & FILTERING
// ====================================================

let allPosts = [];

async function initAdvancedSearch() {
  try {
    const response = await fetch("/api/posts?limit=1000");
    const data = await response.json();
    allPosts = Array.isArray(data) ? data : data.posts || [];
  } catch (error) {
    console.error("Error loading posts for search:", error);
  }
}

function performAdvancedSearch(query, filters = {}) {
  let results = allPosts;

  // Text search
  if (query.trim()) {
    const q = query.toLowerCase();
    results = results.filter(
      (post) =>
        post.title.toLowerCase().includes(q) ||
        post.excerpt.toLowerCase().includes(q) ||
        post.category.toLowerCase().includes(q),
    );
  }

  // Category filter
  if (filters.category) {
    results = results.filter((p) => p.category === filters.category);
  }

  // Date range filter
  if (filters.startDate) {
    results = results.filter(
      (p) => new Date(p.date) >= new Date(filters.startDate),
    );
  }

  if (filters.endDate) {
    results = results.filter(
      (p) => new Date(p.date) <= new Date(filters.endDate),
    );
  }

  return results;
}

// ====================================================
// ANALYTICS & TRACKING
// ====================================================

class AnalyticsTracker {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    this.pageViews = [];
    this.events = [];
    this.scrollDepth75Tracked = false;
    this.flushTimer = null;
    this.sending = false;
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  trackPageView(page, duration) {
    this.pageViews.push({
      page,
      duration,
      timestamp: new Date().toISOString(),
    });
    this.sendAnalytics();
  }

  trackEvent(eventName, eventData = {}) {
    this.events.push({
      name: eventName,
      data: {
        page: window.location.pathname,
        ...(eventData && typeof eventData === "object" ? eventData : {}),
      },
      timestamp: new Date().toISOString(),
    });
    this.scheduleSend();
  }

  scheduleSend() {
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.sendAnalytics(), 1500);
  }

  trackScrollDepth() {
    const scrollableHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    if (scrollableHeight <= 0 || this.scrollDepth75Tracked) return;

    const scrollPercentage = (window.scrollY / scrollableHeight) * 100;
    if (scrollPercentage > 75) {
      this.trackEvent("scroll_depth_75%");
      this.scrollDepth75Tracked = true;
    }
  }

  async sendAnalytics() {
    if (this.sending || (!this.pageViews.length && !this.events.length)) return;
    this.sending = true;
    const pageViews = [...this.pageViews];
    const events = [...this.events];

    try {
      const response = await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          pageViews,
          events,
        }),
      });
      if (!response.ok)
        throw new Error(`analytics request failed (${response.status})`);
      this.pageViews.splice(0, pageViews.length);
      this.events.splice(0, events.length);
    } catch (e) {
      console.log("Analytics tracking:", e);
    } finally {
      this.sending = false;
      if (this.pageViews.length || this.events.length) this.scheduleSend();
    }
  }
}

const analytics = new AnalyticsTracker();

// Track scroll depth
window.addEventListener("scroll", () => analytics.trackScrollDepth());

// ====================================================
// ADMIN DASHBOARD ENHANCEMENTS
// ====================================================

// ====================================================
// PERFORMANCE MONITORING
// ====================================================

class PerformanceMonitor {
  static measure() {
    if (!window.performance || !window.performance.timing) return;

    const timing = window.performance.timing;
    const metrics = {
      dns: timing.domainLookupEnd - timing.domainLookupStart,
      tcp: timing.connectEnd - timing.connectStart,
      ttfb: timing.responseStart - timing.navigationStart,
      domInteractive: timing.domInteractive - timing.navigationStart,
      pageLoadTime: timing.loadEventEnd - timing.navigationStart,
    };

    console.log("Performance Metrics:", metrics);
    return metrics;
  }

  static observe() {
    if ("PerformanceObserver" in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            console.log(`${entry.name}: ${entry.duration}ms`);
          }
        });
        observer.observe({ entryTypes: ["navigation", "resource", "paint"] });
      } catch (e) {
        console.log("Performance observer not fully supported");
      }
    }
  }
}

// Run performance monitoring
window.addEventListener("load", () => {
  PerformanceMonitor.measure();
  PerformanceMonitor.observe();
});

// ====================================================
// LAZY LOADING IMAGES
// ====================================================

function initLazyLoading() {
  const images = document.querySelectorAll("img[data-src]");

  if ("IntersectionObserver" in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute("data-src");
          imageObserver.unobserve(img);
        }
      });
    });

    images.forEach((img) => imageObserver.observe(img));
  } else {
    // Fallback for older browsers
    images.forEach((img) => {
      img.src = img.dataset.src;
      img.removeAttribute("data-src");
    });
  }
}

// ====================================================
// KEYBOARD SHORTCUTS
// ====================================================

function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd + / to show help
    if ((e.ctrlKey || e.metaKey) && e.key === "/") {
      e.preventDefault();
      showHelpModal();
    }

    // Ctrl/Cmd + K to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      const searchInput = document.querySelector(".search-input");
      if (searchInput) searchInput.focus();
    }
  });
}

function showHelpModal() {
  const helpHTML = `
    <div class="modal show" onclick="this.remove()">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-header">
          Keyboard Shortcuts
          <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
        </div>
        <div style="color: var(--text-secondary);">
          <p><strong>Ctrl/Cmd + K</strong> - Focus search</p>
          <p><strong>Ctrl/Cmd + /</strong> - Show this help</p>
          <p><strong>Enter</strong> - Open selected result</p>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", helpHTML);
}

// ====================================================
// INITIALIZATION
// ====================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Initializing world-class blog enhancements...");

  // Enhance existing features
  enhancePostMetadata();
  // initializeSocialSharing() removed — duplicates the .share-btn buttons
  // already hand-built into index.html's featured post (and every post
  // page), which script.js already wires up via a single delegated click
  // handler (see script.js, initShareButtons-style handler on
  // ".share-btn"). Running both meant a second, separately-styled share
  // widget got inserted into the DOM on top of the existing one — same
  // class of duplicate-widget bug already fixed for the table-of-contents
  // below.
  // generateTableOfContents() removed — script.js now has its own TOC
  // generator (generateTOCAndAuthor, produces "On this page") that's
  // better-engineered: correctly scoped to the article from the start,
  // has its own duplicate-insertion guard, and adds smooth-scroll to the
  // links. Having both running caused two separate TOC boxes to appear
  // stacked on the same page.
  initLazyLoading();
  initKeyboardShortcuts();
  // The main script already loads the paginated post list. Do not issue a
  // second full-catalog request here; advanced search remains available as an
  // explicit opt-in helper for pages that need it.

  console.log("✓ Blog enhancements loaded");
});

// Export for use in other scripts
window.BlogEnhancements = {
  calculateReadingTime,
  formatDate,
  getCategoryColor,
  showToast,
  generateBreadcrumbs,
  loadRelatedPosts,
  performAdvancedSearch,
  analytics,
  PerformanceMonitor,
};
