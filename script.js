// ==========================================
// API CONFIGURATION
// ==========================================
const API_BASE = 'http://localhost:3001/api';

// ==========================================
// CLIENT-SIDE DATABASE (LocalStorage)
// ==========================================

class BlogDatabase {
  constructor() {
    this.dbName = 'BlogDB';
    this.init();
  }

  init() {
    this.loadOrCreateData();
  }

  loadOrCreateData() {
    if (!localStorage.getItem('blog_data')) {
      const defaultData = {
        subscribers: [],
        comments: [],
        likes: {},
        postViews: {},
        darkMode: false,
        likedItems: [],
        saveTime: new Date().toLocaleString()
      };
      localStorage.setItem('blog_data', JSON.stringify(defaultData));
    }
  }

  getData() {
    return JSON.parse(localStorage.getItem('blog_data'));
  }

  saveData(data) {
    data.saveTime = new Date().toLocaleString();
    localStorage.setItem('blog_data', JSON.stringify(data));
  }

  setDarkMode(enabled) {
    const data = this.getData();
    data.darkMode = enabled;
    this.saveData(data);
  }

  getDarkMode() {
    return this.getData().darkMode;
  }

  getLikes(postId) {
    return this.getData().likes[postId] || 0;
  }

  isPostLiked(postId) {
    const data = this.getData();
    return data.likedItems?.includes(`post_${postId}`) || false;
  }

  likePost(postId) {
    const data = this.getData();
    const itemId = `post_${postId}`;
    
    if (!data.likedItems) {
      data.likedItems = [];
    }
    
    if (data.likedItems.includes(itemId)) {
      // Unlike
      data.likedItems = data.likedItems.filter(id => id !== itemId);
      data.likes[postId] = (data.likes[postId] || 1) - 1;
    } else {
      // Like
      data.likedItems.push(itemId);
      data.likes[postId] = (data.likes[postId] || 0) + 1;
    }
    
    this.saveData(data);
    return {
      success: true,
      likes: data.likes[postId]
    };
  }

  exportData() {
    return JSON.stringify(this.getData(), null, 2);
  }
}

// Initialize database
const db = new BlogDatabase();

// ==========================================
// USER AUTHENTICATION
// ==========================================

class AuthManager {
  constructor() {
    this.token = localStorage.getItem('auth_token');
    this.user = JSON.parse(localStorage.getItem('auth_user') || 'null');
    this.init();
  }

  init() {
    this.setupAuthUI();
    this.setupAuthModal();
    if (this.token) {
      this.validateToken();
    }
  }

  setupAuthUI() {
    const authBtn = document.getElementById('auth-btn');
    const userDropdown = document.getElementById('user-profile-dropdown');

    // Only setup auth UI if elements exist (they won't on post pages)
    if (!authBtn || !userDropdown) return;

    // Make sure we have latest user data
    if (!this.user && localStorage.getItem('auth_user')) {
      this.user = JSON.parse(localStorage.getItem('auth_user'));
      console.log('Loaded user from localStorage:', this.user.username);
    }

    if (this.user) {
      console.log('✓ Setting up logged-in UI for:', this.user.username);
      authBtn.textContent = `👤 ${this.user.username}`;
      authBtn.classList.add('logged-in');
      authBtn.onclick = (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('hidden');
      };
      this.updateUserProfile();
    } else {
      console.log('Setting up logged-out UI');
      authBtn.textContent = '👤 Login';
      authBtn.classList.remove('logged-in');
      authBtn.onclick = () => {
        const modal = document.getElementById('auth-modal');
        if (modal) modal.classList.remove('hidden');
      };
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.auth-header-btn') && !e.target.closest('.user-dropdown')) {
        userDropdown.classList.add('hidden');
      }
    });
  }

  setupAuthModal() {
    const modal = document.getElementById('auth-modal');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const closeBtn = document.querySelector('.modal-close');
    const tabs = document.querySelectorAll('.auth-tab');

    // Only setup auth modal if elements exist (they won't on post pages)
    if (!modal || !loginForm || !registerForm || !closeBtn || tabs.length === 0) return;

    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        
        tab.classList.add('active');
        const formId = `${tab.dataset.tab}-form`;
        document.getElementById(formId).classList.add('active');
      });
    });

    loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    registerForm.addEventListener('submit', (e) => this.handleRegister(e));
  }

  async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const message = document.getElementById('login-message');

    message.textContent = 'Logging in...';
    message.className = 'auth-message';

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok && data.token && data.user) {
        this.setAuth(data.token, data.user);
        message.textContent = 'Login successful!';
        message.className = 'auth-message success';
        
        setTimeout(() => {
          document.getElementById('auth-modal').classList.add('hidden');
          document.getElementById('login-form').reset();
          location.reload();
        }, 800);
      } else {
        message.textContent = data.error || 'Login failed';
        message.className = 'auth-message error';
      }
    } catch (error) {
      message.textContent = 'Error: ' + error.message;
      message.className = 'auth-message error';
    }
  }

  async handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm').value;
    const message = document.getElementById('register-message');

    message.textContent = 'Creating account...';
    message.className = 'auth-message';

    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, confirmPassword })
      });

      const data = await response.json();

      if (response.ok) {
        this.setAuth(data.token, data.user);
        message.textContent = 'Account created successfully!';
        message.className = 'auth-message success';
        
        setTimeout(() => {
          document.getElementById('auth-modal').classList.add('hidden');
          document.getElementById('register-form').reset();
          location.reload();
        }, 1500);
      } else {
        message.textContent = data.error || 'Registration failed';
        message.className = 'auth-message error';
      }
    } catch (error) {
      message.textContent = 'Error: Server not responding';
      message.className = 'auth-message error';
    }
  }

  setAuth(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
  }

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    location.reload();
  }

  async validateToken() {
    try {
      const response = await fetch(`${API_BASE}/auth/validate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (!response.ok) {
        console.log('Token validation failed, logging out');
        this.logout();
      } else {
        const data = await response.json();
        this.user = data.user;
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        console.log('✓ Token valid, user:', this.user.username);
      }
    } catch (error) {
      console.log('Token validation error (server may not be available):', error.message);
      // Don't logout on network error - user data might still be valid
    }
  }

  updateUserProfile() {
    const userInfo = document.getElementById('user-info');
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
        </div>
      `;

      const logoutBtn = document.getElementById('logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => this.logout());
      }
    }
  }
}

