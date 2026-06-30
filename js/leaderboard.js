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
    <div class="page-header">
      <h1 class="page-title text-display">Championship Standings</h1>
      <p class="page-subtitle">2026 F1 Prediction League</p>
    </div>

    <!-- Leaderboard Header -->
    <div class="card" style="margin-bottom: var(--space-4);">
      <div class="card-header" style="position: relative; overflow: hidden;">
        ${createTelemetrySVG(800)}
        <div style="position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between;">
          <span class="text-label">Live Standings</span>
          <span class="save-indicator saved" style="font-size: var(--text-xs);">● Live</span>
        </div>
      </div>
    </div>

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
    .filter(u => u.seasonPoints !== undefined && u.email !== 'vikash11004@gmail.com')
    .sort((a, b) => b.seasonPoints - a.seasonPoints);

  if (ranked.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        ${renderEmptyStateSVG()}
        <h3 class="empty-state-title">No standings yet</h3>
        <p class="empty-state-text">Complete a race weekend to see the leaderboard come alive.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="leaderboard-table" role="table" aria-label="Championship standings">
      <thead>
        <tr>
          <th style="width: 60px; padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em;">#</th>
          <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em;">Player</th>
          <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right;">Season Pts</th>
          <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right;">Last Event</th>
          <th style="padding: var(--space-3) var(--space-5); color: var(--text-muted); font-family: var(--font-body); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; text-align: right;">Wins</th>
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
          let rankDisplay = rank;
          if (rank === 1) rankDisplay = '🥇';
          else if (rank === 2) rankDisplay = '🥈';
          else if (rank === 3) rankDisplay = '🥉';

          // Last event delta
          const lastEvent = user.lastEventScore || 0;
          const deltaStr = lastEvent > 0 ? `+${lastEvent}` : lastEvent === 0 ? '-' : `${lastEvent}`;
          const deltaClass = lastEvent > 0 ? 'text-success' : lastEvent < 0 ? 'text-error' : 'text-muted';

          return `
            <tr class="leaderboard-row ${isLeader ? 'leader' : ''} ${animClass}" data-user-id="${user.id}">
              <td style="font-family: var(--font-display); font-weight: var(--weight-bold); font-size: var(--text-md);">${rankDisplay}</td>
              <td>
                <div style="display: flex; flex-direction: column;">
                  <span style="font-weight: var(--weight-semibold);">${user.displayName || 'Unknown'}</span>
                  <span class="text-body-sm text-muted">${user.email || ''}</span>
                </div>
              </td>
              <td style="text-align: right;">
                <span class="text-data" style="font-size: var(--text-lg); font-weight: var(--weight-bold);">${user.seasonPoints || 0}</span>
              </td>
              <td style="text-align: right;">
                <span class="stat-delta ${deltaClass} text-data">${deltaStr}</span>
              </td>
              <td style="text-align: right;">
                <span class="text-data">${user.wins || 0}</span>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
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
