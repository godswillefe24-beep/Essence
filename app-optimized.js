(() => {
  const API_BASE = `${window.location.origin}/api`;

  class BlogDatabase {
    constructor() {
      this.dbName = "BlogDB";
      this.init();
    }

    init() {
      if (!localStorage.getItem("blog_data")) {
        const defaultData = {
          subscribers: [],
          comments: [],
          likes: {},
          postViews: {},
          darkMode: false,
          likedItems: [],
          saveTime: new Date().toLocaleString(),
        };
        localStorage.setItem("blog_data", JSON.stringify(defaultData));
      }
    }

    getData() {
      return JSON.parse(localStorage.getItem("blog_data") || "{}") || {};
    }

    saveData(data) {
      data.saveTime = new Date().toLocaleString();
      localStorage.setItem("blog_data", JSON.stringify(data));
    }

    setDarkMode(enabled) {
      const data = this.getData();
      data.darkMode = enabled;
      this.saveData(data);
    }

    getDarkMode() {
      return this.getData().darkMode || false;
    }
  }

  const db = new BlogDatabase();

  class AuthManager {
    constructor() {
      this.token = localStorage.getItem("auth_token");
      this.user = JSON.parse(localStorage.getItem("auth_user") || "null");
    }

    init() {
      this.setupAuthUI();
      this.setupAuthModal();
      if (this.token) {
        this.defer(this.validateToken.bind(this));
      }
    }

    defer(fn) {
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => fn());
      } else {
        setTimeout(fn, 300);
      }
    }

    setupAuthUI() {
      const authBtn = document.getElementById("auth-btn");
      const userDropdown = document.getElementById("user-profile-dropdown");
      if (!authBtn || !userDropdown) return;

      if (this.user) {
        authBtn.textContent = `👤 ${this.user.username}`;
        authBtn.classList.add("logged-in");
        authBtn.onclick = (e) => {
          e.stopPropagation();
          userDropdown.classList.toggle("hidden");
        };
        this.updateUserProfile();
      } else {
        authBtn.textContent = "👤 Login";
        authBtn.classList.remove("logged-in");
        authBtn.onclick = () => {
          const modal = document.getElementById("auth-modal");
          if (modal) modal.classList.remove("hidden");
        };
      }

      document.addEventListener("click", (e) => {
        if (
          !e.target.closest(".auth-header-btn") &&
          !e.target.closest(".user-dropdown")
        ) {
          userDropdown.classList.add("hidden");
        }
      });
    }

    setupAuthModal() {
      const modal = document.getElementById("auth-modal");
      const loginForm = document.getElementById("login-form");
      const registerForm = document.getElementById("register-form");
      const closeBtn = document.querySelector(".modal-close");
      const tabs = document.querySelectorAll(".auth-tab");
      if (
        !modal ||
        !loginForm ||
        !registerForm ||
        !closeBtn ||
        tabs.length === 0
      )
        return;

      closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.add("hidden");
      });

      tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
          tabs.forEach((t) => t.classList.remove("active"));
          document
            .querySelectorAll(".auth-form")
            .forEach((f) => f.classList.remove("active"));
          tab.classList.add("active");
          document
            .getElementById(`${tab.dataset.tab}-form`)
            .classList.add("active");
        });
      });

      loginForm.addEventListener("submit", (e) => this.handleLogin(e));
      registerForm.addEventListener("submit", (e) => this.handleRegister(e));
    }

    async handleLogin(e) {
      e.preventDefault();
      const email = document.getElementById("login-email").value;
      const password = document.getElementById("login-password").value;
      const message = document.getElementById("login-message");
      message.textContent = "Logging in...";
      message.className = "auth-message";

      try {
        const response = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await response.json();
        if (response.ok && data.token && data.user) {
          this.setAuth(data.token, data.user);
          message.textContent = "Login successful!";
          message.className = "auth-message success";
          setTimeout(() => {
            document.getElementById("auth-modal").classList.add("hidden");
            document.getElementById("login-form").reset();
            location.reload();
          }, 800);
        } else {
          message.textContent = data.error || "Login failed";
          message.className = "auth-message error";
        }
      } catch (error) {
        message.textContent = `Error: ${error.message}`;
        message.className = "auth-message error";
      }
    }

    async handleRegister(e) {
      e.preventDefault();
      const username = document.getElementById("register-username").value;
      const email = document.getElementById("register-email").value;
      const password = document.getElementById("register-password").value;
      const confirmPassword = document.getElementById("register-confirm").value;
      const message = document.getElementById("register-message");
      message.textContent = "Creating account...";
      message.className = "auth-message";

      try {
        const response = await fetch(`${API_BASE}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password, confirmPassword }),
        });
        const data = await response.json();
        if (response.ok) {
          this.setAuth(data.token, data.user);
          message.textContent = "Account created successfully!";
          message.className = "auth-message success";
          setTimeout(() => {
            document.getElementById("auth-modal").classList.add("hidden");
            document.getElementById("register-form").reset();
            location.reload();
          }, 1200);
        } else {
          message.textContent = data.error || "Registration failed";
          message.className = "auth-message error";
        }
      } catch (error) {
        message.textContent = "Error: Server not responding";
        message.className = "auth-message error";
      }
    }

    setAuth(token, user) {
      this.token = token;
      this.user = user;
      localStorage.setItem("auth_token", token);
      localStorage.setItem("auth_user", JSON.stringify(user));
    }

    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      location.reload();
    }

    async validateToken() {
      try {
        const response = await fetch(`${API_BASE}/auth/validate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.token}` },
        });
        if (!response.ok) {
          this.logout();
        } else {
          const data = await response.json();
          this.user = data.user;
          localStorage.setItem("auth_user", JSON.stringify(data.user));
        }
      } catch (error) {
        // Ignore network errors and keep the UI responsive.
      }
    }

    updateUserProfile() {
      const userInfo = document.getElementById("user-info");
      if (userInfo && this.user) {
        userInfo.innerHTML = `
          <h3>${this.user.username}</h3>
          <p>${this.user.email}</p>
          <div class="user-stats">
            <div class="user-stat">
              <div class="user-stat-number">${this.user.posts || 0}</div>
              <div class="user-stat-label">Posts</div>
            </div>
            <div class="user-stat">
              <div class="user-stat-number">${this.user.comments || 0}</div>
              <div class="user-stat-label">Comments</div>
            </div>
          </div>`;
        const logoutBtn = document.getElementById("logout-btn");
        if (logoutBtn) logoutBtn.addEventListener("click", () => this.logout());
      }
    }
  }

  const authManager = new AuthManager();

  function showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `position:fixed;bottom:24px;left:24px;z-index:999;padding:12px 16px;border-radius:8px;background:var(--card,#fff);box-shadow:var(--shadow-lg,0 10px 25px rgba(0,0,0,.15));border-left:4px solid ${type === "success" ? "#10b981" : type === "error" ? "#ef4444" : "#3b82f6"};`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2600);
  }

  function initTheme() {
    const themeToggle = document.querySelector(".theme-toggle, .theme-btn");
    if (!themeToggle) return;
    const isDarkMode = db.getDarkMode();
    if (isDarkMode) {
      document.body.classList.add("dark-mode");
      themeToggle.textContent = "☀️";
    }
    themeToggle.addEventListener("click", () => {
      document.body.classList.toggle("dark-mode");
      const isDark = document.body.classList.contains("dark-mode");
      db.setDarkMode(isDark);
      themeToggle.textContent = isDark ? "☀️" : "🌙";
      showNotification(
        isDark ? "Dark mode enabled 🌙" : "Light mode enabled ☀️",
        "success",
      );
    });
  }

  function initProgressBar() {
    const readingProgress = document.querySelector(".reading-progress");
    const backToTop = document.querySelector(".back-to-top");
    let ticking = false;
    const update = () => {
      if (readingProgress) {
        const height =
          document.documentElement.scrollHeight - window.innerHeight;
        const scrolled = height > 0 ? (window.scrollY / height) * 100 : 0;
        readingProgress.style.width = `${Math.min(100, scrolled)}%`;
      }
      if (backToTop) {
        backToTop.classList.toggle("show", window.scrollY > 300);
      }
      ticking = false;
    };
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(update);
        }
      },
      { passive: true },
    );
    backToTop?.addEventListener("click", () =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  function initSearchAndFilters() {
    const searchInput = document.querySelector(".search-input");
    const filterButtons = document.querySelectorAll(".filter-btn");
    const tagsContainer =
      document.getElementById("popular-tags") ||
      document.querySelector(".sidebar-widget .tags");
    let currentFilter = "all";

    const filterAndSearchPosts = () => {
      const searchTerm = searchInput?.value.toLowerCase() || "";
      document.querySelectorAll(".post-card").forEach((post) => {
        const title = post.querySelector("h3")?.textContent.toLowerCase() || "";
        const category =
          post.querySelector(".post-category")?.textContent.toLowerCase() || "";
        const excerpt =
          post.querySelector(".post-excerpt")?.textContent.toLowerCase() || "";
        const matchesSearch =
          title.includes(searchTerm) || excerpt.includes(searchTerm);
        const matchesFilter =
          currentFilter === "all" ||
          category.includes(currentFilter.toLowerCase());
        post.style.display = matchesSearch && matchesFilter ? "block" : "none";
      });
    };

    let timer;
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(filterAndSearchPosts, 120);
      });
    }

    filterButtons.forEach((btn) => {
      btn.addEventListener("click", function () {
        filterButtons.forEach((b) => b.classList.remove("active"));
        this.classList.add("active");
        currentFilter = this.dataset.filter;
        filterAndSearchPosts();
        showNotification(
          `Filtering by: ${currentFilter === "all" ? "All Posts" : currentFilter}`,
          "info",
        );
      });
    });

    async function loadPopularTags() {
      if (!tagsContainer) return;
      try {
        const response = await fetch(`${API_BASE}/tags/popular`);
        if (response.ok) {
          const tags = await response.json();
          if (tags.length > 0) {
            tagsContainer.innerHTML = tags
              .map(
                (tag) =>
                  `<a href="#" class="tag" data-tag="${tag.name.toLowerCase()}" title="${tag.count} post${tag.count > 1 ? "s" : ""}">${tag.name}</a>`,
              )
              .join("");
            tagsContainer.querySelectorAll(".tag").forEach((tag) => {
              tag.addEventListener("click", (e) => {
                e.preventDefault();
                currentFilter = tag.dataset.tag;
                filterButtons.forEach((btn) =>
                  btn.classList.toggle(
                    "active",
                    btn.dataset.filter === currentFilter,
                  ),
                );
                filterAndSearchPosts();
              });
            });
          }
        }
      } catch (error) {
        // Silently fail to keep the page responsive.
      }
    }

    if (window.requestIdleCallback) {
      window.requestIdleCallback(loadPopularTags);
    } else {
      setTimeout(loadPopularTags, 500);
    }
  }

  function initSharing() {
    document.querySelectorAll(".share-btn").forEach((btn) => {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        const shareType = this.dataset.share;
        const pageUrl = window.location.href;
        const pageTitle = document.title;
        const shareUrls = {
          twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(pageTitle)}`,
          facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
          linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`,
        };
        if (shareType === "copy") {
          navigator.clipboard
            .writeText(pageUrl)
            .then(() =>
              showNotification("✓ Link copied to clipboard!", "success"),
            );
        } else if (shareUrls[shareType]) {
          window.open(shareUrls[shareType], "_blank", "width=600,height=400");
          showNotification(
            `Shared on ${shareType.charAt(0).toUpperCase() + shareType.slice(1)}!`,
            "success",
          );
        }
      });
    });
  }

  function initComments() {
    document.querySelectorAll(".comments-section").forEach((section) => {
      const postId = section.dataset.postId;
      const nameInput = section.querySelector(".comment-name");
      const textInput = section.querySelector(".comment-text");
      const submitBtn = section.querySelector(".comment-submit");
      const commentsList = section.querySelector(".comments-list");
      const commentsCount = section.querySelector(".comments-count");
      if (!postId || !commentsList || !commentsCount) return;

      const escapeHtml = (text) => {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
      };

      const loadComments = async () => {
        try {
          const response = await fetch(`${API_BASE}/comments/${postId}`);
          if (response.ok) {
            const comments = await response.json();
            commentsCount.textContent = comments.length;
            commentsList.innerHTML =
              comments.length > 0
                ? comments
                    .map(
                      (comment) => `
                <div class="comment-item" data-comment-id="${comment.id}">
                  <div class="comment-header">
                    <div>
                      <span class="comment-author">👤 ${escapeHtml(comment.name)}</span>
                      <span class="comment-time">${new Date(comment.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                  <p class="comment-text">${escapeHtml(comment.text)}</p>
                </div>`,
                    )
                    .join("")
                : '<div class="no-comments">Be the first to comment! 💭</div>';
          }
        } catch (error) {
          commentsList.innerHTML =
            '<div class="no-comments">Comments are temporarily unavailable.</div>';
        }
      };

      if (authManager.user && nameInput) nameInput.style.display = "none";
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => loadComments());
      } else {
        setTimeout(loadComments, 600);
      }

      if (submitBtn) {
        submitBtn.addEventListener("click", async () => {
          const name = nameInput?.value.trim() || "";
          const text = textInput?.value.trim() || "";
          if (!authManager.user && !name) {
            showNotification("Please enter your name", "error");
            nameInput?.focus();
            return;
          }
          if (!text) {
            showNotification("Please write a comment", "error");
            textInput?.focus();
            return;
          }
          try {
            const headers = { "Content-Type": "application/json" };
            if (authManager.token)
              headers.Authorization = `Bearer ${authManager.token}`;
            const response = await fetch(`${API_BASE}/comments`, {
              method: "POST",
              headers,
              body: JSON.stringify({ postId, name, text }),
            });
            if (response.ok) {
              nameInput.value = "";
              textInput.value = "";
              loadComments();
              showNotification("✓ Comment posted successfully!", "success");
            } else {
              showNotification("Failed to post comment", "error");
            }
          } catch (error) {
            showNotification("Failed to post comment", "error");
          }
        });
      }
    });
  }

  function initAnalytics() {
    const updateAnalytics = async () => {
      try {
        const response = await fetch(`${API_BASE}/analytics`);
        if (response.ok) {
          const analytics = await response.json();
          const postsElement = document.getElementById("total-posts");
          const likesElement = document.getElementById("total-likes");
          const subscribersElement =
            document.getElementById("total-subscribers");
          if (postsElement)
            postsElement.textContent =
              document.querySelectorAll(".post-card").length;
          if (likesElement) likesElement.textContent = analytics.totalLikes;
          if (subscribersElement)
            subscribersElement.textContent = analytics.totalSubscribers;
        }
      } catch (error) {
        const data = db.getData();
        const totalLikes = Object.values(data.likes || {}).reduce(
          (sum, value) => sum + value,
          0,
        );
        const likesElement = document.getElementById("total-likes");
        if (likesElement) likesElement.textContent = totalLikes;
      }
    };

    if (window.requestIdleCallback) {
      window.requestIdleCallback(updateAnalytics);
    } else {
      setTimeout(updateAnalytics, 800);
    }
    setInterval(updateAnalytics, 30000);
  }

  function initServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => {
        navigator.serviceWorker.register("/service-worker.js").catch(() => {});
      });
    } else {
      setTimeout(
        () =>
          navigator.serviceWorker
            .register("/service-worker.js")
            .catch(() => {}),
        1000,
      );
    }
  }

  // ============================================
  // POST MANIFEST
  // Your real post inventory lives only as static HTML pages + hand-written
  // homepage cards — data/posts.json (the CMS) doesn't include post9-16,
  // so it can't be used as the source of truth here. This manifest is that
  // source of truth instead; update it when you add new posts.
  // ============================================

  const POST_MANIFEST = [
    { title: "Welcome to my blog", url: "posts/post1.html", date: "2025-11-26" },
    { title: "Latest Technology News and Innovations", url: "posts/post2.html", date: "2025-11-26" },
    { title: "Getting Started with Your Blog", url: "posts/post3.html", date: "2025-11-26" },
    { title: "Advanced Customization Techniques", url: "posts/post4.html", date: "2025-11-26" },
    { title: "How Computers Are Made", url: "posts/post5.html", date: "2026-05-05" },
    { title: "The Biggest Tech Trends Defining 2026", url: "posts/post6.html", date: "2026-05-16" },
    { title: "Latest Technology Trends Shaping the Future in 2026", url: "posts/post7.html", date: "2026-05-16" },
    { title: "Content is King: The Art of Great Writing", url: "posts/post8.html", date: "2026-05-01" },
    { title: "Understanding Digital Marketing", url: "posts/post9.html", date: "2026-07-03" },
    { title: "AI Tools and Productivity", url: "posts/post10.html", date: "2026-07-04" },
    { title: "Gaming and Entertainment", url: "posts/post11.html", date: "2026-07-07" },
    { title: "Education and Online Learning", url: "posts/post12.html", date: "2026-07-07" },
    { title: "Make Money Online / Online Business", url: "posts/post13.html", date: "2026-07-07" },
    { title: "How Creativity Intersects with Personal Growth", url: "posts/post14.html", date: "2026-07-07" },
    { title: "Finding Your Voice Through Self-Expression", url: "posts/post15.html", date: "2026-07-07" },
    { title: "Rare and Unusual Programming Languages You Probably Haven't Tried", url: "posts/post16.html", date: "2026-07-07" },
  ];

  // ============================================
  // RECENT POSTS WIDGET
  // Genuinely sorted by date from the manifest above — no hardcoded order
  // to go stale next time a post is added.
  // ============================================

  function loadRecentPosts() {
    const recentPostsContainer = document.getElementById("recent-posts");
    if (!recentPostsContainer) return;

    const recent = [...POST_MANIFEST]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3);

    recentPostsContainer.innerHTML = recent
      .map(
        (post) => `
      <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
        <a href="${post.url}" style="color: var(--accent); text-decoration: none; font-weight: 500; font-size: 0.9rem; line-height: 1.4; display: block;">
          ${post.title}
        </a>
      </div>
    `,
      )
      .join("");
  }

  // ============================================
  // POPULAR POSTS WIDGET
  // Now genuinely data-driven: /api/analytics/view/:postId is called from
  // every post page (see script.js) and increments a real per-post view
  // counter that already existed server-side. This fetches those counts
  // and ranks the manifest by them. Posts with zero recorded views yet
  // (e.g. right after this goes live) simply won't outrank anything.
  // ============================================

  async function loadPopularPosts() {
    const container = document.getElementById("popular-posts");
    if (!container) return;

    try {
      const response = await fetch("/api/analytics");
      if (!response.ok) throw new Error("Analytics request failed");
      const data = await response.json();
      const postViews = data.postViews || {};

      const ranked = POST_MANIFEST.map((post) => {
        const idMatch = post.url.match(/post(\d+)\.html/);
        const postId = idMatch ? idMatch[1] : null;
        const views = postId ? postViews[postId] || 0 : 0;
        return { ...post, views };
      })
        .filter((p) => p.views > 0)
        .sort((a, b) => b.views - a.views)
        .slice(0, 4);

      if (ranked.length === 0) {
        container.innerHTML =
          '<p style="font-size:0.85rem; color:var(--muted);">No view data yet — check back soon.</p>';
        return;
      }

      container.innerHTML = ranked
        .map(
          (p) => `
        <div style="margin-bottom:10px;">
          <a href="${p.url}" style="color: var(--accent); font-weight:600;">${p.title}</a>
          <div style="font-size:0.85rem; color:var(--muted);">${p.views} view${p.views === 1 ? "" : "s"}</div>
        </div>
      `,
        )
        .join("");
    } catch (e) {
      container.innerHTML =
        '<p style="font-size:0.85rem; color:var(--muted);">Popular posts unavailable right now.</p>';
    }
  }

  function init() {
    authManager.init();
    initTheme();
    initProgressBar();
    initSearchAndFilters();
    initSharing();
    initComments();
    initAnalytics();
    initServiceWorker();
    loadRecentPosts();
    loadPopularPosts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
