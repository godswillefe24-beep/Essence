const API = `${window.location.origin}/api`;
const PASSWORD = "";

let isLoggedIn = false;
// The admin session is held in an HttpOnly cookie; no JWT is exposed to JS.

function adminFetch(url, options = {}) {
  return fetch(url, { ...options, credentials: "include" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function renderTopPosts(containerId, posts, metric) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.replaceChildren();
  if (!Array.isArray(posts) || posts.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No data yet";
    empty.style.opacity = "0.7";
    container.appendChild(empty);
    return;
  }

  posts.forEach((post) => {
    const item = document.createElement("div");
    item.className = "item";

    const info = document.createElement("div");
    info.className = "item-info";

    const title = document.createElement("h3");
    title.textContent = post.title || `Post ${post.postId}`;
    info.appendChild(title);

    const count = document.createElement("p");
    count.textContent = `${Number(post[metric]) || 0} ${metric}`;
    info.appendChild(count);

    item.appendChild(info);
    container.appendChild(item);
  });
}

// DOM Elements - will be initialized after DOM loads
let loginContainer;
let dashboard;
let loginForm;
let passwordInput;
let logoutBtn;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  console.log("Admin dashboard loaded");

  // Initialize DOM elements after DOM is ready
  loginContainer = document.getElementById("login-container");
  dashboard = document.getElementById("dashboard");
  loginForm = document.getElementById("login-form");
  passwordInput = document.getElementById("password");
  logoutBtn = document.getElementById("logout-btn");

  setupEventListeners();
});

function setupEventListeners() {
  // Login
  loginForm.addEventListener("submit", handleLogin);

  // Navigation
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document
        .querySelectorAll(".nav-btn")
        .forEach((b) => b.classList.remove("active"));
      e.target.closest(".nav-btn").classList.add("active");

      const section = e.target.closest(".nav-btn").dataset.section;
      showSection(section);
    });
  });

  // Logout
  logoutBtn.addEventListener("click", handleLogout);

  // Post Modal
  const postModal = document.getElementById("post-modal");
  document.getElementById("new-post-btn").addEventListener("click", () => {
    document.getElementById("modal-title").textContent = "New Post";
    document.getElementById("edit-post-id").value = "";
    document.getElementById("post-form").reset();
    postModal.classList.remove("hidden");
  });

  document.querySelectorAll(".modal-close").forEach((btn) => {
    btn.addEventListener("click", () => {
      postModal.classList.add("hidden");
      document.getElementById("edit-post-id").value = "";
    });
  });

  document
    .getElementById("post-form")
    .addEventListener("submit", handlePostSubmit);

  // Save Settings
  document
    .getElementById("save-settings-btn")
    .addEventListener("click", handleSaveSettings);
}

