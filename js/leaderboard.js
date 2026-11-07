import { escapeHTML, pageHeading } from './design.js';
// ============================================
// F1 PREDICTION LEAGUE — LEADERBOARD
// Table · Rank animation · Real-time updates
// ============================================

import {
  listenToCollection,
  getAllDocuments,
  ADMIN_UID
} from './firebase.js';
import { createTelemetrySVG, renderEmptyStateSVG } from './drivers.js';
import { calculateSessionWins, calculateCumulativePoints } from './scoring.js';

// --- State ---
let unsubscribeUsers = null;
let unsubscribeScores = null;
let currentUsers = [];
let sessionWinsMap = {};
let cumulativePointsMap = {};
let previousRanks = {}; // userId -> previous rank for animation

// In-memory cache for instant subsequent tab switches (stale-while-revalidate)
let _cachedUsers = null;
let _cachedWinsMap = null;
let _cachedCumulativeMap = null;
let _hasLoadedOnce = false;
let isInitialLoading = true;

/**
 * Cache standings in sessionStorage to prevent any flash on reload
 */
function saveLeaderboardCache(users, winsMap, cumulativePoints) {
  try {
    sessionStorage.setItem('f1_standings_cache', JSON.stringify({
      users,
      winsMap,
      cumulativePoints,
      timestamp: Date.now()
    }));
  } catch (e) {
    // Ignore storage quota or access issues safely
  }
}

function loadLeaderboardCache() {
  try {
    const raw = sessionStorage.getItem('f1_standings_cache');
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Valid for 30 minutes
    if (Date.now() - (data.timestamp || 0) < 30 * 60 * 1000) {
      return data;
    }
  } catch (e) {
    return null;
  }
  return null;
}

/**
 * Render dedicated skeleton loader for leaderboard while initial data is fetching
 */