// Initialize auth manager
const authManager = new AuthManager();

// ==========================================
// SERVICE WORKER REGISTRATION (PWA)
// ==========================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => {
        console.log('✓ Service Worker registered successfully', reg);
        
        // Check for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showNotification('New version available! Refresh to update.', 'info');
            }
          });
        });
      })
      .catch(error => console.log('Service Worker registration failed:', error));
  });
}

// ==========================================
// DARK MODE TOGGLE
// ==========================================

const themeToggle = document.querySelector('.theme-toggle, .theme-btn');
if (themeToggle) {
  const isDarkMode = db.getDarkMode();
  if (isDarkMode) {
    document.body.classList.add('dark-mode');
    themeToggle.textContent = '☀️';
  }

  themeToggle.addEventListener('click', function() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    db.setDarkMode(isDark);
    this.textContent = isDark ? '☀️' : '🌙';
    showNotification(isDark ? 'Dark mode enabled 🌙' : 'Light mode enabled ☀️', 'success');
  });
}

// ==========================================
// READING PROGRESS BAR
// ==========================================

const readingProgress = document.querySelector('.reading-progress');
window.addEventListener('scroll', function() {
  const windowHeight = document.documentElement.scrollHeight - window.innerHeight;
  const scrolled = (window.scrollY / windowHeight) * 100;
  if (readingProgress) {
    readingProgress.style.width = scrolled + '%';
  }

  // Back to top button visibility
  const backToTop = document.querySelector('.back-to-top');
  if (window.scrollY > 300) {
    backToTop.classList.add('show');
  } else {
    backToTop.classList.remove('show');
  }
});

// ==========================================
// BACK TO TOP BUTTON
// ==========================================

const backToTop = document.querySelector('.back-to-top');
if (backToTop) {
  backToTop.addEventListener('click', function() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ==========================================
// SEARCH & FILTER FUNCTIONALITY
// ==========================================

const searchInput = document.querySelector('.search-input');
const filterButtons = document.querySelectorAll('.filter-btn');
let currentFilter = 'all';

function filterAndSearchPosts() {
  const searchTerm = searchInput?.value.toLowerCase() || '';
  const posts = document.querySelectorAll('.post-card');

  posts.forEach(post => {
    const title = post.querySelector('h3')?.textContent.toLowerCase() || '';
    const category = post.querySelector('.post-category')?.textContent.toLowerCase() || '';
    const excerpt = post.querySelector('.post-excerpt')?.textContent.toLowerCase() || '';

    const matchesSearch = title.includes(searchTerm) || excerpt.includes(searchTerm);
    const matchesFilter = currentFilter === 'all' || category.includes(currentFilter.toLowerCase());

    if (matchesSearch && matchesFilter) {
      post.style.display = 'block';
      post.style.animation = 'fadeIn 0.3s ease-out';
    } else {
      post.style.display = 'none';
    }
  });
}

if (searchInput) {
  searchInput.addEventListener('input', filterAndSearchPosts);
}

filterButtons.forEach(btn => {
  btn.addEventListener('click', function() {
    filterButtons.forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    currentFilter = this.dataset.filter;
    filterAndSearchPosts();
    showNotification(`Filtering by: ${currentFilter === 'all' ? 'All Posts' : currentFilter}`, 'info');
  });
});

// ==========================================
// SHARE BUTTONS
// ==========================================

document.querySelectorAll('.share-btn').forEach(btn => {
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    const shareType = this.dataset.share;
    const pageUrl = window.location.href;
    const pageTitle = document.title;

    const shareUrls = {
      twitter: `https://twitter.com/intent/tweet?url=${pageUrl}&text=${pageTitle}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${pageUrl}`,
      copy: null
    };

    if (shareType === 'copy') {
      navigator.clipboard.writeText(pageUrl).then(() => {
        showNotification('✓ Link copied to clipboard!', 'success');
      });
    } else if (shareUrls[shareType]) {
      window.open(shareUrls[shareType], '_blank', 'width=600,height=400');
      showNotification(`Shared on ${shareType.charAt(0).toUpperCase() + shareType.slice(1)}!`, 'success');
    }
  });
});

