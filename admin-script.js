const API = 'http://localhost:3001/api';
const PASSWORD = 'admin123';

let isLoggedIn = false;
let adminToken = null;

// DOM Elements
const loginContainer = document.getElementById('login-container');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const passwordInput = document.getElementById('password');
const logoutBtn = document.getElementById('logout-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('Admin dashboard loaded');
  setupEventListeners();
});

function setupEventListeners() {
  // Login
  loginForm.addEventListener('submit', handleLogin);

  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      e.target.closest('.nav-btn').classList.add('active');
      
      const section = e.target.closest('.nav-btn').dataset.section;
      showSection(section);
    });
  });

  // Logout
  logoutBtn.addEventListener('click', handleLogout);

  // Post Modal
  const postModal = document.getElementById('post-modal');
  document.getElementById('new-post-btn').addEventListener('click', () => {
    document.getElementById('modal-title').textContent = 'New Post';
    postModal.classList.remove('hidden');
  });

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => postModal.classList.add('hidden'));
  });

  document.getElementById('post-form').addEventListener('submit', handlePostSubmit);

  // Save Settings
  document.getElementById('save-settings-btn').addEventListener('click', handleSaveSettings);

  // Media Upload
  document.getElementById('media-upload').addEventListener('change', handleMediaUpload);
}

async function handleMediaUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await fetch(`${API}/admin/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: formData
    });

    if (response.ok) {
      alert('Image uploaded successfully!');
      document.getElementById('media-upload').value = '';
      loadGallery();
    } else {
      alert('Failed to upload image');
    }
  } catch (error) {
    console.error('Upload error:', error);
    alert('Error uploading image');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  
  try {
    const response = await fetch(`${API}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value })
    });

    if (response.ok) {
      const data = await response.json();
      adminToken = data.token;
      isLoggedIn = true;
      loginContainer.classList.add('hidden');
      dashboard.classList.remove('hidden');
      loadDashboardData();
    } else {
      alert('Invalid password');
      passwordInput.value = '';
    }
  } catch (error) {
    console.error('Login error:', error);
    alert('Login failed: ' + error.message);
  }
}

function handleLogout() {
  isLoggedIn = false;
  adminToken = null;
  loginContainer.classList.remove('hidden');
  dashboard.classList.add('hidden');
  passwordInput.value = '';
}

async function handlePostSubmit(e) {
  e.preventDefault();
  const postModal = document.getElementById('post-modal');
  
  const title = document.getElementById('post-title').value.trim();
  const content = document.getElementById('post-content').value.trim();
  const category = document.getElementById('post-category').value.trim();
  
  if (!title || !content || !category) {
    alert('Please fill in all fields');
    return;
  }
  
  try {
    const response = await fetch(`${API}/admin/posts`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer local-token`
      },
      body: JSON.stringify({
        id: 'post-' + Date.now(),
        title,
        content,
        category,
        date: new Date().toISOString()
      })
    });
    
    if (response.ok) {
      alert('✓ Post created successfully!');
      document.getElementById('post-form').reset();
      postModal.classList.add('hidden');
      loadPosts();
    } else {
      const error = await response.json();
      alert('Failed to create post: ' + (error.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Post creation error:', error);
    alert('Error creating post: ' + error.message);
  }
}

async function handleSaveSettings() {
  const blogTitle = document.getElementById('blog-title').value.trim();
  const blogDescription = document.getElementById('blog-description').value.trim();
  const newPassword = document.getElementById('new-password').value;
  
  if (!blogTitle || !blogDescription) {
    alert('Please fill in all required fields');
    return;
  }
  
  try {
    const response = await fetch(`${API}/admin/settings`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer local-token`
      },
      body: JSON.stringify({
        title: blogTitle,
        description: blogDescription,
        password: newPassword || undefined
      })
    });
    
    if (response.ok) {
      alert('✓ Settings saved successfully!');
    } else {
      const error = await response.json();
      alert('Failed to save settings: ' + (error.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Settings save error:', error);
    alert('Error saving settings: ' + error.message);
  }
}

function showSection(sectionName) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const section = document.getElementById(sectionName);
  if (section) {
    section.classList.add('active');
    
    // Load data for the section
    if (sectionName === 'posts') loadPosts();
    if (sectionName === 'media') loadGallery();
    if (sectionName === 'comments') loadComments();
    if (sectionName === 'subscribers') loadSubscribers();
  }
}

async function loadDashboardData() {
  try {
    const response = await fetch(`${API}/analytics`);
    if (response.ok) {
      const data = await response.json();
      document.getElementById('stat-posts').textContent = 4;
      document.getElementById('stat-comments').textContent = data.totalComments || 0;
      document.getElementById('stat-likes').textContent = data.totalLikes || 0;
      document.getElementById('stat-subscribers').textContent = data.totalSubscribers || 0;
    }
  } catch (e) {
    console.log('Could not load analytics:', e.message);
    // Set defaults
    document.getElementById('stat-posts').textContent = 4;
    document.getElementById('stat-comments').textContent = 0;
    document.getElementById('stat-likes').textContent = 0;
    document.getElementById('stat-subscribers').textContent = 0;
  }
}

