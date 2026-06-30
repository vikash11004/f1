// ============================================
// F1 PREDICTION LEAGUE — DASHBOARD
// Info cards · Countdown · CTA
// ============================================

import {
  auth,
  isAdmin,
  queryCollection,
  getAllDocuments,
  getDocument
} from './firebase.js';
import { SESSION_KEYS } from './seed.js';
import { createTelemetrySVG, renderEmptyStateSVG } from './drivers.js';
import {
  navigateTo,
  showSkeleton,
  cardSkeletonHTML,
  getCountdown,
  pad,
  formatRound
} from './ui.js';

// --- State ---
let countdownInterval = null;

/**
 * Render the dashboard page
 */
async function renderDashboard() {
  const page = document.getElementById('dashboard-page');
  if (!page) return;

  // Clear previous countdown
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  // Show skeleton
  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title text-display">Dashboard</h1>
      <p class="page-subtitle">Your F1 Prediction League headquarters</p>
    </div>
    <div class="dashboard-grid" id="dashboard-grid">
      ${cardSkeletonHTML(4)}
    </div>
    <div id="dashboard-cta"></div>
  `;

  try {
    // Fetch data in parallel
    const [races, users] = await Promise.all([
      getAllDocuments('races'),
      getAllDocuments('users')
    ]);

    const currentUser = auth.currentUser;
    const currentUserDoc = users.find(u => u.id === currentUser?.uid);

    // Sort races by round
    races.sort((a, b) => a.round - b.round);

    // Find active race (could be active or locked)
    const activeRace = races.find(r => r.status === 'active' || r.status === 'locked');
    
    // Find last completed race
    const completedRaces = races.filter(r => r.status === 'completed');
    const lastCompleted = completedRaces.length > 0 
      ? completedRaces[completedRaces.length - 1] 
      : null;

    // Find next upcoming if no active
    const nextUpcoming = !activeRace 
      ? races.find(r => r.status === 'upcoming') 
      : null;

    const displayRace = activeRace || nextUpcoming;

    // Sort users by season points for ranking
    const rankedUsers = [...users]
      .filter(u => u.seasonPoints !== undefined)
      .sort((a, b) => b.seasonPoints - a.seasonPoints);

    const userRank = rankedUsers.findIndex(u => u.id === currentUser?.uid) + 1;
    const leader = rankedUsers[0];

    // Render cards
    const grid = document.getElementById('dashboard-grid');
    grid.innerHTML = '';

    // --- Card 1: Next Race ---
    grid.innerHTML += renderNextRaceCard(displayRace);

    // --- Card 2: Your Standing ---
    grid.innerHTML += renderStandingCard(currentUserDoc, userRank, rankedUsers.length);

    // --- Card 3: Championship Leader ---
    grid.innerHTML += renderLeaderCard(leader, rankedUsers);

    // --- Card 4: Recent Result ---
    grid.innerHTML += renderRecentResultCard(lastCompleted, currentUser?.uid);

    // Start countdown if there's a race with date
    if (displayRace?.raceDate) {
      startCountdown(displayRace.raceDate);
    }

    // --- CTA ---
    const ctaContainer = document.getElementById('dashboard-cta');
    const admin = isAdmin();
    if (activeRace && !admin) {
      const isLocked = activeRace.status === 'locked';
      ctaContainer.innerHTML = `
        <div class="card card-cta animate-card-enter" id="cta-predict" style="margin-top: var(--space-4);">
          <div class="card-body" style="display: flex; align-items: center; justify-content: space-between;">
            <div>
              <h3 class="text-display-sm" style="margin-bottom: var(--space-1);">${isLocked ? 'View Predictions' : 'Make Predictions'}</h3>
              <p class="text-body-sm text-muted">${activeRace.name} — ${isLocked ? 'Session is underway' : (activeRace.weekendType === 'sprint' ? '4 sessions' : '2 sessions') + ' to predict'}</p>
            </div>
            <span style="font-size: var(--text-2xl); color: var(--accent);">→</span>
          </div>
        </div>
      `;
      document.getElementById('cta-predict')?.addEventListener('click', () => {
        const sessions = SESSION_KEYS[activeRace.weekendType];
        navigateTo('predict', activeRace.id, sessions[0]);
      });
    } else if (activeRace && admin) {
      const isLocked = activeRace.status === 'locked';
      ctaContainer.innerHTML = `
        <div class="card card-cta animate-card-enter" id="cta-manage" style="margin-top: var(--space-4);">
          <div class="card-body" style="display: flex; align-items: center; justify-content: space-between;">
            <div>
              <h3 class="text-display-sm" style="margin-bottom: var(--space-1);">Manage Race</h3>
              <p class="text-body-sm text-muted">${activeRace.name} — ${isLocked ? 'Enter results' : 'Predictions open'}</p>
            </div>
            <span style="font-size: var(--text-2xl); color: var(--accent);">→</span>
          </div>
        </div>
      `;
      document.getElementById('cta-manage')?.addEventListener('click', () => {
        window.location.hash = '#races';
      });
    } else {
      ctaContainer.innerHTML = `
        <div class="empty-state" style="padding: var(--space-8);">
          ${renderEmptyStateSVG()}
          <h3 class="empty-state-title">No active race</h3>
          <p class="empty-state-text">Waiting for the next Grand Prix weekend to be activated.</p>
          ${admin ? `<button class="btn btn-ghost" onclick="window.location.hash='#races'">+ New Race</button>` : ''}
        </div>
      `;
    }

  } catch (error) {
    console.error('[Dashboard] Error:', error);
    page.innerHTML = `
      <div class="empty-state">
        ${renderEmptyStateSVG()}
        <h3 class="empty-state-title">Failed to load dashboard</h3>
        <p class="empty-state-text">${error.message}</p>
        <button class="btn btn-secondary" onclick="window.location.reload()">Retry</button>
      </div>
    `;
  }
}

/**
 * Render Next Race card
 */
function renderNextRaceCard(race, isActive) {
  if (!race) {
    return `
      <div class="card animate-card-enter stagger-1">
        <div class="card-header">
          <span class="text-label">Next Race</span>
          ${createTelemetrySVG()}
        </div>
        <div class="card-body">
          <p class="text-muted">No upcoming races scheduled</p>
        </div>
      </div>
    `;
  }

  const sprintBadge = race.weekendType === 'sprint'
    ? `<span class="badge badge-sprint">SPRINT WEEKEND</span>`
    : `<span class="badge badge-standard">STANDARD</span>`;

  let statusLabel = '';
  if (race.status === 'active') {
    statusLabel = `<span class="text-body-sm" style="color: var(--status-active);">Predictions open!</span>`;
  } else if (race.status === 'locked') {
    statusLabel = `<span class="text-body-sm" style="color: var(--warning);">Predictions locked</span>`;
  } else {
    statusLabel = `<span class="text-body-sm text-muted">Upcoming</span>`;
  }

  return `
    <div class="card animate-card-enter stagger-1">
      <div class="card-header">
        <span class="text-label">Next Race</span>
        ${createTelemetrySVG()}
      </div>
      <div class="card-body">
        <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3);">
          <span class="badge-round text-display">${formatRound(race.round)}</span>
          <span style="font-size: var(--text-xl);">${race.countryFlag}</span>
          ${sprintBadge}
        </div>
        <h3 class="text-display-sm" style="margin-bottom: var(--space-1);">${race.name}</h3>
        <p class="text-body-sm text-muted" style="margin-bottom: var(--space-3);">${race.circuit} · ${race.country}</p>
        <div class="countdown" id="countdown-display">
          <div class="countdown-unit"><span class="countdown-value" id="cd-days">--</span><span class="countdown-label">Days</span></div>
          <div class="countdown-unit"><span class="countdown-value" id="cd-hours">--</span><span class="countdown-label">Hrs</span></div>
          <div class="countdown-unit"><span class="countdown-value" id="cd-mins">--</span><span class="countdown-label">Min</span></div>
          <div class="countdown-unit"><span class="countdown-value" id="cd-secs">--</span><span class="countdown-label">Sec</span></div>
        </div>
        ${statusLabel}
      </div>
    </div>
  `;
}

/**
 * Render Your Standing card
 */
function renderStandingCard(userDoc, rank, totalPlayers) {
  const points = userDoc?.seasonPoints || 0;
  const lastEvent = userDoc?.lastEventScore || 0;
  const deltaClass = lastEvent > 0 ? 'positive' : lastEvent < 0 ? 'negative' : '';
  const deltaSign = lastEvent > 0 ? '+' : '';

  return `
    <div class="card animate-card-enter stagger-2">
      <div class="card-header">
        <span class="text-label">Your Standing</span>
        ${createTelemetrySVG()}
      </div>
      <div class="card-body">
        <div style="display: flex; align-items: baseline; gap: var(--space-3); margin-bottom: var(--space-3);">
          <span class="stat-value">#${rank || '-'}</span>
          <span class="text-muted text-body-sm">of ${totalPlayers}</span>
        </div>
        <div style="display: flex; align-items: baseline; gap: var(--space-3);">
          <span class="text-data-lg">${points}</span>
          <span class="text-body-sm text-muted">pts</span>
          ${lastEvent !== 0 ? `<span class="stat-delta ${deltaClass}">${deltaSign}${lastEvent} pts</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Championship Leader card
 */
function renderLeaderCard(leader, rankedUsers) {
  if (!leader || leader.seasonPoints === 0) {
    return `
      <div class="card animate-card-enter stagger-3">
        <div class="card-header">
          <span class="text-label">Championship Leader</span>
          ${createTelemetrySVG()}
        </div>
        <div class="card-body">
          <p class="text-muted">No points scored yet</p>
        </div>
      </div>
    `;
  }

  const margin = rankedUsers.length > 1 
    ? leader.seasonPoints - rankedUsers[1].seasonPoints 
    : 0;

  return `
    <div class="card animate-card-enter stagger-3">
      <div class="card-header">
        <span class="text-label">Championship Leader</span>
        ${createTelemetrySVG()}
      </div>
      <div class="card-body">
        <h3 class="text-display-sm" style="margin-bottom: var(--space-2); color: var(--gold);">${leader.displayName}</h3>
        <div style="display: flex; align-items: baseline; gap: var(--space-3);">
          <span class="text-data-lg">${leader.seasonPoints}</span>
          <span class="text-body-sm text-muted">pts</span>
          ${margin > 0 ? `<span class="text-body-sm text-muted">+${margin} lead</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Recent Result card
 */
function renderRecentResultCard(lastRace, userId) {
  if (!lastRace) {
    return `
      <div class="card animate-card-enter stagger-4">
        <div class="card-header">
          <span class="text-label">Recent Result</span>
          ${createTelemetrySVG()}
        </div>
        <div class="card-body">
          <p class="text-muted">No completed races yet</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="card animate-card-enter stagger-4">
      <div class="card-header">
        <span class="text-label">Recent Result</span>
        ${createTelemetrySVG()}
      </div>
      <div class="card-body">
        <h3 class="text-display-sm" style="margin-bottom: var(--space-1);">${lastRace.name}</h3>
        <p class="text-body-sm text-muted">${formatRound(lastRace.round)} · ${lastRace.circuit}</p>
      </div>
    </div>
  `;
}

/**
 * Start countdown timer
 * @param {string} dateStr - ISO date string
 */
function startCountdown(dateStr) {
  function update() {
    const cd = getCountdown(dateStr);
    const days = document.getElementById('cd-days');
    const hours = document.getElementById('cd-hours');
    const mins = document.getElementById('cd-mins');
    const secs = document.getElementById('cd-secs');

    if (days) days.textContent = pad(cd.days);
    if (hours) hours.textContent = pad(cd.hours);
    if (mins) mins.textContent = pad(cd.minutes);
    if (secs) secs.textContent = pad(cd.seconds);

    if (cd.passed) {
      clearInterval(countdownInterval);
    }
  }

  update();
  countdownInterval = setInterval(update, 1000);
}

/**
 * Cleanup dashboard (called when navigating away)
 */
function cleanupDashboard() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

// --- Exports ---
export {
  renderDashboard,
  cleanupDashboard
};