// ==========================================
// ANALYTICS DASHBOARD
// ==========================================

async function updateAnalytics() {
  try {
    const response = await fetch(`${API_BASE}/analytics`);
    if (response.ok) {
      const analytics = await response.json();
      
      const postsElement = document.getElementById('total-posts');
      const likesElement = document.getElementById('total-likes');
      const subscribersElement = document.getElementById('total-subscribers');

      if (postsElement) postsElement.textContent = document.querySelectorAll('.post-card').length;
      if (likesElement) likesElement.textContent = analytics.totalLikes;
      if (subscribersElement) subscribersElement.textContent = analytics.totalSubscribers;
    }
  } catch (error) {
    console.log('Analytics API not available, using local data');
    const data = db.getData();
    const totalLikes = Object.values(data.likes).reduce((a, b) => a + b, 0);
    
    const likesElement = document.getElementById('total-likes');
    if (likesElement) likesElement.textContent = totalLikes;
  }
}

updateAnalytics();

// Update analytics when data changes
setInterval(updateAnalytics, 5000);

// ==========================================
// COMMENTS SECTION FUNCTIONALITY
// ==========================================

async function loadComments(postId) {
  const commentsSection = document.querySelector(`[data-post-id="${postId}"]`);
  if (!commentsSection) return;

  const commentsList = commentsSection.querySelector('.comments-list');
  const commentsCount = commentsSection.querySelector('.comments-count');
  
  try {
    const response = await fetch(`${API_BASE}/comments/${postId}`);
    if (response.ok) {
      const comments = await response.json();
      
      commentsCount.textContent = comments.length;

      if (comments.length === 0) {
        commentsList.innerHTML = '<div class="no-comments">Be the first to comment! 💭</div>';
        return;
      }

      commentsList.innerHTML = comments.map(comment => `
        <div class="comment-item" data-comment-id="${comment.id}">
          <div class="comment-header">
            <div>
              <span class="comment-author">👤 ${escapeHtml(comment.name)}</span>
              <span class="comment-time">${new Date(comment.timestamp).toLocaleString()}</span>
            </div>
          </div>
          <p class="comment-text">${escapeHtml(comment.text)}</p>
        </div>
      `).join('');
    }
  } catch (error) {
    console.log('Comments API not available');
    commentsList.innerHTML = '<div class="no-comments">Comments feature temporarily unavailable</div>';
  }
}

// Handle comment submission
document.querySelectorAll('.comments-section').forEach(section => {
  const postId = section.dataset.postId;
  const nameInput = section.querySelector('.comment-name');
  const textInput = section.querySelector('.comment-text');
  const submitBtn = section.querySelector('.comment-submit');

  // Hide name input for authenticated users
  if (authManager.user && nameInput) {
    nameInput.style.display = 'none';
  }

  // Load initial comments
  loadComments(postId);

  if (submitBtn) {
    submitBtn.addEventListener('click', async function() {
      const name = nameInput.value.trim();
      const text = textInput.value.trim();

      // If not logged in, require name
      if (!authManager.user && !name) {
        showNotification('Please enter your name', 'error');
        nameInput.focus();
        return;
      }

      if (!text) {
        showNotification('Please write a comment', 'error');
        textInput.focus();
        return;
      }

      if (text.length > 500) {
        showNotification('Comment must be less than 500 characters', 'error');
        return;
      }

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (authManager.token) {
          headers['Authorization'] = `Bearer ${authManager.token}`;
        }

        const response = await fetch(`${API_BASE}/comments`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ postId, name, text })
        });

        if (response.ok) {
          // Clear form
          nameInput.value = '';
          textInput.value = '';

          // Reload comments
          loadComments(postId);

          // Show notification
          showNotification(`✓ Comment posted successfully!`, 'success');
          showNotification(`✓ Comment posted by ${name}!`, 'success');
        } else {
          showNotification('Failed to post comment', 'error');
        }
      } catch (error) {
        showNotification('Failed to post comment - API unavailable', 'error');
        console.error('Error posting comment:', error);
      }
    });

    // Allow Enter to submit (Ctrl+Enter for multiline)
    textInput.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.key === 'Enter') {
        submitBtn.click();
      }
    });

    nameInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        textInput.focus();
      }
    });
  }
});

