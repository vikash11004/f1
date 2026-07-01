// ============================================
// F1 PREDICTION LEAGUE — UI
// Hash Router · Toasts · Modals · Skeletons · Nav
// ============================================

import { auth, isAdmin } from './firebase.js';

// --- State ---
let currentPage = null;
const pageRenderers = {};
const toasts = [];
let toastIdCounter = 0;

// --- Page Registration ---
/**
 * Register a page renderer function
 * @param {string} page - page name (e.g., 'dashboard')
 * @param {Function} renderer - function to call when page is shown
 */
function registerPage(page, renderer) {
  pageRenderers[page] = renderer;
}

// --- Hash Router ---
/**
 * Initialize the hash router
 */
function initRouter() {
  window.addEventListener('hashchange', handleRouteChange);
  // Handle initial route
  handleRouteChange();
}

/**
 * Parse the current hash into route info
 * @returns {Object} { page, params }
 */
function parseRoute() {
  const hash = window.location.hash.slice(1) || 'auth'; // default to auth
  const parts = hash.split('/');
  const page = parts[0];
  const params = parts.slice(1);
  return { page, params };
}

/**
 * Handle route changes
 */
function handleRouteChange() {
  const { page, params } = parseRoute();

  // Auth guard
  if (!auth.currentUser && page !== 'auth') {
    navigateTo('auth');
    return;
  }

  // If user is logged in and tries to go to auth, redirect to dashboard
  if (auth.currentUser && page === 'auth') {
    navigateTo('dashboard');
    return;
  }

  // Admin guard for results page
  if (page === 'results' && !isAdmin()) {
    navigateTo('leaderboard');
    return;
  }

  showPage(page, params);
}

/**
 * Navigate to a page
 * @param {string} page - page name
 * @param {...string} params - additional URL params
 */
function navigateTo(page, ...params) {
  const hash = params.length > 0 ? `${page}/${params.join('/')}` : page;
  if (window.location.hash === `#${hash}`) {
    // Force re-render even if hash hasn't changed
    showPage(page, params);
  } else {
    window.location.hash = hash;
  }
}

/**
 * Show a page and hide all others
 * @param {string} pageName 
 * @param {Array} params 
 */
function showPage(pageName, params = []) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
  });

  // Show target page
  const pageEl = document.getElementById(`${pageName}-page`);
  if (pageEl) {
    pageEl.classList.add('active');
  }

  // Update nav active states
  updateNavActive(pageName);

  // Call page renderer if registered
  const renderer = pageRenderers[pageName];
  if (renderer) {
    renderer(...params);
  }

  currentPage = pageName;
}

/**
 * Update nav item active states
 * @param {string} activePage 
 */
