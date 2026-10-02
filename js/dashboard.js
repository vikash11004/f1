import { escapeHTML, icon, pageHeading } from './design.js';
// ============================================
// F1 PREDICTION LEAGUE — DASHBOARD
// Info cards · Countdown · CTA
// ============================================

import {
  auth,
  isAdmin,
  queryCollection,
  getAllDocuments,
  getDocument,
  updateDocument
} from './firebase.js';
import { SESSION_KEYS } from './seed.js';
import { createTelemetrySVG, renderEmptyStateSVG } from './drivers.js';
import {
  navigateTo,
  showSkeleton,
  cardSkeletonHTML,
  getCountdown,
  pad,
  formatRound,
  showModal,
  showToast
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
    ${pageHeading('THE PADDOCK / OVERVIEW', 'Every point starts here.', 'Your race weekend. Your predictions. Your shot at the top.', '<span class="season-label"><span class="status-dot"></span> 2026 SEASON</span>')}
    <div class="dashboard-grid" id="dashboard-grid">
      ${cardSkeletonHTML(4)}
    </div>
    <div id="dashboard-cta" class="dashboard-cta"></div>
    <div id="season-overview"></div>
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

    // Auto-resolve any active/locked races whose sessions are all completed or voided
    for (const r of races) {
      if (r.status === 'active' || r.status === 'locked') {
        const allSessions = SESSION_KEYS[r.weekendType] || SESSION_KEYS.standard;
        const cancelled = r.cancelledSessions || {};
        const nonVoided = allSessions.filter(s => cancelled[s] !== true);

        let allDone = true;
        for (const s of nonVoided) {
          try {
            const res = await getDocument('results', `${r.id}_${s}`);
            if (!res?.calculatedAt) { allDone = false; break; }
          } catch { allDone = false; break; }
        }

        if (allDone) {
          r.status = 'completed';
          updateDocument('races', r.id, { status: 'completed' }).catch(err =>
            console.error('[Dashboard] Failed to auto-complete race:', err)
          );
        }
      }
    }

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

    // Sort users by season points for ranking (excluding admin accounts)
    const rankedUsers = [...users]
      .filter(u => u.seasonPoints !== undefined && u.email !== 'vikashthyadi@gmail.com' && u.email !== 'vikash11004@gmail.com')
      .sort((a, b) => b.seasonPoints - a.seasonPoints);

    const leader = rankedUsers[0];
    const userRank = rankedUsers.findIndex(user => user.id === currentUser?.uid) + 1;
    document.getElementById('season-overview').innerHTML = `
      <div class="section-label"><span>YOUR SEASON AT A GLANCE</span><a href="#leaderboard">Full standings ${icon('arrow')}</a></div>
      <div class="season-strip">
        <div class="season-stat"><strong>${userRank ? String(userRank).padStart(2, '0') : '—'}</strong><span>Championship position</span></div>
        <div class="season-stat"><strong>${currentUserDoc?.seasonPoints || 0}</strong><span>Season points</span></div>
        <div class="season-stat"><strong>${currentUserDoc?.lastEventScore || 0}</strong><span>Last event points</span></div>
        <div class="season-stat"><strong>${currentUserDoc?.wins || 0}</strong><span>Race wins</span></div>
      </div>`;


    // Render cards
    const grid = document.getElementById('dashboard-grid');
    grid.innerHTML = '';

    // --- Card 1: Next Race ---
    grid.innerHTML += renderNextRaceCard(displayRace);

    // --- Card 2: Leaderboard (Replaces Your Standing) ---
    grid.innerHTML += renderLeaderboardCard(rankedUsers, currentUser);

    // --- Card 3: Championship Leader ---
    grid.innerHTML += renderLeaderCard(leader, rankedUsers);

    // --- Card 4: Recent Result ---
    grid.innerHTML += renderRecentResultCard(lastCompleted);

    // Add Click & Keyboard Listeners for interactive card widgets
    const admin = isAdmin();

    // 1. Next Race Card
    const nextRaceCard = document.getElementById('card-next-race');
    if (nextRaceCard) {
      const handleNextRaceClick = () => {
        if (admin) {
          navigateTo('races');
        } else if (displayRace) {
          const sessions = SESSION_KEYS[displayRace.weekendType];
          if (sessions && sessions.length > 0) {
            navigateTo('predict', displayRace.id, sessions[0]);
          } else {
            navigateTo('predict', displayRace.id);
          }
        } else {
          navigateTo('races');
        }
      };
      nextRaceCard.addEventListener('click', handleNextRaceClick);
      nextRaceCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleNextRaceClick();
        }
      });
    }

    // 2. Leaderboard Card
    const leaderboardCard = document.getElementById('card-leaderboard');
    if (leaderboardCard) {
      const handleLeaderboardClick = () => navigateTo('leaderboard');
      leaderboardCard.addEventListener('click', handleLeaderboardClick);
      leaderboardCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleLeaderboardClick();
        }
      });
    }

    // 3. Championship Leader Card
    const leaderCard = document.getElementById('card-leader');
    if (leaderCard) {
      const handleLeaderClick = () => navigateTo('leaderboard');
      leaderCard.addEventListener('click', handleLeaderClick);
      leaderCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleLeaderClick();
        }
      });
    }

    // 4. Recent Result Card
    const recentResultCard = document.getElementById('card-recent-result');
    if (recentResultCard) {
      const handleRecentResultClick = () => {
        if (lastCompleted) {
          if (admin) {
            navigateTo('results');
          } else {
            const sessions = SESSION_KEYS[lastCompleted.weekendType];
            navigateTo('predict', lastCompleted.id, sessions ? sessions[0] : '');
          }
        } else {
          navigateTo('races');
        }
      };
      recentResultCard.addEventListener('click', handleRecentResultClick);
      recentResultCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleRecentResultClick();
        }
      });
    }

    // Start countdown if there's a race with date
    if (displayRace?.raceDate) {
      startCountdown(displayRace.raceDate);
    }

    // --- CTA ---
    const ctaContainer = document.getElementById('dashboard-cta');
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
    } else if (!activeRace && nextUpcoming && admin) {
      ctaContainer.innerHTML = `
        <div class="card card-cta animate-card-enter" id="cta-activate-next" style="margin-top: var(--space-4);">
          <div class="card-body" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3);">
            <div>
              <h3 class="text-display-sm" style="margin-bottom: var(--space-1);">Activate Next Race</h3>
              <p class="text-body-sm text-muted">${nextUpcoming.name} (${nextUpcoming.circuit}) is ready for predictions.</p>
            </div>
            <button class="btn btn-primary" id="btn-dashboard-activate">Activate Predictions →</button>
          </div>
        </div>
      `;
      document.getElementById('btn-dashboard-activate')?.addEventListener('click', (e) => {
        e.stopPropagation();
        showModal({
          title: 'Activate Predictions?',
          message: `This will open predictions for ${nextUpcoming.name} for all players. Continue?`,
          confirmText: 'Activate Predictions',
          onConfirm: async () => {
            try {
              await updateDocument('races', nextUpcoming.id, { status: 'active' });
              showToast('Predictions activated!', 'success');
              renderDashboard();
            } catch (err) {
              showToast('Failed to activate predictions', 'error');
            }
          }
        });
      });
      document.getElementById('cta-activate-next')?.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
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
 * Render Next Race card (Button / Widget)
 */
function renderNextRaceCard(race) {
  if (!race) {
    return `<div class="card race-hero card-interactive" id="card-next-race" role="button" tabindex="0">
      <div class="race-hero-copy"><p class="eyebrow">THE NEXT CHAPTER</p><h2>The grid is<br>getting ready.</h2><p class="race-hero-location">The next Grand Prix will appear here once it is scheduled.</p><div class="race-hero-footer"><span class="race-hero-link">Explore the calendar ${icon('arrow')}</span></div></div>
      <div class="race-hero-art"><img src="assets/race-car.svg" alt="" width="1000" height="760"><span class="race-hero-art-label">EVERY POSITION MATTERS.</span></div></div>`;
  }
  const open = race.status === 'active';
  const label = open ? 'PREDICTIONS OPEN' : race.status === 'locked' ? 'PREDICTIONS LOCKED' : 'COMING UP NEXT';
  return `<div class="card race-hero card-interactive animate-card-enter" id="card-next-race" role="button" tabindex="0" aria-label="${escapeHTML(race.name)} — view race">
    <div class="race-hero-copy">
      <p class="eyebrow"><span class="status-dot" style="background: ${open ? '#617b43' : '#7b816e'}"></span> ${label} <span> / </span> ${race.weekendType === 'sprint' ? 'SPRINT WEEKEND' : 'GRAND PRIX WEEKEND'}</p>
      <h2>${escapeHTML(race.name)}</h2><p class="race-hero-location">${escapeHTML(race.circuit)} · ${escapeHTML(race.country)}</p>
      <div class="countdown" id="countdown-display" aria-label="Time until the race">
        <div class="countdown-unit"><span class="countdown-value" id="cd-days">--</span><span class="countdown-label">DAYS</span></div>
        <div class="countdown-unit"><span class="countdown-value" id="cd-hours">--</span><span class="countdown-label">HOURS</span></div>
        <div class="countdown-unit"><span class="countdown-value" id="cd-mins">--</span><span class="countdown-label">MINS</span></div>
        <div class="countdown-unit"><span class="countdown-value" id="cd-secs">--</span><span class="countdown-label">SECS</span></div>
      </div>
      <div class="race-hero-footer"><span class="race-hero-link">${open ? 'Make your prediction' : 'Explore the race'} ${icon('arrow')}</span><span class="eyebrow">${escapeHTML(race.countryFlag)} ${formatRound(race.round)}</span></div>
    </div>
    <div class="race-hero-art"><img src="assets/race-car.svg" alt="" width="1000" height="760"><span class="race-hero-round">ROUND ${String(race.round).padStart(2, '0')} / 2026</span><span class="race-hero-art-label">TRUST YOUR RACING INSTINCT.</span></div>
  </div>`;
}

function overviewCard(id, label, body, order) {
  return `<div class="card overview-card card-interactive animate-card-enter stagger-${order}" id="${id}" role="button" tabindex="0"><div class="card-header"><span class="text-label">${label}</span>${icon('arrow')}</div><div class="card-body">${body}</div></div>`;
}

function renderLeaderboardCard(rankedUsers, currentUser) {
  const rows = rankedUsers.slice(0, 3).map((user, index) => `<div class="mini-standing"><span class="mini-rank">0${index + 1}</span><span class="mini-name ${user.id === currentUser?.uid ? 'text-accent' : ''}">${escapeHTML(user.displayName || 'Driver')}${user.id === currentUser?.uid ? ' · You' : ''}</span><span class="mini-points">${user.seasonPoints || 0} <small>PTS</small></span></div>`).join('');
  return overviewCard('card-leaderboard', 'The front runners', rows || '<h3 class="leader-name">A clean slate.</h3><p class="card-detail">The championship starts with the first points.</p>', 2);
}

function renderLeaderCard(leader, rankedUsers) {
  const margin = rankedUsers.length > 1 ? leader.seasonPoints - rankedUsers[1].seasonPoints : 0;
  const body = leader && leader.seasonPoints > 0
    ? `<h3 class="leader-name">${escapeHTML(leader.displayName || 'Driver')}</h3><p class="leader-points">${leader.seasonPoints} <small>PTS</small></p><p class="card-detail">${margin > 0 ? `+${margin} points clear of second place` : 'Setting the pace this season'}</p>`
    : '<h3 class="leader-name">The top spot awaits.</h3><p class="card-detail">Could this be your championship?</p>';
  return overviewCard('card-leader', 'Championship leader', body, 3);
}

function renderRecentResultCard(race) {
  const body = race ? `<h3 class="result-title">${escapeHTML(race.name)}</h3><p class="card-detail">${formatRound(race.round)} · ${escapeHTML(race.circuit)}</p><p class="result-link">View the race recap ${icon('arrow', 'diagonal-arrow')}</p>` : '<h3 class="result-title">The story is<br>still unwritten.</h3><p class="card-detail">Your latest race recap will land here.</p>';
  return overviewCard('card-recent-result', 'Last time out', body, 4);
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

    if (days) days.textContent = cd.valid === false ? '--' : pad(cd.days);
    if (hours) hours.textContent = cd.valid === false ? '--' : pad(cd.hours);
    if (mins) mins.textContent = cd.valid === false ? '--' : pad(cd.minutes);
    if (secs) secs.textContent = cd.valid === false ? '--' : pad(cd.seconds);

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
