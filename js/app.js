// --- Import all modules ---
import { initAuth, renderAuthScreen } from './auth.js';
import { renderDashboard, cleanupDashboard } from './dashboard.js';
import { renderRaces } from './races.js';
import { renderPredictionBuilder, cleanupPredictions } from './predictions.js';
import { renderResults } from './results.js';
import { renderLeaderboard, cleanupLeaderboard } from './leaderboard.js';
import { registerPage, initRouter, initNav } from './ui.js';

// --- Register page renderers ---
registerPage('auth', renderAuthScreen);
registerPage('dashboard', renderDashboard);
registerPage('races', renderRaces);
registerPage('predict', (raceId, session) => {
  if (raceId && session) {
    renderPredictionBuilder(raceId, session, false);
  } else if (raceId) {
    renderPredictionBuilder(raceId, 'quali', false);
  }
});
registerPage('results', (raceId, session) => {
  if (raceId && session) {
    renderResults(raceId, session);
  }
});
registerPage('leaderboard', renderLeaderboard);

// --- Initialize navigation ---
initNav();

// --- Mobile menu toggle ---
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const headerNav = document.getElementById('header-nav');

if (mobileMenuBtn && headerNav) {
  // Show button on mobile
  const updateMobileBtn = () => {
    if (window.innerWidth <= 900) {
      mobileMenuBtn.style.display = 'flex';
    } else {
      mobileMenuBtn.style.display = 'none';
      headerNav.classList.remove('mobile-open');
      mobileMenuBtn.setAttribute('aria-expanded', 'false');
    }
  };
  updateMobileBtn();
  window.addEventListener('resize', updateMobileBtn);
}

// --- Initialize auth (starts the app) ---
// Auth state change will trigger router and page rendering
initAuth(() => {
  // --- Initialize router after auth state is confirmed ---
  initRouter();
});

console.log(
  '%c🏎️ F1 PREDICT — v1.0',
  'color: #E8002D; font-size: 16px; font-weight: bold;',
);
console.log('%cFormula 1 Prediction League', 'color: #888; font-size: 12px;');