// Utility function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// SMOOTH SCROLL & ANCHOR NAVIGATION
// ============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href === '#') return; // Skip empty anchors
    
    e.preventDefault();
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// ============================================
// INTERSECTION OBSERVER FOR SCROLL ANIMATIONS
// ============================================
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver(function(entries) {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in-view');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// Observe all elements
document.querySelectorAll('.post-card, .sidebar-widget, .featured-post, .post-link, .read-more, .tag').forEach(el => {
  observer.observe(el);
});

// ============================================
// FEATURED POST INTERACTIONS
// ============================================
const featuredPost = document.querySelector('.featured-post');
if (featuredPost) {
  featuredPost.addEventListener('mouseenter', function() {
    this.style.boxShadow = '0 20px 50px rgba(99, 102, 241, 0.3)';
  });
  
  featuredPost.addEventListener('mouseleave', function() {
    this.style.boxShadow = 'var(--shadow)';
  });
  
  // Click handler for featured post
  const featuredLink = featuredPost.querySelector('h2 a');
  if (featuredLink) {
    featuredPost.style.cursor = 'pointer';
    featuredPost.addEventListener('click', function(e) {
      if (e.target.tagName !== 'A') {
        window.location.href = featuredLink.href;
      }
    });
  }
}

// ============================================
// POST CARDS INTERACTIONS
// ============================================
document.querySelectorAll('.post-card').forEach((card, index) => {
  const postId = card.dataset.postId || index;
  card.dataset.postId = postId;
  
  // Add like button if not exists
  let likeBtn = card.querySelector('.like-btn');
  if (!likeBtn) {
    const likes = db.getLikes(postId);
    const isLiked = db.isPostLiked(postId);
    const likeContainer = document.createElement('div');
    likeContainer.className = 'like-container';
    likeContainer.innerHTML = `
      <button class="like-btn" data-post="${postId}" ${isLiked ? 'disabled' : ''} ${isLiked ? 'style="opacity: 0.5;"' : ''}>
        <span class="heart">${isLiked ? '♥' : '♡'}</span> <span class="like-count">${likes}</span>
      </button>
    `;
    const excerpt = card.querySelector('.post-excerpt') || card.querySelector('.post-link');
    if (excerpt) {
      excerpt.parentNode.insertBefore(likeContainer, excerpt.nextSibling);
    }
    likeBtn = likeContainer.querySelector('.like-btn');
  }
  
  if (likeBtn) {
    likeBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const result = db.likePost(postId);
      
      if (result.success) {
        card.querySelector('.like-count').textContent = result.likes;
        this.classList.add('liked');
        this.querySelector('.heart').textContent = '♥';
        this.disabled = true;
        
        // Update analytics on backend
        fetch(`${API_BASE}/analytics/like`, { method: 'POST' }).catch(() => {
          console.log('Backend not available');
        });
        
        setTimeout(() => {
          this.classList.remove('liked');
          this.querySelector('.heart').textContent = '♡';
        }, 500);
        
        showNotification(`❤️ You liked this! (${result.likes} ${result.likes === 1 ? 'like' : 'likes'})`, 'success');
        
        // Refresh analytics
        updateAnalytics();
      } else {
        this.disabled = true;
        this.style.opacity = '0.5';
        this.style.cursor = 'not-allowed';
        showNotification('✓ Already liked this post!', 'info');
      }
    });
  }
  
  // Hover state
  card.addEventListener('mouseenter', function() {
    this.style.transform = 'translateY(-12px) scale(1.02)';
    this.style.boxShadow = '0 20px 40px rgba(99, 102, 241, 0.25)';
  });
  
  card.addEventListener('mouseleave', function() {
    this.style.transform = 'translateY(0) scale(1)';
    this.style.boxShadow = 'var(--shadow)';
  });
  
  // Click handler
  const link = card.querySelector('h3 a');
  if (link) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', function(e) {
      if (e.target.tagName !== 'A' && !e.target.closest('a') && !e.target.closest('.like-btn')) {
        db.trackPostView(postId);
        window.location.href = link.href;
      }
    });
  }
  
  // Read More button animation
  const readMoreBtn = card.querySelector('.post-link');
  if (readMoreBtn) {
    readMoreBtn.addEventListener('mouseenter', function(e) {
      e.stopPropagation();
      this.style.transform = 'translateX(8px)';
      this.style.backgroundColor = 'var(--accent)';
      this.style.color = 'white';
    });
    
    readMoreBtn.addEventListener('mouseleave', function() {
      this.style.transform = 'translateX(0)';
      this.style.backgroundColor = 'transparent';
      this.style.color = 'var(--accent)';
    });
  }
});