function updateNavActive(activePage) {
  document.querySelectorAll('.nav-item').forEach(item => {
    const page = item.dataset.page;
    if (page === activePage) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

/**
 * Initialize navigation click handlers
 */
function initNav() {
  document.addEventListener('click', (e) => {
    const navItem = e.target.closest('.nav-item[data-page]');
    if (navItem) {
      e.preventDefault();
      navigateTo(navItem.dataset.page);
      
      // Close mobile menu if open
      const nav = document.getElementById('header-nav');
      if (nav && nav.classList.contains('mobile-open')) {
        nav.classList.remove('mobile-open');
      }
    }
  });

  const mobileBtn = document.getElementById('mobile-menu-btn');
  if (mobileBtn) {
    mobileBtn.addEventListener('click', () => {
      const nav = document.getElementById('header-nav');
      if (nav) nav.classList.toggle('mobile-open');
    });
  }
}

// --- Toast System ---
/**
 * Show a toast notification
 * @param {string} message 
 * @param {string} type - 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - auto-dismiss in ms (default 3000)
 */
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  // Max 3 toasts
  while (toasts.length >= 3) {
    dismissToast(toasts[0].id);
  }

  const id = ++toastIdCounter;
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${type}`;
  toastEl.id = `toast-${id}`;
  toastEl.setAttribute('role', 'alert');
  toastEl.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ'}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Dismiss" data-toast-id="${id}">×</button>
  `;

  container.appendChild(toastEl);
  
  const toast = { id, element: toastEl };
  toasts.push(toast);

  // Close button
  toastEl.querySelector('.toast-close').addEventListener('click', () => {
    dismissToast(id);
  });

  // Auto-dismiss
  if (duration > 0) {
    toast.timer = setTimeout(() => {
      dismissToast(id);
    }, duration);
  }

  return id;
}

/**
 * Dismiss a toast by ID
 * @param {number} id 
 */
function dismissToast(id) {
  const index = toasts.findIndex(t => t.id === id);
  if (index === -1) return;

  const toast = toasts[index];
  clearTimeout(toast.timer);
  
  toast.element.classList.add('dismissing');
  setTimeout(() => {
    toast.element.remove();
    toasts.splice(index, 1);
  }, 300);
}

// --- Modal System ---
/**
 * Show a confirmation modal
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} options.confirmText - text for confirm button (default 'Confirm')
 * @param {string} options.cancelText - text for cancel button (default 'Cancel')
 * @param {boolean} options.danger - if true, confirm button is red
 * @param {Function} options.onConfirm - callback on confirm
 * @param {Function} options.onCancel - callback on cancel
 */
function showModal({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false, onConfirm, onCancel }) {
  const container = document.getElementById('modal-container');
  if (!container) return;

  container.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h2 class="modal-title" id="modal-title">${title}</h2>
        </div>
        <div class="modal-body">
          <p class="modal-message">${message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="modal-cancel">${cancelText}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm">${confirmText}</button>
        </div>
      </div>
    </div>
  `;

  container.classList.remove('hidden');

  // Event listeners
  const handleClose = () => {
    container.classList.add('hidden');
    container.innerHTML = '';
  };

  document.getElementById('modal-cancel').addEventListener('click', () => {
    handleClose();
    onCancel?.();
  });

  document.getElementById('modal-confirm').addEventListener('click', () => {
    handleClose();
    onConfirm?.();
  });

  // Close on overlay click
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
      onCancel?.();
    }
  });

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      handleClose();
      onCancel?.();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Focus trap — focus the cancel button
  document.getElementById('modal-cancel').focus();
}

// --- Skeleton System ---
/**
 * Show skeleton loading in a container
 * @param {HTMLElement} container 
 * @param {string} template - skeleton HTML
 */
function showSkeleton(container, template) {
  if (!container) return;
  container.innerHTML = template;
  container.classList.add('loading');
}

/**
 * Hide skeleton loading
 * @param {HTMLElement} container 
 */
function hideSkeleton(container) {
  if (!container) return;
  container.classList.remove('loading');
}

/**
 * Generate card skeleton HTML
 * @param {number} count 
 * @returns {string}
 */
function cardSkeletonHTML(count = 4) {
  return Array.from({ length: count }, (_, i) =>
    `<div class="skeleton skeleton-card stagger-${i + 1}"></div>`
  ).join('');
}

/**
 * Generate row skeleton HTML
 * @param {number} count 
 * @returns {string}
 */
function rowSkeletonHTML(count = 10) {
  return Array.from({ length: count }, (_, i) =>
    `<div class="skeleton skeleton-row stagger-${(i % 6) + 1}"></div>`
  ).join('');
}

// --- Side Panel ---
/**
 * Open a side panel
 * @param {string} html - panel content HTML
 */
function openSidePanel(html) {
  const overlay = document.getElementById('side-panel-overlay');
  const panel = document.getElementById('side-panel');
  if (!overlay || !panel) return;

  panel.innerHTML = html;
  overlay.classList.add('open');
  panel.classList.add('open');

  // Close handlers (bind only once)
  if (!overlay._closeBound) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSidePanel();
    });
    overlay._closeBound = true;
  }

  // Focus first input in panel
  const firstInput = panel.querySelector('input, button, select');
  if (firstInput) firstInput.focus();
}

/**
 * Close the side panel
 */
function closeSidePanel() {
  const overlay = document.getElementById('side-panel-overlay');
  const panel = document.getElementById('side-panel');
  if (overlay) overlay.classList.remove('open');
  if (panel) panel.classList.remove('open');
}

// --- Utility: Debounce ---
/**
 * Debounce a function
 * @param {Function} fn 
 * @param {number} delay 
 * @returns {Function}
 */
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// --- Utility: Format Date ---
/**
 * Calculate countdown from now to a target date
 * @param {string} dateStr - ISO date string
 * @returns {Object} { days, hours, minutes, seconds, total, passed }
 */
function getCountdown(dateStr) {
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diff = target - now;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0, passed: true };
  }

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
    total: diff,
    passed: false
  };
}

/**
 * Pad a number with leading zero
 * @param {number} n 
 * @returns {string}
 */
function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Format round number
 * @param {number} round 
 * @returns {string} e.g., "R01"
 */
function formatRound(round) {
  return `R${String(round).padStart(2, '0')}`;
}

// --- Exports ---
export {
  registerPage,
  initRouter,
  parseRoute,
  navigateTo,
  showPage,
  initNav,
  showToast,
  dismissToast,
  showModal,
  showSkeleton,
  hideSkeleton,
  cardSkeletonHTML,
  rowSkeletonHTML,
  openSidePanel,
  closeSidePanel,
  debounce,
  getCountdown,
  pad,
  formatRound,
  currentPage
};
