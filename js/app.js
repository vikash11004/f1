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
registerPage('results', async (raceId, session) => {
  if (raceId && session) {
    renderResults(raceId, session);
  } else {
    try {
      const { getAllDocuments } = await import('./firebase.js');
      const [races, allResults] = await Promise.all([
        getAllDocuments('races'),
        getAllDocuments('results')
      ]);
      races.sort((a, b) => a.round - b.round);

      let targetRace = null;
      let targetSession = session || 'race';

      // Find most recent race with confirmed results
      for (let i = races.length - 1; i >= 0; i--) {
        const r = races[i];
        const res = (allResults || []).find(resDoc => resDoc.raceId === r.id && resDoc.calculatedAt);
        if (res) {
          targetRace = r;
          targetSession = res.session || 'race';
          break;
        }
      }

      if (!targetRace) {
        const completed = races.filter(r => r.status === 'completed');
        targetRace = completed[completed.length - 1] || races.find(r => r.status === 'active') || races[0];
      }

      if (targetRace) {
        renderResults(targetRace.id, targetSession);
      }
    } catch (e) {
      console.warn('[App] Could not resolve default race for results:', e);
    }
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
