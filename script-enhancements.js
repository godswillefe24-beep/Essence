// ====================================================
// WORLD-CLASS BLOG ENHANCEMENTS - SCRIPT ADDITIONS
// ====================================================

// ====================================================
// SEO & METADATA ENHANCEMENTS
// ====================================================

/**
 * Update page metadata dynamically
 */
function updatePageMetadata(title, description, imageUrl) {
  document.title = title;
  
  // Update meta description
  let descMeta = document.querySelector('meta[name="description"]');
  if (!descMeta) {
    descMeta = document.createElement('meta');
    descMeta.name = 'description';
    document.head.appendChild(descMeta);
  }
  descMeta.content = description;
  
  // Update OG tags
  ['og:title', 'twitter:title'].forEach(attr => {
    let meta = document.querySelector(`meta[property="${attr}"], meta[name="${attr}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('property', attr);
      document.head.appendChild(meta);
    }
    meta.content = title;
  });
  
  ['og:description', 'twitter:description'].forEach(attr => {
    let meta = document.querySelector(`meta[property="${attr}"], meta[name="${attr}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('property', attr);
      document.head.appendChild(meta);
    }
    meta.content = description;
  });
  
  if (imageUrl) {
    let ogImage = document.querySelector('meta[property="og:image"]');
    if (!ogImage) {
      ogImage = document.createElement('meta');
      ogImage.setAttribute('property', 'og:image');
      document.head.appendChild(ogImage);
    }
    ogImage.content = imageUrl;
  }
}

// ====================================================
// ENHANCED SEARCH WITH SUGGESTIONS
// ====================================================

let searchSuggestions = [];

async function loadSearchSuggestions() {
  try {
    const response = await fetch(`${API_BASE}/posts`);
    const posts = await response.json();
    
    // Extract unique words from titles for suggestions
    searchSuggestions = [
      ...new Set(
        posts.flatMap(p => p.title.split(' ').filter(w => w.length > 3))
      )
    ].slice(0, 20);
  } catch (e) {
    console.log('Search suggestions load failed:', e);
  }
}

function showSearchSuggestions(query) {
  if (!query || query.length < 2) return;
  
  const suggestions = searchSuggestions.filter(s => 
    s.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 5);
  
  if (suggestions.length > 0) {
    console.log('Suggestions:', suggestions);
  }
}

const searchInput = document.querySelector('.search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    showSearchSuggestions(e.target.value);
  });
  loadSearchSuggestions();
}

// ====================================================
// LAZY LOADING & PERFORMANCE
// ====================================================

/**
 * Lazy load images with Intersection Observer
 */
function initLazyImages() {
  const images = document.querySelectorAll('img[data-src]');
  
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          img.classList.add('loaded');
          imageObserver.unobserve(img);
        }
      });
    }, { rootMargin: '50px' });
    
    images.forEach(img => imageObserver.observe(img));
  }
}

/**
 * Track page performance metrics
 */
function trackPerformance() {
  if (window.performance && window.performance.timing) {
    window.addEventListener('load', () => {
      const timing = performance.timing;
      const metrics = {
        'DNS Lookup': timing.domainLookupEnd - timing.domainLookupStart,
        'TCP Connection': timing.connectEnd - timing.connectStart,
        'Time to First Byte': timing.responseStart - timing.navigationStart,
        'DOM Interactive': timing.domInteractive - timing.navigationStart,
        'Page Load Time': timing.loadEventEnd - timing.navigationStart
      };
      
      console.log('%c⚡ Performance Metrics:', 'color: #3b82f6; font-weight: bold;');
      Object.entries(metrics).forEach(([key, value]) => {
        console.log(`${key}: ${value}ms`);
      });
    });
  }
}

// ====================================================
// CONTENT RECOMMENDATIONS
// ====================================================

/**
 * Get personalized content recommendations
 */
async function getRecommendations(currentCategory) {
  try {
    const response = await fetch(`${API_BASE}/posts/related/${currentCategory}`);
    const recommendations = await response.json();
    return recommendations;
  } catch (error) {
    console.log('Recommendations load failed:', error);
    return [];
  }
}

/**
 * Display recommendations in sidebar
 */
