(() => {
  const API_BASE = `${window.location.origin}/api`;

  class BlogDatabase {
    constructor() {
      this.dbName = "BlogDB";
      this.cache = null;
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
      // Eagerly cache on init
      this.cache = JSON.parse(localStorage.getItem("blog_data") || "{}");
    }

    getData() {
      // Return cached data, only parse if cache is stale
      if (this.cache) return this.cache;
      this.cache = JSON.parse(localStorage.getItem("blog_data") || "{}");
      return this.cache;
    }

    saveData(data) {
      data.saveTime = new Date().toLocaleString();
      this.cache = data;
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
        authBtn.setAttribute(
          "aria-label",
          `Open profile menu for ${this.user.username}`,
        );
        authBtn.setAttribute(
          "aria-expanded",
          userDropdown.classList.contains("hidden") ? "false" : "true",
        );
        authBtn.classList.add("logged-in");
        authBtn.onclick = (e) => {
          e.stopPropagation();
          const isHidden = userDropdown.classList.toggle("hidden");
          authBtn.setAttribute("aria-expanded", isHidden ? "false" : "true");
        };
        this.updateUserProfile();
      } else {
        authBtn.textContent = "👤 Login";
        authBtn.setAttribute("aria-label", "Open login menu");
        authBtn.setAttribute("aria-expanded", "false");
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

  function formatReadingTime(text = "", fallbackMinutes = 3) {
    const words = String(text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    const minutes = Math.max(1, Math.ceil(words / 200));
    return `${minutes} min read`;
  }

  function formatRelativeTime(value) {
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) return "just now";

    const seconds = Math.max(
      1,
      Math.floor((Date.now() - timestamp.getTime()) / 1000),
    );
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);

    if (weeks > 0) return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    return "just now";
  }

  function initReadingMeta() {
    const featuredExcerpt = document.querySelector(
      ".featured-post .featured-excerpt",
    );
    const featuredMeta = document.querySelector(".featured-post .meta-reading");
    if (featuredMeta) {
      featuredMeta.textContent = `⏱️ ${formatReadingTime(featuredExcerpt?.textContent || "")}`;
    }
  }

  function initTheme() {
    const themeToggle = document.querySelector(".theme-toggle, .theme-btn");
    if (!themeToggle) return;
    const isDarkMode = db.getDarkMode();
    if (isDarkMode) {
      document.body.classList.add("dark-mode");
      themeToggle.textContent = "☀️";
    }
    themeToggle.setAttribute(
      "aria-label",
      isDarkMode ? "Switch to light mode" : "Switch to dark mode",
    );
    themeToggle.setAttribute("aria-pressed", String(isDarkMode));
    themeToggle.addEventListener("click", () => {
      document.body.classList.toggle("dark-mode");
      const isDark = document.body.classList.contains("dark-mode");
      db.setDarkMode(isDark);
      themeToggle.textContent = isDark ? "☀️" : "🌙";
      themeToggle.setAttribute(
        "aria-label",
        isDark ? "Switch to light mode" : "Switch to dark mode",
      );
      themeToggle.setAttribute("aria-pressed", String(isDark));
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
    const postsGrid = document.getElementById("posts-grid");
    const paginationContainer = document.getElementById("posts-pagination");
    const tagsContainer =
      document.getElementById("popular-tags") ||
      document.querySelector(".sidebar-widget .tags");
    let currentFilter = "all";
    let currentPage = 1;
    let currentQuery = "";
    let currentSearchResults = [];

    const updateFilterButtons = () => {
      filterButtons.forEach((btn) => {
        const isActive = btn.dataset.filter === currentFilter;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-pressed", String(isActive));
      });
    };

    updateFilterButtons();

    if (searchInput) {
      searchInput.setAttribute("aria-label", "Search posts");
    }

    const renderPosts = (posts) => {
      if (!postsGrid) return;
      if (!posts.length) {
        postsGrid.innerHTML =
          '<div class="no-posts">No posts match this search yet.</div>';
        return;
      }

      postsGrid.innerHTML = posts
        .map(
          (post) => `
            <article class="post-card" data-post-id="${post.id}">
              <div class="post-header">
                <div class="post-category">${post.category || "Uncategorized"}</div>
              </div>
              <h3><a href="posts/${post.slug}.html">${post.title}</a></h3>
              <p class="post-meta">${new Date(post.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</p>
              <p class="post-excerpt">${post.excerpt || "Read this post to learn more."}</p>
              <a href="posts/${post.slug}.html" class="post-link">Read More →</a>
            </article>
          `,
        )
        .join("");
    };

    const renderPagination = (pagination) => {
      if (!paginationContainer) return;

      const getPageWindow = (currentPage, totalPages) => {
        const pages = [];
        const addPage = (value) => {
          if (!pages.includes(value)) {
            pages.push(value);
          }
        };

        addPage(1);
        if (currentPage > 3) {
          addPage("ellipsis-left");
        }

        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);
        for (let index = start; index <= end; index += 1) {
          addPage(index);
        }

        if (currentPage < totalPages - 2) {
          addPage("ellipsis-right");
        }

        if (totalPages > 1) {
          addPage(totalPages);
        }

        return pages;
      };

      const pageWindow = getPageWindow(pagination.page, pagination.totalPages);
      const pageButtons = pageWindow
        .map((page) => {
          if (page === "ellipsis-left" || page === "ellipsis-right") {
            return '<span class="pagination-ellipsis">…</span>';
          }

          return `
            <button
              class="pagination-btn${pagination.page === page ? " active" : ""}"
              data-page="${page}"
            >
              ${page}
            </button>
          `;
        })
        .join("");

      paginationContainer.innerHTML = `
        <div class="pagination-controls">
          <button class="pagination-btn pagination-btn-nav" data-page="prev" ${pagination.hasPrev ? "" : "disabled"}>
            ← Older
          </button>
          <div class="pagination-pages">${pageButtons}</div>
          <button class="pagination-btn pagination-btn-nav" data-page="next" ${pagination.hasNext ? "" : "disabled"}>
            Newer →
          </button>
        </div>
        <p class="pagination-summary">Page ${pagination.page} of ${pagination.totalPages}</p>
      `;

      paginationContainer
        .querySelectorAll(".pagination-btn")
        .forEach((button) => {
          button.addEventListener("click", () => {
            const requestedPage = button.dataset.page;
            if (requestedPage === "prev") {
              if (!pagination.hasPrev) return;
              currentPage = pagination.page - 1;
            } else if (requestedPage === "next") {
              if (!pagination.hasNext) return;
              currentPage = pagination.page + 1;
            } else {
              currentPage = Number(requestedPage);
            }
            loadPosts();
          });
        });
    };

    async function loadPosts() {
      const searchTerm = (searchInput?.value || "").trim();
      const query = searchTerm || currentQuery;
      const category = currentFilter === "all" ? "" : currentFilter;
      const url = new URL(`${API_BASE}/posts`, window.location.origin);
      url.searchParams.set("page", String(currentPage));
      url.searchParams.set("limit", "6");

      if (query) {
        url.searchParams.set("q", query);
      }
      if (category) {
        url.searchParams.set("category", category);
      }

      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to load posts");
        const result = await response.json();
        currentSearchResults = result.posts || [];
        renderPosts(currentSearchResults);
        renderPagination(
          result.pagination || {
            page: 1,
            totalPages: 1,
            hasPrev: false,
            hasNext: false,
          },
        );
      } catch (error) {
        if (postsGrid) {
          postsGrid.innerHTML =
            '<div class="no-posts">Unable to load posts right now.</div>';
        }
      }
    }

    let timer;
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          currentPage = 1;
          currentQuery = searchInput.value.trim();
          loadPosts();
        }, 120);
      });
    }

    document.addEventListener("keydown", (event) => {
      const activeTag = (event.target?.tagName || "").toLowerCase();
      const isTyping =
        ["input", "textarea", "select"].includes(activeTag) ||
        event.target?.isContentEditable;
      if (isTyping) return;
      if (
        (event.key === "/" &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey) ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")
      ) {
        event.preventDefault();
        searchInput?.focus();
        searchInput?.select();
      }
    });

    filterButtons.forEach((btn) => {
      btn.addEventListener("click", function () {
        currentFilter = this.dataset.filter;
        currentPage = 1;
        updateFilterButtons();
        showNotification(
          `Filtering by: ${currentFilter === "all" ? "All Posts" : currentFilter}`,
          "info",
        );
        loadPosts();
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
                currentPage = 1;
                loadPosts();
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

    loadPosts();
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

      let localComments = [];

      const escapeHtml = (text) => {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
      };

      const renderComments = (comments) => {
        commentsCount.textContent = comments.length;
        commentsList.innerHTML =
          comments.length > 0
            ? comments
                .map(
                  (comment) => `
              <div class="comment-item${comment.parentId ? " comment-reply" : ""}" data-comment-id="${comment.id}">
                <div class="comment-header">
                  <div>
                    <span class="comment-author">👤 ${escapeHtml(comment.name)}</span>
                    <span class="comment-time">${formatRelativeTime(comment.timestamp)}</span>
                  </div>
                </div>
                <p class="comment-text">${escapeHtml(comment.text)}</p>
                <button class="comment-reply-btn" type="button" data-comment-id="${comment.id}">Reply</button>
                <form class="comment-reply-form hidden">
                  <textarea rows="2" placeholder="Write a reply..."></textarea>
                  <button type="submit">Post reply</button>
                </form>
              </div>`,
                )
                .join("")
            : '<div class="no-comments">Be the first to comment! 💭</div>';

        commentsList
          .querySelectorAll(".comment-reply-btn")
          .forEach((button) => {
            button.addEventListener("click", () => {
              const form = button.parentElement.querySelector(
                ".comment-reply-form",
              );
              form?.classList.toggle("hidden");
              form?.querySelector("textarea")?.focus();
            });
          });

        commentsList.querySelectorAll(".comment-reply-form").forEach((form) => {
          form.addEventListener("submit", (event) => {
            event.preventDefault();
            const textarea = form.querySelector("textarea");
            const replyText = textarea?.value.trim();
            if (!replyText) return;
            const parentId = form.closest(".comment-item")?.dataset.commentId;
            const newReply = {
              id: `reply-${Date.now()}`,
              parentId,
              name: authManager.user?.username || "You",
              text: replyText,
              timestamp: new Date().toISOString(),
            };
            localComments = [...localComments, newReply];
            renderComments([...localComments]);
          });
        });
      };

      const loadComments = async () => {
        try {
          const response = await fetch(`${API_BASE}/comments/${postId}`);
          if (response.ok) {
            const comments = await response.json();
            localComments = comments;
            renderComments(localComments);
            return;
          }
        } catch (error) {
          // Ignore and fall back to the empty state.
        }
        renderComments(localComments);
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
          if (text.length > 500) {
            showNotification(
              "Comment must be less than 500 characters",
              "error",
            );
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

        textInput?.addEventListener("keydown", (e) => {
          if (e.ctrlKey && e.key === "Enter") submitBtn.click();
        });
      }
    });
  }

  function initSubscribe() {
    const emailInput = document.querySelector(".email-input");
    const subscribeBtn = document.querySelector(".subscribe-btn");
    if (!emailInput || !subscribeBtn) return;

    subscribeBtn.addEventListener("click", async () => {
      const email = emailInput.value.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email) {
        showNotification("Please enter your email", "error");
        return;
      }
      if (!emailRegex.test(email)) {
        showNotification("Please enter a valid email", "error");
        return;
      }
      try {
        const response = await fetch(`${API_BASE}/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        if (response.ok) {
          showNotification("✓ Successfully subscribed!", "success");
          emailInput.value = "";
        } else {
          const data = await response.json();
          showNotification(data.error || "Subscription failed", "error");
        }
      } catch (error) {
        showNotification("Subscription unavailable right now", "error");
      }
    });

    emailInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") subscribeBtn.click();
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

  // Legacy posts (post1..post16): posts.id is a bare number, decoupled
  // from the slug ("post5.html" -> id "5"). Admin-created posts: id and
  // slug are the SAME string (both "post-<timestamp>"), because
  // server.js sets `postMeta.slug = id` on creation — so for those, the
  // full slug IS the real id. One regex can't produce the right value
  // for both cases, so: try the legacy numeric pattern first, and only
  // fall back to the full slug when that doesn't match (which is exactly
  // when the URL is a "post-<timestamp>.html" admin-created post).
  function extractPostIdFromUrl(pathname) {
    const slugMatch = pathname.match(/\/posts\/([^/]+)\.html/);
    if (!slugMatch) return null;
    const slug = slugMatch[1];
    const legacyMatch = slug.match(/^post(\d+)$/);
    return legacyMatch ? legacyMatch[1] : slug;
  }

  function initPageViewTracking() {
    const postId = extractPostIdFromUrl(window.location.pathname);
    if (!postId) return;
    fetch(`${API_BASE}/analytics/view/${encodeURIComponent(postId)}`, {
      method: "POST",
    }).catch(() => {});
  }

  function generateTOCAndAuthor() {
    const article = document.querySelector(
      "article.post-preview, article.post-article, article",
    );
    if (!article) return;

    const headings = article.querySelectorAll("h2, h3");
    if (headings.length > 0 && !document.querySelector(".post-toc")) {
      const toc = document.createElement("nav");
      toc.className = "post-toc";
      toc.innerHTML = "<strong>On this page</strong>";
      const list = document.createElement("ul");
      list.className = "toc-list";

      headings.forEach((h, i) => {
        const id =
          h.id ||
          `toc-${i}-${h.textContent
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}`;
        h.id = id;
        const li = document.createElement("li");
        li.className = `toc-${h.tagName.toLowerCase()}`;
        li.innerHTML = `<a href="#${id}">${h.textContent}</a>`;
        list.appendChild(li);
      });

      toc.appendChild(list);
      article.parentNode.insertBefore(toc, article);
      toc.querySelectorAll("a").forEach((a) => {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          document
            .querySelector(a.getAttribute("href"))
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }

    if (!document.querySelector(".post-author")) {
      const authorName =
        document.querySelector('meta[name="author"]')?.content || "Efe";
      const bio = document.createElement("div");
      bio.className = "post-author";
      bio.innerHTML = `
        <div class="author-avatar">${(authorName || "E").charAt(0)}</div>
        <div class="author-info">
          <div class="author-name">${authorName}</div>
          <div class="author-desc">${authorName} writes about technology, design, and web development.</div>
        </div>`;
      article.parentNode.insertBefore(bio, article.nextSibling);
    }
  }

  const POST_MANIFEST = [
    {
      title: "Welcome to my blog",
      url: "posts/post1.html",
      date: "2025-11-26",
    },
    {
      title: "Latest Technology News and Innovations",
      url: "posts/post2.html",
      date: "2026-03-01",
    },
    {
      title: "Getting Started with Your Blog",
      url: "posts/post3.html",
      date: "2025-12-10",
    },
    {
      title: "Advanced Customization Techniques",
      url: "posts/post4.html",
      date: "2026-01-15",
    },
    {
      title: "How Computers Are Made (And Why It’s Just 0s and 1s)",
      url: "posts/post5.html",
      date: "2026-05-05",
    },
    {
      title: "The Biggest Tech Trends Defining 2026",
      url: "posts/post6.html",
      date: "2026-05-16",
    },
    {
      title: "Latest Technology Trends Shaping the Future in 2026",
      url: "posts/post7.html",
      date: "2026-05-16",
    },
    {
      title: "The Art of Great Writing",
      url: "posts/post8.html",
      date: "2026-07-03",
    },
    {
      title: "Understanding Digital Marketing",
      url: "posts/post9.html",
      date: "2026-07-03",
    },
    {
      title: "AI Tools and Productivity",
      url: "posts/post10.html",
      date: "2026-07-04",
    },
    {
      title: "Gaming and Entertainment",
      url: "posts/post11.html",
      date: "2026-07-07",
    },
    {
      title: "Education and Online Learning",
      url: "posts/post12.html",
      date: "2026-07-07",
    },
    {
      title: "Make Money Online / Online Business",
      url: "posts/post13.html",
      date: "2026-07-07",
    },
    {
      title: "How Creativity Intersects with Personal Growth",
      url: "posts/post14.html",
      date: "2026-07-07",
    },
    {
      title: "Finding Your Voice Through Self-Expression",
      url: "posts/post15.html",
      date: "2026-07-07",
    },
    {
      title:
        "Rare and Unusual Programming Languages You Probably Haven't Tried",
      url: "posts/post16.html",
      date: "2026-07-07",
    },
    {
      title: "How to Build a Writing Habit That Actually Lasts",
      url: "posts/post17.html",
      date: "2026-08-02",
    },
  ];

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
      </div>`,
      )
      .join("");
  }

  async function loadPopularPosts() {
    const container = document.getElementById("popular-posts");
    if (!container) return;

    try {
      const response = await fetch("/api/analytics");
      if (!response.ok) throw new Error("Analytics request failed");
      const data = await response.json();
      const postViews = data.postViews || {};

      const ranked = POST_MANIFEST.map((post) => {
        const postId = extractPostIdFromUrl(`/${post.url}`);
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
        </div>`,
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
    initReadingMeta();
    initProgressBar();
    initSearchAndFilters();
    initSharing();
    initComments();
    initSubscribe();
    initAnalytics();
    initServiceWorker();
    initPageViewTracking();
    loadRecentPosts();
    loadPopularPosts();
    generateTOCAndAuthor();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