function renderLeaderboardSkeleton() {
  const podium = document.getElementById('leaderboard-podium');
  const container = document.getElementById('leaderboard-content');

  if (podium) {
    podium.innerHTML = `
      <div class="podium">
        <div class="podium-card skeleton" style="min-height: 140px; opacity: 0.85;"></div>
        <div class="podium-card skeleton" style="min-height: 160px;"></div>
        <div class="podium-card skeleton" style="min-height: 130px; opacity: 0.7;"></div>
      </div>
    `;
  }

  if (container) {
    container.innerHTML = `
      <div class="table-responsive">
        <table class="leaderboard-table" role="table" aria-label="Loading championship standings">
          <thead>
            <tr>
              <th style="width: 60px; padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em;">#</th>
              <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap;">Player</th>
              <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right; white-space: nowrap;">Season Pts</th>
              <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right; white-space: nowrap;">Last Event</th>
              <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right; white-space: nowrap;">Session Wins</th>
              <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right; white-space: nowrap;">Cumulative Accuracy Pts</th>
              <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right; white-space: nowrap;">Cumulative Bonus Pts</th>
            </tr>
          </thead>
          <tbody>
            ${Array.from({ length: 6 }, (_, i) => `
              <tr class="skeleton-table-row" style="opacity: ${Math.max(0.35, 1 - i * 0.12)};">
                <td style="padding: var(--space-3) var(--space-5);"><div class="skeleton" style="width: 24px; height: 18px; border-radius: 4px;"></div></td>
                <td style="padding: var(--space-3) var(--space-5);">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <div class="skeleton" style="width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;"></div>
                    <div class="skeleton" style="width: ${110 + (i % 4) * 25}px; height: 16px; border-radius: 4px;"></div>
                  </div>
                </td>
                <td style="padding: var(--space-3) var(--space-5); text-align: right;"><div class="skeleton" style="width: 36px; height: 20px; margin-left: auto; border-radius: 4px;"></div></td>
                <td style="padding: var(--space-3) var(--space-5); text-align: right;"><div class="skeleton" style="width: 28px; height: 18px; margin-left: auto; border-radius: 4px;"></div></td>
                <td style="padding: var(--space-3) var(--space-5); text-align: right;"><div class="skeleton" style="width: 22px; height: 18px; margin-left: auto; border-radius: 4px;"></div></td>
                <td style="padding: var(--space-3) var(--space-5); text-align: right;"><div class="skeleton" style="width: 32px; height: 18px; margin-left: auto; border-radius: 4px;"></div></td>
                <td style="padding: var(--space-3) var(--space-5); text-align: right;"><div class="skeleton" style="width: 32px; height: 18px; margin-left: auto; border-radius: 4px;"></div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}

/**
 * Render the leaderboard page
 */
async function renderLeaderboard() {
  const page = document.getElementById('leaderboard-page');
  if (!page) return;

  // Cleanup previous listeners
  cleanupLeaderboard();

  page.innerHTML = `
    ${pageHeading('THE CHAMPIONSHIP / STANDINGS', 'Chasing the top step.', 'Every prediction counts. This is where the season takes shape.', '<span class="season-label"><span class="status-dot"></span> LIVE STANDINGS</span>')}
    <div id="leaderboard-podium"></div>
    <div class="standings-live"><span>THE CLASSIFICATION</span><span>2026 SEASON POINTS</span></div>
    <div id="leaderboard-content"></div>
  `;

  // 1. Try restoring from memory cache or session cache first for instant render (zero flash)
  let cached = null;
  if (_cachedUsers && _cachedUsers.length > 0) {
    cached = {
      users: _cachedUsers,
      winsMap: _cachedWinsMap || {},
      cumulativePoints: _cachedCumulativeMap || {}
    };
  } else {
    cached = loadLeaderboardCache();
    if (cached && cached.users && cached.users.length > 0) {
      _cachedUsers = cached.users;
      _cachedWinsMap = cached.winsMap || {};
      _cachedCumulativeMap = cached.cumulativePoints || {};
    }
  }

  if (cached && cached.users && cached.users.length > 0) {
    currentUsers = cached.users;
    sessionWinsMap = cached.winsMap || {};
    cumulativePointsMap = cached.cumulativePoints || {};
    isInitialLoading = false;
    _hasLoadedOnce = true;
    renderLeaderboardTable(currentUsers, sessionWinsMap, cumulativePointsMap);
  } else {
    // Show dedicated skeleton while initial loading
    isInitialLoading = true;
    renderLeaderboardSkeleton();
  }

  // 2. Fetch fresh users and scores concurrently
  const fetchPromise = Promise.all([
    getAllDocuments('users'),
    getAllDocuments('scores')
  ]).then(([freshUsers, freshScores]) => {
    isInitialLoading = false;
    _hasLoadedOnce = true;
    if (freshUsers) {
      _cachedUsers = freshUsers;
      currentUsers = freshUsers;
    }
    _cachedWinsMap = calculateSessionWins(freshScores || []);
    _cachedCumulativeMap = calculateCumulativePoints(freshScores || []);
    sessionWinsMap = _cachedWinsMap;
    cumulativePointsMap = _cachedCumulativeMap;

    saveLeaderboardCache(currentUsers, sessionWinsMap, cumulativePointsMap);
    renderLeaderboardTable(currentUsers, sessionWinsMap, cumulativePointsMap);
  }).catch((err) => {
    console.warn('[Leaderboard] Initial fetch fallback:', err);
    isInitialLoading = false;
    _hasLoadedOnce = true;
    if (currentUsers.length > 0) {
      renderLeaderboardTable(currentUsers, sessionWinsMap, cumulativePointsMap);
    }
  });

  // 3. Set up real-time listener for users
  // Query all users without orderBy constraints so unindexed users or fresh signups are never omitted
  unsubscribeUsers = listenToCollection('users', (users) => {
    if (!users || users.length === 0) {
      if (isInitialLoading) return;
    }
    currentUsers = users || [];
    _cachedUsers = currentUsers;
    saveLeaderboardCache(currentUsers, sessionWinsMap, cumulativePointsMap);
    renderLeaderboardTable(currentUsers, sessionWinsMap, cumulativePointsMap);
  });

  // 4. Set up real-time listener for session scores to calculate dynamic session wins, accuracy & bonus points
  try {
    unsubscribeScores = listenToCollection('scores', (scores) => {
      sessionWinsMap = calculateSessionWins(scores || []);
      cumulativePointsMap = calculateCumulativePoints(scores || []);
      _cachedWinsMap = sessionWinsMap;
      _cachedCumulativeMap = cumulativePointsMap;
      if (currentUsers.length > 0) {
        saveLeaderboardCache(currentUsers, sessionWinsMap, cumulativePointsMap);
        renderLeaderboardTable(currentUsers, sessionWinsMap, cumulativePointsMap);
      }
    });
  } catch (err) {
    console.warn('[Leaderboard] Unable to listen to scores:', err);
  }

  return fetchPromise;
}

/**
 * Render the leaderboard table
 * @param {Array} users 
 * @param {Record<string, number>} [winsMap={}]
 * @param {Record<string, {accuracyPoints: number, bonusPoints: number}>} [cumulativePoints={}]
 */
function renderLeaderboardTable(users, winsMap = {}, cumulativePoints = {}) {
  const container = document.getElementById('leaderboard-content');
  const podium = document.getElementById('leaderboard-podium');
  if (!container) return;

  // Filter out users with no points data and exclude admin
  const ranked = (users || [])
    .filter(u => u.id !== ADMIN_UID && (u.seasonPoints !== undefined || u.points !== undefined || u.displayName))
    .sort((a, b) => (Number(b.seasonPoints) || 0) - (Number(a.seasonPoints) || 0));

  if (ranked.length === 0) {
    if (isInitialLoading || !_hasLoadedOnce) {
      // Data is still loading! NEVER show empty state while initial loading is in progress
      renderLeaderboardSkeleton();
      return;
    }
    if (podium) podium.innerHTML = '';
    container.innerHTML = `
      <div class="empty-state">
        ${renderEmptyStateSVG()}
        <h3 class="empty-state-title">No standings yet</h3>
        <p class="empty-state-text">Complete a race weekend to see the leaderboard come alive.</p>
      </div>
    `;
    return;
  }

  if (podium) {
    podium.innerHTML = `<div class="podium">${ranked.slice(0, 3).map((user, index) => {
      const userWins = winsMap[user.id] !== undefined ? winsMap[user.id] : (user.wins || 0);
      return `<div class="podium-card"><span class="podium-number" aria-hidden="true">0${index + 1}</span><p class="eyebrow">${index === 0 ? 'THE CHAMPIONSHIP LEADER' : index === 1 ? 'SECOND IN COMMAND' : 'IN THE HUNT'}</p><h2>${escapeHTML(user.displayName || 'Driver')}</h2><p class="podium-score"><strong>${user.seasonPoints || 0}</strong> PTS <span style="font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--text-muted); margin-left: 6px;">(${userWins} ${userWins === 1 ? 'win' : 'wins'})</span></p></div>`;
    }).join('')}</div>`;
  }

  container.innerHTML = `
    <div class="table-responsive">
      <table class="leaderboard-table" role="table" aria-label="Championship standings">
        <thead>
          <tr>
            <th style="width: 60px; padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em;">#</th>
            <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap;">Player</th>
            <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right; white-space: nowrap;">Season Pts</th>
            <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right; white-space: nowrap;">Last Event</th>
            <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right; white-space: nowrap;">Session Wins</th>
            <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right; white-space: nowrap;">Cumulative Accuracy Pts</th>
            <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right; white-space: nowrap;">Cumulative Bonus Pts</th>
          </tr>
        </thead>
        <tbody>
          ${ranked.map((user, index) => {
            const rank = index + 1;
            const prevRank = previousRanks[user.id];
            const isLeader = rank === 1;
            
            // Determine animation class
            let animClass = '';
            if (prevRank !== undefined) {
              if (rank < prevRank) animClass = 'animate-rank-up';
              else if (rank > prevRank) animClass = 'animate-rank-down';
            }

            // Rank display
            const rankDisplay = String(rank).padStart(2, '0');

            // Last event delta
            const lastEvent = user.lastEventScore || 0;
            const deltaStr = lastEvent > 0 ? `+${lastEvent}` : lastEvent === 0 ? '-' : `${lastEvent}`;
            const deltaClass = lastEvent > 0 ? 'text-success' : lastEvent < 0 ? 'text-error' : 'text-muted';

            // Session wins (computed from scores with fallback to user.wins)
            const userWins = winsMap[user.id] !== undefined ? winsMap[user.id] : (user.wins || 0);
            const cp = cumulativePoints[user.id];
            let userAcc = cp?.accuracyPoints ?? user.cumulativeAccuracyPoints ?? user.accuracyPoints;
            let userBonus = cp?.bonusPoints ?? user.cumulativeBonusPoints ?? user.bonusPoints;

            userAcc = Number(userAcc) || 0;
            userBonus = Number(userBonus) || 0;

            // Fallback: If both are 0 but user has seasonPoints > 0, reflect seasonPoints in accuracy
            if (userAcc === 0 && userBonus === 0 && (user.seasonPoints || 0) > 0) {
              userAcc = Number(user.seasonPoints) || 0;
            }

            return `
              <tr class="leaderboard-row ${isLeader ? 'leader' : ''} ${animClass}" data-user-id="${escapeHTML(user.id)}">
                <td><span class="standing-rank">${rankDisplay}</span></td>
                <td style="white-space: nowrap;">
                  <div class="standing-player"><span class="standing-avatar" aria-hidden="true">${escapeHTML((user.displayName || 'D').slice(0, 2).toUpperCase())}</span><span class="standing-name">${escapeHTML(user.displayName || 'Driver')}</span></div>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                  <span class="text-data" style="font-size: var(--text-lg); font-weight: var(--weight-bold);">${user.seasonPoints || 0}</span>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                  <span class="stat-delta ${deltaClass} text-data">${deltaStr}</span>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                  <span class="text-data" style="font-size: var(--text-base); font-weight: var(--weight-bold); color: var(--text-primary);">${userWins}</span>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                  <span class="text-data" style="font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-secondary); font-family: var(--font-data);">${userAcc}</span>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                  <span class="text-data" style="font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--sprint-amber, #e5a93c); font-family: var(--font-data);">${userBonus}</span>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Update previous ranks for next render
  ranked.forEach((user, index) => {
    previousRanks[user.id] = index + 1;
  });
}

/**
 * Cleanup leaderboard listener
 */
function cleanupLeaderboard() {
  if (unsubscribeUsers) {
    unsubscribeUsers();
    unsubscribeUsers = null;
  }
  if (unsubscribeScores) {
    unsubscribeScores();
    unsubscribeScores = null;
  }
}

// --- Exports ---
export {
  renderLeaderboard,
  cleanupLeaderboard
};