async function displayRecommendations(currentCategory) {
  const recommendations = await getRecommendations(currentCategory);
  
  if (recommendations.length === 0) return;
  
  const container = document.querySelector('.sidebar-recommendations') || 
    document.createElement('div');
  
  container.className = 'sidebar-recommendations card';
  container.innerHTML = `
    <h3 class="card-header">📚 Recommended For You</h3>
    ${recommendations.map(post => `
      <a href="/posts/${post.slug}.html" style="
        display: block; 
        padding: 12px 0; 
        border-bottom: 1px solid var(--border);
        color: var(--accent);
        text-decoration: none;
        font-weight: 500;
        transition: all 0.2s;
      " class="recommendation-link">
        ${post.title}
        <span style="display: block; font-size: 0.85rem; color: var(--muted); font-weight: normal;">
          ${post.category}
        </span>
      </a>
    `).join('')}
  `;
  
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.appendChild(container);
  }
}

// ====================================================
// ENGAGEMENT TRACKING
// ====================================================

/**
 * Track user engagement
 */
class EngagementTracker {
  constructor() {
    this.scrolledPosts = new Set();
    this.clickedLinks = [];
    this.sessionStart = Date.now();
  }
  
  trackPostView(postId) {
    if (!this.scrolledPosts.has(postId)) {
      this.scrolledPosts.add(postId);
      this.sendEngagementEvent('post_view', { postId });
    }
  }
  
  trackLinkClick(href) {
    this.clickedLinks.push({ href, timestamp: Date.now() });
    this.sendEngagementEvent('link_click', { href });
  }
  
  trackTimeSpent() {
    const timeSpent = Date.now() - this.sessionStart;
    if (timeSpent > 30000) { // Track if spent > 30s
      this.sendEngagementEvent('session', { timeSpent });
    }
  }
  
  sendEngagementEvent(event, data) {
    // Send to analytics
    fetch(`${API_BASE}/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        data,
        timestamp: new Date().toISOString()
      })
    }).catch(() => {});
  }
}

const engagementTracker = new EngagementTracker();

// Track time spent on page
window.addEventListener('beforeunload', () => {
  engagementTracker.trackTimeSpent();
});

// ====================================================
// ACCESSIBILITY IMPROVEMENTS
// ====================================================

/**
 * Add keyboard navigation
 */
function initKeyboardNav() {
  const links = document.querySelectorAll('a, button');
  const focusableElements = Array.from(links);
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      // Trap focus within content
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    }
    
    // Search focus (Ctrl/Cmd + K)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput?.focus();
    }
  });
}

// ====================================================
// PRINTING ENHANCEMENTS
// ====================================================

/**
 * Handle print functionality
 */
function setupPrintSupport() {
  document.addEventListener('beforeprint', () => {
    document.body.classList.add('is-printing');
    // Hide non-essential elements
    document.querySelectorAll('.no-print, .theme-toggle, .back-to-top').forEach(el => {
      el.style.display = 'none';
    });
  });
  
  document.addEventListener('afterprint', () => {
    document.body.classList.remove('is-printing');
    document.querySelectorAll('.no-print, .theme-toggle, .back-to-top').forEach(el => {
      el.style.display = '';
    });
  });
}

// ====================================================
// PROGRESSIVE WEB APP SUPPORT
// ====================================================

/**
 * Register service worker for PWA functionality
 */
function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').then(reg => {
        console.log('✓ Service Worker registered');
      }).catch(err => {
        console.log('Service Worker registration failed:', err);
      });
    });
  }
}

// ====================================================
// NOTIFICATIONS & USER FEEDBACK
// ====================================================

/**
 * Enhanced notification system
 */
function showNotification(message, type = 'info', duration = 3000) {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 30px;
    left: 30px;
    padding: 16px 24px;
    background: var(--card);
    border-left: 4px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
    z-index: 999;
    animation: slideInUp 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, duration);
}

// ====================================================
// INITIALIZATION
// ====================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Loading world-class blog enhancements...');
  
  // Initialize features
  initLazyImages();
  trackPerformance();
  initKeyboardNav();
  setupPrintSupport();
  initPWA();
  
  // Load recommendations if on a post
  const category = document.body.dataset.category;
  if (category) {
    displayRecommendations(category);
  }
  
  console.log('✓ All enhancements loaded successfully');
});

// ====================================================
// EXPORT ENHANCED API
// ====================================================

window.BlogAPI = {
  updateMetadata: updatePageMetadata,
  getRecommendations,
  trackEngagement: (event, data) => engagementTracker.sendEngagementEvent(event, data),
  showNotification,
  trackPerformance
};

console.log('%c🌟 Blog enhancements ready! Use window.BlogAPI for advanced features.', 'color: #3b82f6; font-weight: bold; font-size: 12px;');