// ============================================
// BUTTONS INTERACTIONS
// ============================================
document.querySelectorAll('.read-more, .post-link').forEach(btn => {
  btn.addEventListener('mousedown', function() {
    this.style.transform = 'scale(0.95)';
  });
  
  btn.addEventListener('mouseup', function() {
    this.style.transform = 'scale(1)';
  });
  
  btn.addEventListener('focus', function() {
    this.style.outline = '2px solid var(--accent)';
    this.style.outlineOffset = '2px';
  });
  
  btn.addEventListener('blur', function() {
    this.style.outline = 'none';
  });
});

// ============================================
// SIDEBAR WIDGETS INTERACTIONS
// ============================================
document.querySelectorAll('.sidebar-widget').forEach((widget, index) => {
  // Hover effect
  widget.addEventListener('mouseenter', function() {
    this.style.transform = 'translateY(-5px)';
    this.style.boxShadow = '0 15px 35px rgba(99, 102, 241, 0.2)';
  });
  
  widget.addEventListener('mouseleave', function() {
    this.style.transform = 'translateY(0)';
    this.style.boxShadow = 'var(--shadow)';
  });
  
  // Widget titles
  const title = widget.querySelector('h3');
  if (title) {
    title.style.cursor = 'pointer';
    title.addEventListener('click', function() {
      showNotification(`Clicked on ${this.textContent}`, 'success');
    });
  }
});

// ============================================
// TAGS INTERACTIONS
// ============================================
document.querySelectorAll('.tag').forEach((tag, index) => {
  tag.addEventListener('mouseenter', function() {
    this.style.transform = 'scale(1.1) rotate(2deg)';
    this.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.4)';
  });
  
  tag.addEventListener('mouseleave', function() {
    this.style.transform = 'scale(1) rotate(0deg)';
    this.style.boxShadow = 'none';
  });
  
  tag.addEventListener('click', function(e) {
    e.preventDefault();
    const tagName = this.textContent;
    showNotification(`Filtering by: ${tagName}`, 'success');
  });
});

// ============================================
// EMAIL INPUT INTERACTIONS
// ============================================
const emailInput = document.querySelector('.email-input');
if (emailInput) {
  emailInput.addEventListener('focus', function() {
    this.style.borderColor = 'var(--accent)';
    this.style.boxShadow = '0 0 0 4px rgba(99, 102, 241, 0.1)';
    this.style.background = 'linear-gradient(to right, #fff, rgba(99, 102, 241, 0.02))';
  });
  
  emailInput.addEventListener('blur', function() {
    this.style.borderColor = 'var(--border)';
    this.style.boxShadow = 'none';
    this.style.background = 'white';
  });
  
  emailInput.addEventListener('input', function() {
    const value = this.value;
    if (value.length > 0) {
      this.style.borderColor = 'var(--accent-light)';
    } else {
      this.style.borderColor = 'var(--border)';
    }
  });
}

// ============================================
// EMAIL INPUT INTERACTIONS
// ============================================
if (emailInput) {
  emailInput.addEventListener('focus', function() {
    this.style.borderColor = 'var(--accent)';
    this.style.boxShadow = '0 0 0 4px rgba(99, 102, 241, 0.1)';
    this.style.background = 'linear-gradient(to right, #fff, rgba(99, 102, 241, 0.02))';
  });
  
  emailInput.addEventListener('blur', function() {
    this.style.borderColor = 'var(--border)';
    this.style.boxShadow = 'none';
    this.style.background = 'white';
  });
  
  emailInput.addEventListener('input', function() {
    const value = this.value;
    if (value.length > 0) {
      this.style.borderColor = 'var(--accent-light)';
    } else {
      this.style.borderColor = 'var(--border)';
    }
  });
}

// ============================================
// SUBSCRIBE BUTTON FUNCTIONALITY
// ============================================
const subscribeBtn = document.querySelector('.subscribe-btn');

if (subscribeBtn && emailInput) {
  subscribeBtn.addEventListener('mouseenter', function() {
    this.style.transform = 'translateY(-3px)';
    this.style.boxShadow = '0 10px 30px rgba(99, 102, 241, 0.5)';
  });
  
  subscribeBtn.addEventListener('mouseleave', function() {
    this.style.transform = 'translateY(0)';
    this.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.3)';
  });

  subscribeBtn.addEventListener('click', handleSubscribe);

  // Allow Enter key to submit
  emailInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      subscribeBtn.click();
    }
  });
}