async function loadPosts() {
  try {
    const response = await fetch(`${API}/posts`);
    if (response.ok) {
      const posts = await response.json();
      const container = document.getElementById('posts-list');
      container.innerHTML = (posts || []).map(post => `
        <div class="item">
          <div class="item-info">
            <h3>${post.title}</h3>
            <p>${post.category} • ${new Date(post.date || Date.now()).toLocaleDateString()}</p>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm" onclick="editPost('${post.id}')">Edit</button>
            <button class="btn btn-sm btn-secondary" onclick="deletePost('${post.id}')">Delete</button>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {
    console.log('Could not load posts:', e.message);
    document.getElementById('posts-list').innerHTML = '<p>No posts yet</p>';
  }
}

async function editPost(postId) {
  alert('Edit functionality coming soon! Post ID: ' + postId);
}

async function deletePost(postId) {
  if (!confirm('Are you sure you want to delete this post?')) return;
  
  try {
    const response = await fetch(`${API}/admin/posts/${postId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer local-token` }
    });
    
    if (response.ok) {
      alert('✓ Post deleted successfully!');
      loadPosts();
    } else {
      alert('Failed to delete post');
    }
  } catch (error) {
    console.error('Delete error:', error);
    alert('Error deleting post');
  }
}

async function loadComments() {
  try {
    const response = await fetch(`${API}/comments`);
    if (response.ok) {
      const comments = await response.json();
      const container = document.getElementById('comments-list');
      container.innerHTML = (comments || []).map(comment => `
        <div class="item">
          <div class="item-info">
            <h3>${comment.name}</h3>
            <p>${comment.text.substring(0, 100)}...</p>
            <p style="font-size: 0.8rem; margin-top: 5px;">${new Date(comment.date).toLocaleDateString()}</p>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-secondary" onclick="deleteComment('${comment.id}')">Delete</button>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {
    console.log('Could not load comments:', e.message);
    document.getElementById('comments-list').innerHTML = '<p>No comments yet</p>';
  }
}

async function deleteComment(commentId) {
  if (!confirm('Are you sure you want to delete this comment?')) return;
  
  try {
    const response = await fetch(`${API}/comments/${commentId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer local-token` }
    });
    
    if (response.ok) {
      alert('✓ Comment deleted successfully!');
      loadComments();
    } else {
      alert('Failed to delete comment');
    }
  } catch (error) {
    console.error('Delete error:', error);
    alert('Error deleting comment');
  }
}

async function loadSubscribers() {
  try {
    const response = await fetch(`${API}/admin/subscribers`, {
      headers: { 'Authorization': `Bearer local-token` }
    });
    if (response.ok) {
      const data = await response.json();
      const subscribers = data.subscribers || [];
      const container = document.getElementById('subscribers-list');
      container.innerHTML = (subscribers || []).map(sub => `
        <div class="item">
          <div class="item-info">
            <h3>${sub.email}</h3>
            <p>Subscribed • ${new Date(sub.subscribedAt || Date.now()).toLocaleDateString()}</p>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-secondary">Remove</button>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {
    console.log('Could not load subscribers:', e.message);
    document.getElementById('subscribers-list').innerHTML = '<p>No subscribers yet</p>';
  }
}

async function loadGallery() {
  try {
    const response = await fetch(`${API}/admin/images`, {
      headers: { 'Authorization': `Bearer local-token` }
    });

    if (response.ok) {
      const images = await response.json();
      const gallery = document.getElementById('media-gallery');
      
      if (images.length === 0) {
        gallery.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; padding: 40px;">No images uploaded yet</p>';
        return;
      }

      gallery.innerHTML = images.map(img => `
        <div class="gallery-item">
          <img src="${img.url}" alt="${img.filename}" />
          <div class="gallery-overlay">
            <button class="btn btn-sm" onclick="copyImageUrl('${img.url}')">📋 Copy URL</button>
            <button class="btn btn-sm btn-secondary" onclick="deleteImage('${img.filename}')">🗑️ Delete</button>
          </div>
          <p class="image-info">${img.filename}</p>
        </div>
      `).join('');
    }
  } catch (e) {
    console.log('Could not load gallery:', e.message);
    document.getElementById('media-gallery').innerHTML = '<p>Failed to load gallery</p>';
  }
}

async function deleteImage(filename) {
  if (!confirm('Are you sure you want to delete this image?')) return;

  try {
    const response = await fetch(`${API}/admin/images/${filename}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer local-token` }
    });

    if (response.ok) {
      loadGallery();
    } else {
      alert('Failed to delete image');
    }
  } catch (error) {
    console.error('Delete error:', error);
    alert('Error deleting image');
  }
}

function copyImageUrl(url) {
  const fullUrl = window.location.origin + url;
  navigator.clipboard.writeText(fullUrl).then(() => {
    alert('Image URL copied to clipboard!');
  });
}

console.log('Admin script ready');
