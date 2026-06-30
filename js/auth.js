// ============================================
// F1 PREDICTION LEAGUE — AUTH
// Login · Signup · Session · Error handling
// ============================================

import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  setDocument,
  getDocument
} from './firebase.js';
import { seedData } from './seed.js';
import { navigateTo, showToast } from './ui.js';

// --- State ---
let authUnsubscribe = null;

/**
 * Initialize auth state listener
 * Called once on app startup
 */
function initAuth() {
  authUnsubscribe = onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log('[Auth] User signed in:', user.email);
      
      // Ensure user document exists
      const userDoc = await getDocument('users', user.uid);
      if (!userDoc) {
        await setDocument('users', user.uid, {
          displayName: user.displayName || user.email.split('@')[0],
          email: user.email,
          seasonPoints: 0,
          lastEventScore: 0,
          wins: 0
        });
      }

      // Seed data on first run
      try {
        await seedData();
      } catch (err) {
        console.error('[Auth] Seed failed:', err);
      }

      // Update UI
      updateAuthUI(user);
      
      // Navigate to dashboard if on auth page
      if (window.location.hash === '' || window.location.hash === '#auth') {
        navigateTo('dashboard');
      }
    } else {
      console.log('[Auth] User signed out');
      updateAuthUI(null);
      navigateTo('auth');
    }
  });
}

/**
 * Update header and nav UI based on auth state
 * @param {Object|null} user 
 */
function updateAuthUI(user) {
  const headerNav = document.getElementById('header-nav');
  const headerActions = document.getElementById('header-actions');
  const appHeader = document.getElementById('app-header');

  if (user) {
    if (appHeader) appHeader.classList.remove('hidden');
    if (headerActions) {
      const displayName = user.displayName || user.email.split('@')[0];
      headerActions.innerHTML = `
        <span class="header-user">
          <span class="text-body-sm">${displayName}</span>
        </span>
        <button class="btn btn-ghost btn-sm" id="btn-signout" aria-label="Sign out">
          Sign out
        </button>
      `;
      document.getElementById('btn-signout')?.addEventListener('click', handleSignOut);
    }
  } else {
    if (appHeader) appHeader.classList.add('hidden');
  }
}

/**
 * Render the auth screen
 */