async function handleSubscribe() {
  const email = emailInput.value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (email === '') {
    showNotification('Please enter your email', 'error');
    emailInput.style.borderColor = '#ef4444';
  } else if (!emailRegex.test(email)) {
    showNotification('Please enter a valid email', 'error');
    emailInput.style.borderColor = '#ef4444';
  } else {
    try {
      const response = await fetch(`${API_BASE}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (response.ok) {
        showNotification(`✓ Welcome! Successfully subscribed!`, 'success');
        emailInput.style.borderColor = 'var(--border)';
        emailInput.value = '';
        
        // Celebration animation
        subscribeBtn.style.transform = 'scale(0.9) rotate(-5deg)';
        subscribeBtn.textContent = '✓ Subscribed';
        subscribeBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        setTimeout(() => {
          subscribeBtn.style.transform = 'scale(1) rotate(0deg)';
          subscribeBtn.textContent = 'Subscribe';
          subscribeBtn.style.background = '';
        }, 2000);
        
        // Refresh analytics
        updateAnalytics();
      } else {
        const error = await response.json();
        showNotification(error.error || 'Already subscribed with this email!', 'info');
      }
    } catch (error) {
      console.warn('Subscription API unavailable, saving locally', error);
      // Fallback: save subscriber locally
      const data = db.getData();
      data.subscribers = data.subscribers || [];
      if (!data.subscribers.includes(email)) {
        data.subscribers.push(email);
        db.saveData(data);
        showNotification('✓ Subscribed locally (offline). Thank you!', 'success');
        emailInput.value = '';
        updateAnalytics();
      } else {
        showNotification('Already subscribed (local copy).', 'info');
      }
      console.error('Error subscribing:', error);
    }
  }
}

// ============================================
// TABLE OF CONTENTS & AUTHOR BIO FOR POST PAGES
// ============================================

function generateTOCAndAuthor() {
  // Detect post article on post pages
  const article = document.querySelector('article.post-preview, article.post-article, article');
  if (!article) return;

  // Find headings inside article
  const headings = article.querySelectorAll('h2, h3');
  if (!headings || headings.length === 0) return;

  // Create TOC container
  const toc = document.createElement('nav');
  toc.className = 'post-toc';
  toc.innerHTML = '<strong>On this page</strong>';

  const list = document.createElement('ul');
  list.className = 'toc-list';

  headings.forEach((h, i) => {
    const id = h.id || `toc-${i}-${h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    h.id = id;
    const li = document.createElement('li');
    li.className = `toc-${h.tagName.toLowerCase()}`;
    li.innerHTML = `<a href="#${id}">${h.textContent}</a>`;
    list.appendChild(li);
  });

  toc.appendChild(list);

  // Insert TOC before the article
  article.parentNode.insertBefore(toc, article);

  // Create simple author bio block
  const authorName = document.querySelector('meta[name="author"]')?.content || 'Efe';
  const bio = document.createElement('div');
  bio.className = 'post-author';
  bio.innerHTML = `
    <div class="author-avatar">${(authorName || 'E').charAt(0)}</div>
    <div class="author-info">
      <div class="author-name">${authorName}</div>
      <div class="author-desc">${authorName} writes about technology, design, and web development. Follow for practical guides and thoughtful essays.</div>
    </div>
  `;

  // Append author bio after article
  article.parentNode.insertBefore(bio, article.nextSibling);

  // Smooth scroll for TOC links
  toc.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(a.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// Run TOC generator on post pages
window.addEventListener('load', generateTOCAndAuthor);

// ============================================
// HEADER & HERO INTERACTIONS
// ============================================
const header = document.querySelector('.site-header');
if (header) {
  const mainTitle = header.querySelector('.main-title');
  const tagline = header.querySelector('.tagline');
  
  if (mainTitle) {
    mainTitle.addEventListener('mouseenter', function() {
      this.style.transform = 'scale(1.05)';
      this.style.textShadow = '0 10px 20px rgba(99, 102, 241, 0.3)';
    });
    
    mainTitle.addEventListener('mouseleave', function() {
      this.style.transform = 'scale(1)';
      this.style.textShadow = 'none';
    });
  }
  
  if (tagline) {
    tagline.style.cursor = 'default';
    tagline.addEventListener('click', function() {
      showNotification('Welcome to the blog! ✨', 'success');
    });
  }
}

// ============================================
// DOTS ANIMATION (Header decoration)
// ============================================
document.querySelectorAll('.dot').forEach((dot, index) => {
  dot.addEventListener('mouseenter', function() {
    this.style.transform = 'scale(1.3)';
    this.style.boxShadow = '0 0 20px rgba(255, 255, 255, 0.8)';
  });
  
  dot.addEventListener('mouseleave', function() {
    this.style.transform = 'scale(1)';
    this.style.boxShadow = 'none';
  });
  
  dot.addEventListener('click', function() {
    showNotification(`Dot ${index + 1} clicked! ✨`, 'success');
  });
});

// ============================================
// FOOTER INTERACTIONS
// ============================================
document.querySelectorAll('.footer-section a').forEach((link, index) => {
  link.addEventListener('mouseenter', function() {
    this.style.paddingLeft = '8px';
    this.style.color = 'white';
    this.style.transition = 'all 0.3s ease';
  });
  
  link.addEventListener('mouseleave', function() {
    this.style.paddingLeft = '0px';
    this.style.color = 'rgba(255, 255, 255, 0.7)';
  });
});

// ============================================
// KEYBOARD NAVIGATION
// ============================================
document.addEventListener('keydown', function(e) {
  // Home key - scroll to top
  if (e.key === 'Home') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  
  // End key - scroll to bottom
  if (e.key === 'End') {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
  
  // ESC key - show info
  if (e.key === 'Escape') {
    showNotification('Press Home/End for navigation, or click elements to interact! 🎯', 'success');
  }
});

// ============================================
// READING TIME CALCULATION
// ============================================
document.querySelectorAll('.post-excerpt').forEach(excerpt => {
  const readingTime = calculateReadingTime(excerpt.textContent);
  const postCard = excerpt.closest('.post-card');
  
  if (postCard) {
    const metaElement = postCard.querySelector('.post-meta');
    if (metaElement && !metaElement.textContent.includes('min read')) {
      metaElement.textContent += ` • ${readingTime} min read`;
    }
  }
});

function calculateReadingTime(text) {
  const wordsPerMinute = 200;
  const words = text.split(/\s+/).length;
  const minutes = Math.ceil(words / wordsPerMinute);
  return minutes;
}

// ============================================
// PARALLAX SCROLL EFFECT
// ============================================
window.addEventListener('scroll', function() {
  const scrolled = window.pageYOffset;
  const header = document.querySelector('.site-header');
  
  if (header) {
    header.style.backgroundAttachment = 'fixed';
    header.style.backgroundPosition = `0 ${scrolled * 0.5}px`;
  }
  
  // Fade elements based on scroll
  document.querySelectorAll('.post-card').forEach(card => {
    const rect = card.getBoundingClientRect();
    const visibility = 1 - Math.abs(rect.top) / window.innerHeight;
    card.style.opacity = Math.max(0.7, visibility);
  });
});

// ============================================
// NOTIFICATION SYSTEM
// ============================================
function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: ${type === 'success' ? '#10b981' : '#ef4444'};
    color: white;
    border-radius: 8px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    animation: slideInRight 0.3s ease-out;
    max-width: 300px;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ============================================
// DYNAMIC ANIMATIONS CSS
// ============================================
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(100px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  @keyframes slideOutRight {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100px);
    }
  }
  
  @keyframes heartBeat {
    0%, 100% { transform: scale(1); }
    10%, 30% { transform: scale(1.2); }
    50% { transform: scale(1.1); }
  }
  
  .in-view {
    animation: fadeIn 0.6s ease-out !important;
  }
  
  .post-card, .sidebar-widget, .featured-post {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  * {
    transition: box-shadow 0.3s ease, transform 0.3s ease, color 0.3s ease;
  }
`;
document.head.appendChild(style);

// ============================================
// PAGE LOAD ANIMATIONS
// ============================================
window.addEventListener('load', function() {
  document.body.classList.add('page-loaded');
  console.log('%c✨ All interactive elements loaded!', 'color: #10b981; font-size: 14px; font-weight: bold;');
  
  // Animate elements on load
  document.querySelectorAll('.post-card').forEach((card, index) => {
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
  });
});

// ============================================
// IMAGE GALLERY FOR POSTS
// ============================================

const imageBtn = document.getElementById('image-btn');
const galleryModal = document.getElementById('image-gallery-modal');
const galleryList = document.getElementById('gallery-list');
const galleryLoading = document.getElementById('gallery-loading');
const modalCloseBtn = document.querySelector('.modal-close-btn');

if (imageBtn && galleryModal) {
  imageBtn.addEventListener('click', () => {
    galleryModal.classList.remove('hidden');
    loadGalleryImages();
  });
}

if (modalCloseBtn) {
  modalCloseBtn.addEventListener('click', () => {
    galleryModal.classList.add('hidden');
  });
}

if (galleryModal) {
  galleryModal.addEventListener('click', (e) => {
    if (e.target === galleryModal) {
      galleryModal.classList.add('hidden');
    }
  });
}

async function loadGalleryImages() {
  galleryLoading.style.display = 'block';
  galleryList.innerHTML = '';

  try {
    const response = await fetch('http://localhost:3001/api/images');
    if (response.ok) {
      const images = await response.json();
      galleryLoading.style.display = 'none';

      if (images.length === 0) {
        galleryList.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">No images uploaded yet. Go to admin dashboard to upload images.</p>';
        return;
      }

      galleryList.innerHTML = images.map(img => `
        <img src="${img.url}" alt="Gallery image" onclick="insertImage('${img.url}')" style="cursor: pointer;" />
      `).join('');
    } else {
      throw new Error('Failed to load images');
    }
  } catch (error) {
    galleryLoading.style.display = 'none';
    galleryList.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #ef4444;">Failed to load images. Make sure the server is running.</p>';
    console.error('Error loading gallery:', error);
  }
}

function insertImage(imageUrl) {
  const fullUrl = window.location.origin + imageUrl;
  
  // Create image HTML
  const imageHtml = `<figure style="margin: 20px 0; text-align: center;"><img src="${fullUrl}" alt="Post image" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" /><figcaption style="margin-top: 10px; color: #64748b; font-size: 0.9rem;"></figcaption></figure>`;
  
  // Insert into article
  const article = document.querySelector('article');
  if (article) {
    const newElement = document.createElement('div');
    newElement.innerHTML = imageHtml;
    article.appendChild(newElement.firstElementChild);
    showNotification('✓ Image inserted into post!', 'success');
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(`<img src="${fullUrl}" alt="Post image" style="max-width: 100%; border-radius: 8px;" />`);
    showNotification('✓ Image HTML copied to clipboard!', 'success');
  }
  
  // Close modal
  galleryModal.classList.add('hidden');
}

// ============================================
// RECENT POSTS WIDGET
// ============================================

function loadRecentPosts() {
  const recentPostsContainer = document.getElementById('recent-posts');
  if (!recentPostsContainer) return;

  const posts = [
    { title: 'Latest Technology News and Innovations', url: 'posts/post2.html' },
    { title: 'Design Principles for Better UX', url: 'posts/post3.html' },
    { title: 'Why I Started This Blog', url: 'posts/post4.html' }
  ];

  const html = posts.map(post => `
    <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
      <a href="${post.url}" style="color: var(--accent); text-decoration: none; font-weight: 500; font-size: 0.9rem; line-height: 1.4; display: block;">
        ${post.title}
      </a>
    </div>
  `).join('');

  recentPostsContainer.innerHTML = html;
}

// Load recent posts on page load
if (document.getElementById('recent-posts')) {
  loadRecentPosts();
}

// ============================================
// POPULAR POSTS WIDGET
// ============================================

function loadPopularPosts() {
  const container = document.getElementById('popular-posts');
  if (!container) return;

  // Simple static popular list (replace with analytics-driven data later)
  const popular = [
    { title: 'Welcome to my blog', url: 'posts/post1.html' },
    { title: 'Latest Technology News and Innovations', url: 'posts/post2.html' },
    { title: 'Design Principles for Better UX', url: 'posts/post3.html' }
  ];

  container.innerHTML = popular.map(p => `
    <div style="margin-bottom:10px;">
      <a href="${p.url}" style="color: var(--accent); font-weight:600;">${p.title}</a>
      <div style="font-size:0.85rem; color:var(--muted);">1.2k views</div>
    </div>
  `).join('');
}

if (document.getElementById('popular-posts')) {
  loadPopularPosts();
}

// ============================================
// CONSOLE WELCOME MESSAGE
// ============================================
console.log('%c🎉 Welcome to My Interactive Blog!', 'color: #667eea; font-size: 16px; font-weight: bold;');
console.log('%c✨ Features: ', 'color: #764ba2; font-weight: bold;');
console.log('📝 Comment on posts | ❤️ Like posts | 📧 Subscribe | 💬 Full comment system | 🌙 Dark mode | 🔍 Search');
console.log('%cType viewDatabase() to see your data!', 'color: #668ae6; font-style: italic; font-size: 11px;');
console.log('\n%c📊 DATABASE STATS:', 'color: #f59e0b; font-weight: bold; font-size: 14px;');

const dbStats = db.getData();
const totalComments = Object.values(dbStats.comments || {}).reduce((sum, arr) => sum + (arr ? arr.length : 0), 0);
console.log(`%c📧 Subscribers: ${dbStats.subscribers.length}`, 'color: #10b981; font-size: 11px;');
console.log(`%c❤️ Total Likes: ${Object.values(dbStats.likes).reduce((a, b) => a + b, 0)}`, 'color: #ef4444; font-size: 11px;');
console.log(`%c💬 Total Comments: ${totalComments}`, 'color: #06b6d4; font-size: 11px;');
console.log(`%c💾 Data last saved: ${dbStats.saveTime}`, 'color: #06b6d4; font-size: 11px;');

// Export database function
window.exportBlogData = function() {
  const data = db.exportData();
  console.log('%c📥 EXPORTED DATA:', 'color: #667eea; font-weight: bold; font-size: 12px;');
  console.log(data);
  console.log('%cCopy the above to backup!', 'color: #f59e0b; font-weight: bold;');
};

// View database function
window.viewDatabase = function() {
  const data = db.getData();
  console.table({
    'Subscribers': data.subscribers.length,
    'Total Likes': Object.values(data.likes).reduce((a, b) => a + b, 0),
    'Comments': Object.keys(data.comments).length,
    'Last Save': data.saveTime
  });
};

console.log('%cUse exportBlogData() or viewDatabase() in console!', 'color: #668ae6; font-style: italic; font-size: 11px;');
