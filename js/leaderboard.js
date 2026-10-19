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
import { rowSkeletonHTML } from './ui.js';
import { calculateSessionWins } from './scoring.js';

// --- State ---
let unsubscribeUsers = null;
let unsubscribeScores = null;
let currentUsers = [];
let sessionWinsMap = {};
let previousRanks = {}; // userId -> previous rank for animation

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
    <div id="leaderboard-content">
      ${rowSkeletonHTML(10)}
    </div>
  `;

  // Set up real-time listener for users
  unsubscribeUsers = listenToCollection('users', (users) => {
    currentUsers = users || [];
    renderLeaderboardTable(currentUsers, sessionWinsMap);
  }, [], {
    orderByField: 'seasonPoints',
    orderDirection: 'desc'
  });

  // Set up real-time listener for session scores to calculate dynamic session wins
  try {
    unsubscribeScores = listenToCollection('scores', (scores) => {
      sessionWinsMap = calculateSessionWins(scores || []);
      if (currentUsers.length > 0) {
        renderLeaderboardTable(currentUsers, sessionWinsMap);
      }
    });
  } catch (err) {
    console.warn('[Leaderboard] Unable to listen to scores:', err);
  }
}

/**
 * Render the leaderboard table
 * @param {Array} users 
 * @param {Record<string, number>} [winsMap={}]
 */
function renderLeaderboardTable(users, winsMap = {}) {
  const container = document.getElementById('leaderboard-content');
  if (!container) return;

  // Filter out users with no points data and exclude admin
  const ranked = users
    .filter(u => u.seasonPoints !== undefined && u.id !== ADMIN_UID)
    .sort((a, b) => b.seasonPoints - a.seasonPoints);

  if (ranked.length === 0) {
    document.getElementById('leaderboard-podium').innerHTML = '';
    container.innerHTML = `
      <div class="empty-state">
        ${renderEmptyStateSVG()}
        <h3 class="empty-state-title">No standings yet</h3>
        <p class="empty-state-text">Complete a race weekend to see the leaderboard come alive.</p>
      </div>
    `;
    return;
  }

  document.getElementById('leaderboard-podium').innerHTML = `<div class="podium">${ranked.slice(0, 3).map((user, index) => {
    const userWins = winsMap[user.id] !== undefined ? winsMap[user.id] : (user.wins || 0);
    return `<div class="podium-card"><span class="podium-number" aria-hidden="true">0${index + 1}</span><p class="eyebrow">${index === 0 ? 'THE CHAMPIONSHIP LEADER' : index === 1 ? 'SECOND IN COMMAND' : 'IN THE HUNT'}</p><h2>${escapeHTML(user.displayName || 'Driver')}</h2><p class="podium-score"><strong>${user.seasonPoints || 0}</strong> PTS <span style="font-size: var(--text-xs); font-weight: var(--weight-medium); color: var(--text-muted); margin-left: 6px;">(${userWins} ${userWins === 1 ? 'win' : 'wins'})</span></p></div>`;
  }).join('')}</div>`;

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
