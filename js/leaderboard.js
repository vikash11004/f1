import { escapeHTML, pageHeading } from './design.js';
// ============================================
// F1 PREDICTION LEAGUE — LEADERBOARD
// Table · Rank animation · Real-time updates
// ============================================

import {
  listenToCollection,
  getAllDocuments
} from './firebase.js';
import { createTelemetrySVG, renderEmptyStateSVG } from './drivers.js';
import { rowSkeletonHTML } from './ui.js';

// --- State ---
let unsubscribe = null;
let previousRanks = {}; // userId -> previous rank for animation

/**
 * Render the leaderboard page
 */
async function renderLeaderboard() {
  const page = document.getElementById('leaderboard-page');
  if (!page) return;

  // Cleanup previous listener
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  page.innerHTML = `
    ${pageHeading('THE CHAMPIONSHIP / STANDINGS', 'Chasing the top step.', 'Every prediction counts. This is where the season takes shape.', '<span class="season-label"><span class="status-dot"></span> LIVE STANDINGS</span>')}
    <div id="leaderboard-podium"></div>
    <div class="standings-live"><span>THE CLASSIFICATION</span><span>2026 SEASON POINTS</span></div>
    <div id="leaderboard-content">
      ${rowSkeletonHTML(10)}
    </div>
  `;

  // Set up real-time listener
  unsubscribe = listenToCollection('users', (users) => {
    renderLeaderboardTable(users);
  }, [], {
    orderByField: 'seasonPoints',
    orderDirection: 'desc'
  });
}

/**
 * Render the leaderboard table
 * @param {Array} users 
 */
function renderLeaderboardTable(users) {
  const container = document.getElementById('leaderboard-content');
  if (!container) return;

  // Filter out users with no points data and exclude admin
  const ranked = users
    .filter(u => u.seasonPoints !== undefined && u.email !== 'vikashthyadi@gmail.com' && u.email !== 'vikash11004@gmail.com')
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

  document.getElementById('leaderboard-podium').innerHTML = `<div class="podium">${ranked.slice(0, 3).map((user, index) => `<div class="podium-card"><span class="podium-number" aria-hidden="true">0${index + 1}</span><p class="eyebrow">${index === 0 ? 'THE CHAMPIONSHIP LEADER' : index === 1 ? 'SECOND IN COMMAND' : 'IN THE HUNT'}</p><h2>${escapeHTML(user.displayName || 'Driver')}</h2><p class="podium-score"><strong>${user.seasonPoints || 0}</strong> PTS <span aria-hidden="true"> / </span> ${user.wins || 0} WINS</p></div>`).join('')}</div>`;

  container.innerHTML = `
    <div class="table-responsive">
      <table class="leaderboard-table" role="table" aria-label="Championship standings">
        <thead>
          <tr>
            <th style="width: 60px; padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em;">#</th>
            <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap;">Player</th>
            <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right; white-space: nowrap;">Season Pts</th>
            <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right; white-space: nowrap;">Last Event</th>
            <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right; white-space: nowrap;">Wins</th>
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
                  <span class="text-data">${user.wins || 0}</span>
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
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

// --- Exports ---
export {
  renderLeaderboard,
  cleanupLeaderboard
};