function renderAuthScreen() {
  const page = document.getElementById('auth-page');
  if (!page) return;

  page.innerHTML = `
    <div class="auth-layout">
      <div class="auth-card card" id="auth-card">
        <div class="card-body" style="padding: var(--space-8);">
          <div style="text-align: center; margin-bottom: var(--space-8);">
            <h1 class="text-display-lg" style="font-size: var(--text-2xl); margin-bottom: var(--space-2);">
              F1 <span style="color: var(--accent);">PREDICT</span>
            </h1>
            <p class="text-body-sm text-muted">Predict. Compete. Win.</p>
          </div>

          <form id="auth-form" novalidate>
            <div id="name-group" class="form-group hidden">
              <label class="form-label" for="auth-name">Display Name</label>
              <input class="form-input" type="text" id="auth-name" placeholder="Your name" autocomplete="name">
              <span class="form-error hidden" id="name-error"></span>
            </div>

            <div class="form-group">
              <label class="form-label" for="auth-email">Email</label>
              <input class="form-input" type="email" id="auth-email" placeholder="you@email.com" required autocomplete="email">
              <span class="form-error hidden" id="email-error"></span>
            </div>

            <div class="form-group">
              <label class="form-label" for="auth-password">Password</label>
              <input class="form-input" type="password" id="auth-password" placeholder="••••••••" required autocomplete="current-password" minlength="6">
              <span class="form-error hidden" id="password-error"></span>
            </div>

            <button type="submit" class="btn btn-primary btn-lg" id="auth-submit" style="width: 100%; margin-top: var(--space-4);">
              Sign in
            </button>
          </form>

          <div style="text-align: center; margin-top: var(--space-5);">
            <button class="btn btn-ghost btn-sm" id="auth-toggle" type="button">
              Create account
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // --- Event Listeners ---
  let isSignUp = false;
  const form = document.getElementById('auth-form');
  const toggleBtn = document.getElementById('auth-toggle');
  const submitBtn = document.getElementById('auth-submit');
  const nameGroup = document.getElementById('name-group');
  const passwordInput = document.getElementById('auth-password');

  toggleBtn.addEventListener('click', () => {
    isSignUp = !isSignUp;
    nameGroup.classList.toggle('hidden', !isSignUp);
    submitBtn.textContent = isSignUp ? 'Create account' : 'Sign in';
    toggleBtn.textContent = isSignUp ? 'Already have an account? Sign in' : 'Create account';
    passwordInput.autocomplete = isSignUp ? 'new-password' : 'current-password';
    clearErrors();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value.trim();

    // Validation
    if (!email) {
      showFieldError('email', 'Email is required');
      return;
    }
    if (!password || password.length < 6) {
      showFieldError('password', 'Password must be at least 6 characters');
      return;
    }
    if (isSignUp && !name) {
      showFieldError('name', 'Display name is required');
      return;
    }

    // Disable button and show spinner
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>';

    try {
      if (isSignUp) {
        await handleCreateAccount(email, password, name);
      } else {
        await handleSignIn(email, password);
      }
    } catch (error) {
      handleAuthError(error);
      // Shake the card
      const card = document.getElementById('auth-card');
      card.classList.add('animate-shake');
      setTimeout(() => card.classList.remove('animate-shake'), 500);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isSignUp ? 'Create account' : 'Sign in';
    }
  });
}

/**
 * Handle sign in
 */
async function handleSignIn(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
  showToast('Welcome back!', 'success');
}

/**
 * Handle account creation
 */
async function handleCreateAccount(email, password, displayName) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  
  // Set display name
  await updateProfile(credential.user, { displayName });
  
  // Create user document
  await setDocument('users', credential.user.uid, {
    displayName,
    email,
    seasonPoints: 0,
    lastEventScore: 0,
    wins: 0
  });

  showToast('Account created! Welcome to F1 Predict.', 'success');
}

/**
 * Handle sign out
 */
async function handleSignOut() {
  try {
    await firebaseSignOut(auth);
    showToast('Signed out', 'info');
  } catch (error) {
    console.error('[Auth] Sign out error:', error);
    showToast('Failed to sign out', 'error');
  }
}

/**
 * Handle Firebase auth errors with user-friendly messages
 */
function handleAuthError(error) {
  const code = error.code;
  
  const messages = {
    'auth/invalid-email': { field: 'email', message: 'Invalid email address' },
    'auth/user-disabled': { field: 'email', message: 'This account has been disabled' },
    'auth/user-not-found': { field: 'email', message: 'No account found with this email' },
    'auth/wrong-password': { field: 'password', message: 'Incorrect password' },
    'auth/invalid-credential': { field: 'password', message: 'Invalid email or password' },
    'auth/email-already-in-use': { field: 'email', message: 'This email is already registered' },
    'auth/weak-password': { field: 'password', message: 'Password is too weak — use 6+ characters' },
    'auth/too-many-requests': { field: 'email', message: 'Too many attempts. Try again later.' },
    'auth/network-request-failed': { field: 'email', message: 'Network error. Check your connection.' },
  };

  const mapped = messages[code] || { field: 'email', message: 'Something went wrong. Try again.' };
  showFieldError(mapped.field, mapped.message);
}

/**
 * Show error message under a form field
 */
function showFieldError(field, message) {
  const errorEl = document.getElementById(`${field}-error`);
  const inputEl = document.getElementById(`auth-${field}`);
  if (errorEl) {
    errorEl.textContent = `⚠ ${message}`;
    errorEl.classList.remove('hidden');
  }
  if (inputEl) {
    inputEl.classList.add('error');
  }
}

/**
 * Clear all field errors
 */
function clearErrors() {
  const errors = document.querySelectorAll('.form-error');
  const inputs = document.querySelectorAll('.form-input');
  errors.forEach(el => {
    el.classList.add('hidden');
    el.textContent = '';
  });
  inputs.forEach(el => el.classList.remove('error'));
}

/**
 * Get current user
 * @returns {Object|null}
 */
function getCurrentUser() {
  return auth.currentUser;
}

// --- Exports ---
export {
  initAuth,
  renderAuthScreen,
  getCurrentUser,
  handleSignOut
};