async function handleLogin(e) {
  e.preventDefault();

  try {
    const response = await adminFetch(`${API}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput.value }),
    });

    if (response.ok) {
      const data = await response.json();

      isLoggedIn = true;
      loginContainer.classList.add("hidden");
      dashboard.classList.remove("hidden");
      loadDashboardData();
    } else {
      alert("Invalid password");
      passwordInput.value = "";
    }
  } catch (error) {
    console.error("Login error:", error);
    alert("Login failed: " + error.message);
  }
}

function handleLogout() {
  isLoggedIn = false;
  adminFetch(`${API}/admin/logout`, { method: "POST" }).catch(() => {});

  loginContainer.classList.remove("hidden");
  dashboard.classList.add("hidden");
  passwordInput.value = "";
}

async function handlePostSubmit(e) {
  e.preventDefault();
  const postModal = document.getElementById("post-modal");
  const editPostId = document.getElementById("edit-post-id").value;

  const title = document.getElementById("post-title").value.trim();
  const content = document.getElementById("post-content").value.trim();
  const category = document.getElementById("post-category").value.trim();

  if (!title || !content || !category) {
    alert("Please fill in all fields");
    return;
  }

  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = true;

  try {
    const method = editPostId ? "PUT" : "POST";
    const endpoint = editPostId
      ? `${API}/admin/posts/${editPostId}`
      : `${API}/admin/posts`;

    const response = await adminFetch(endpoint, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        
      },
      body: JSON.stringify({
        // id is only meaningful on edit (identifies which post to update).
        // On create, the server now generates the id/slug from the title
        // itself — sending a client-made id here would just be ignored.
        ...(editPostId && { id: editPostId }),
        title,
        content,
        category,
        date: new Date().toISOString(),
      }),
    });

    if (response.ok) {
      alert(
        editPostId
          ? "✓ Post updated successfully!"
          : "✓ Post created successfully!",
      );
      document.getElementById("post-form").reset();
      document.getElementById("edit-post-id").value = "";
      postModal.classList.add("hidden");
      loadPosts();
    } else {
      const error = await response.json();
      alert("Failed to save post: " + (error.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Post save error:", error);
    alert("Error saving post: " + error.message);
  } finally {
    submitBtn.disabled = false;
  }
}

async function handleSaveSettings() {
  const blogTitle = document.getElementById("blog-title").value.trim();
  const blogDescription = document
    .getElementById("blog-description")
    .value.trim();
  const newPassword = document.getElementById("new-password").value;

  if (!blogTitle || !blogDescription) {
    alert("Please fill in all required fields");
    return;
  }

  try {
    const response = await adminFetch(`${API}/admin/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        
      },
      body: JSON.stringify({
        title: blogTitle,
        description: blogDescription,
        password: newPassword || undefined,
      }),
    });

    if (response.ok) {
      alert("✓ Settings saved successfully!");
    } else {
      const error = await response.json();
      alert("Failed to save settings: " + (error.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Settings save error:", error);
    alert("Error saving settings: " + error.message);
  }
}

function showSection(sectionName) {
  document
    .querySelectorAll(".section")
    .forEach((s) => s.classList.remove("active"));
  const section = document.getElementById(sectionName);
  if (section) {
    section.classList.add("active");

    // Load data for the section
    if (sectionName === "posts") loadPosts();
    if (sectionName === "comments") loadComments();
    if (sectionName === "subscribers") loadSubscribers();
  }
}

async function loadDashboardData() {
  try {
    const response = await adminFetch(`${API}/admin/stats`, {

    });
    if (!response.ok) throw new Error(`Stats request failed (${response.status})`);

    const data = await response.json();
    document.getElementById("stat-posts").textContent = data.totalPosts || 0;
    document.getElementById("stat-comments").textContent = data.totalComments || 0;
    document.getElementById("stat-likes").textContent = data.totalLikes || 0;
    document.getElementById("stat-subscribers").textContent =
      data.totalSubscribers || 0;
    renderTopPosts("top-views-list", data.topPostsByViews, "views");
    renderTopPosts("top-likes-list", data.topPostsByLikes, "likes");
  } catch (e) {
    console.log("Could not load dashboard stats:", e.message);
    document.getElementById("stat-posts").textContent = 0;
    document.getElementById("stat-comments").textContent = 0;
    document.getElementById("stat-likes").textContent = 0;
    document.getElementById("stat-subscribers").textContent = 0;
    renderTopPosts("top-views-list", [], "views");
    renderTopPosts("top-likes-list", [], "likes");
  }

  // Load current settings to prefill form.
  try {
    const sres = await adminFetch(`${API}/admin/settings`, {

    });
    if (sres.ok) {
      const settings = await sres.json();
      if (settings.title) document.getElementById("blog-title").value = settings.title;
      if (settings.description) {
        document.getElementById("blog-description").value = settings.description;
      }
    }
  } catch (e) {
    console.log("Could not load settings:", e.message);
  }
}

async function loadPosts() {
  try {
    const response = await fetch(`${API}/posts?limit=1000`);
    if (response.ok) {
      const data = await response.json();
      const posts = Array.isArray(data) ? data : data.posts || [];
      const container = document.getElementById("posts-list");
      container.innerHTML = (posts || [])
        .map(
          (post) => `
        <div class="item">
          <div class="item-info">
            <h3>${escapeHtml(post.title)}</h3>
            <p>${escapeHtml(post.category)} • ${escapeHtml(new Date(post.date || Date.now()).toLocaleDateString())}</p>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm" onclick="editPost('${escapeHtml(post.id)}')">Edit</button>
            <button class="btn btn-sm btn-secondary" onclick="deletePost('${escapeHtml(post.id)}')">Delete</button>
          </div>
        </div>
      `,
        )
        .join("");
    }
  } catch (e) {
    console.log("Could not load posts:", e.message);
    document.getElementById("posts-list").innerHTML = "<p>No posts yet</p>";
  }
}

async function editPost(postId) {
  try {
    // The list endpoint intentionally returns preview fields only. Fetch the
    // full record so opening an existing post never replaces its body with the
    // 160-character excerpt on the next save.
    const response = await fetch(`${API}/posts/${encodeURIComponent(postId)}`);
    if (!response.ok) throw new Error(`Post request failed (${response.status})`);

    const post = await response.json();
    const postModal = document.getElementById("post-modal");
    document.getElementById("modal-title").textContent = "Edit Post";
    document.getElementById("edit-post-id").value = post.id;
    document.getElementById("post-title").value = post.title || "";
    document.getElementById("post-content").value = post.content || post.excerpt || "";
    document.getElementById("post-category").value = post.category || "";
    postModal.classList.remove("hidden");
  } catch (error) {
    console.error("Error loading post:", error);
    alert("Error loading post: " + error.message);
  }
}

async function deletePost(postId) {
  if (!confirm("Are you sure you want to delete this post?")) return;

  try {
    const response = await adminFetch(`${API}/admin/posts/${postId}`, {
      method: "DELETE",

    });

    if (response.ok) {
      alert("✓ Post deleted successfully!");
      loadPosts();
    } else {
      alert("Failed to delete post");
    }
  } catch (error) {
    console.error("Delete error:", error);
    alert("Error deleting post");
  }
}

async function loadComments() {
  try {
    const response = await adminFetch(`${API}/admin/comments`, {

    });
    if (response.ok) {
      const comments = await response.json();
      const container = document.getElementById("comments-list");
      container.innerHTML = (comments || [])
        .map(
          (comment) => `
        <div class="item">
          <div class="item-info">
            <h3>${escapeHtml(comment.name)}</h3>
            <p>${escapeHtml(String(comment.text || "").substring(0, 100))}...</p>
            <p style="font-size: 0.8rem; margin-top: 5px;">${escapeHtml(new Date(comment.timestamp).toLocaleDateString())}</p>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-secondary" onclick="deleteComment('${escapeHtml(comment.id)}')">Delete</button>
          </div>
        </div>
      `,
        )
        .join("");
    }
  } catch (e) {
    console.log("Could not load comments:", e.message);
    document.getElementById("comments-list").innerHTML =
      "<p>No comments yet</p>";
  }
}

async function deleteComment(commentId) {
  if (!confirm("Are you sure you want to delete this comment?")) return;

  try {
    const response = await adminFetch(`${API}/admin/comments/${commentId}`, {
      method: "DELETE",

    });

    if (response.ok) {
      alert("✓ Comment deleted successfully!");
      loadComments();
    } else {
      alert("Failed to delete comment");
    }
  } catch (error) {
    console.error("Delete error:", error);
    alert("Error deleting comment");
  }
}

async function loadSubscribers() {
  try {
    const response = await adminFetch(`${API}/admin/subscribers`, {

    });
    if (response.ok) {
      const data = await response.json();
      const subscribers = Array.isArray(data) ? data : data.subscribers || [];
      const container = document.getElementById("subscribers-list");

      if (subscribers.length === 0) {
        container.innerHTML =
          '<p style="text-align: center; padding: 20px;">No subscribers yet</p>';
        return;
      }

      container.innerHTML = subscribers
        .map(
          (sub) => `
        <div class="item">
          <div class="item-info">
            <h3>${escapeHtml(sub.email)}</h3>
            <p>Subscribed • ${escapeHtml(new Date(sub.subscribedAt || sub.date || Date.now()).toLocaleDateString())}</p>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-secondary" onclick="deleteSubscriber('${escapeHtml(sub.id || sub.email)}')">Remove</button>
          </div>
        </div>
      `,
        )
        .join("");
    } else {
      document.getElementById("subscribers-list").innerHTML =
        "<p>Failed to load subscribers</p>";
    }
  } catch (e) {
    console.log("Could not load subscribers:", e.message);
    document.getElementById("subscribers-list").innerHTML =
      "<p>No subscribers yet</p>";
  }
}

async function deleteSubscriber(subscriberId) {
  if (!confirm("Are you sure you want to remove this subscriber?")) return;

  try {
    const response = await adminFetch(`${API}/admin/subscribers/${subscriberId}`, {
      method: "DELETE",

    });

    if (response.ok) {
      alert("✓ Subscriber removed successfully!");
      loadSubscribers();
    } else {
      alert("Failed to remove subscriber");
    }
  } catch (error) {
    console.error("Delete error:", error);
    alert("Error removing subscriber");
  }
}

console.log("Admin script ready");
