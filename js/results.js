// ============================================
// F1 PREDICTION LEAGUE — RESULTS
// Official results · Player scores & breakdown · Excel export
// ============================================

import {
  auth,
  isAdmin,
  getDocument,
  setDocument,
  queryCollection,
  getAllDocuments,
  createBatch,
  getDocRef,
  serverTimestamp
} from './firebase.js';
import {
  SESSION_KEYS,
  SESSION_LABELS,
  SESSION_FULL_LABELS,
  getTeamById
} from './seed.js';
import { getDriver, getTeamColor, renderEmptyStateSVG } from './drivers.js';
import { calculateSessionScore, sortByActualPosition } from './scoring.js';
import { renderPredictionBuilder } from './predictions.js';
import { showToast, navigateTo, formatRound } from './ui.js';
import { escapeHTML } from './design.js';
import { exportSessionToExcel, getCumulativeLeaderboardTillSession } from './export.js';

/**
 * Render the results page (for both users and admin)
 * If results are confirmed, renders the full Results Breakdown view.
 * If results are not confirmed:
 *   - admin can enter results
 *   - users see the results breakdown page in pending status with prediction list
 * @param {string} raceId 
 * @param {string} sessionKey 
 * @param {boolean} editOverride - whether to force edit mode (admin only)
 */
async function renderResults(raceId, sessionKey, editOverride = false) {
  if (editOverride && isAdmin()) {
    await renderPredictionBuilder(raceId, sessionKey, true, true);
    return;
  }

  // Check if official results exist
  try {
    const existingResult = await getDocument('results', `${raceId}_${sessionKey}`);
    if (existingResult?.calculatedAt && Array.isArray(existingResult.order) && existingResult.order.length > 0) {
      await renderResultsBreakdown(raceId, sessionKey);
      return;
    }
  } catch (e) {
    console.warn('[Results] Error checking existing results:', e);
  }

  // If no confirmed results yet:
  if (isAdmin()) {
    // Admin goes to results entry builder
    await renderPredictionBuilder(raceId, sessionKey, true, false);
  } else {
    // Regular user views pending session results / predictions breakdown
    await renderResultsBreakdown(raceId, sessionKey);
  }
}

/**
 * Process results after admin confirms
 * Calculates scores for all players and updates Firestore
 * @param {string} raceId 
 * @param {string} session 
 * @param {Array<string>} officialOrder - array of 22 driverIds in official finishing order
 */
async function processResults(raceId, session, officialOrder) {
  const page = document.getElementById('results-page');
  
  if (page) {
    page.innerHTML = `
      <div class="spinner-overlay">
        <div class="spinner-lg"></div>
        <span class="spinner-text">Calculating scores...</span>
      </div>
    `;
  }

  try {
    // 1. Save the official result
    await setDocument('results', `${raceId}_${session}`, {
      raceId,
      session,
      order: officialOrder,
      calculatedAt: serverTimestamp()
    }, true);

    // 2. Get all predictions for this session
    const predictions = await queryCollection('predictions', [
      ['raceId', '==', raceId],
      ['session', '==', session]
    ]);

    const batch = createBatch();

    // Auto-complete the race if all non-voided sessions now have results
    const raceDoc = await getDocument('races', raceId);
    if (raceDoc && raceDoc.status !== 'completed') {
      const allSessions = SESSION_KEYS[raceDoc.weekendType] || SESSION_KEYS.standard;
      const cancelledSessions = raceDoc.cancelledSessions || {};
      const nonVoidedSessions = allSessions.filter(s => cancelledSessions[s] !== true);
      
      let allDone = true;
      for (const s of nonVoidedSessions) {
        if (s === session) continue;
        try {
          const res = await getDocument('results', `${raceId}_${s}`);
          if (!res?.calculatedAt) { allDone = false; break; }
        } catch { allDone = false; break; }
      }
      
      if (allDone && nonVoidedSessions.length > 0) {
        const raceRef = getDocRef('races', raceId);
        batch.update(raceRef, { status: 'completed' });
      }
    }

    if (predictions.length === 0) {
      await batch.commit();
      showToast(`Results confirmed for ${SESSION_FULL_LABELS[session] || session}! (0 player predictions)`, 'info');
      await renderResultsBreakdown(raceId, session);
      return;
    }

    // 3. Calculate scores for each player
    const playerScores = [];
    for (const pred of predictions) {
      if (!pred.order || pred.order.length !== 22) continue;

      const result = calculateSessionScore(pred.order, officialOrder, session);
      playerScores.push({
        userId: pred.userId,
        predictionId: pred.id,
        ...result
      });
    }

    // 4. Batch update user scores and save per-prediction scores
    for (const ps of playerScores) {
      const oldScoreDoc = await getDocument('scores', `${ps.userId}_${raceId}_${session}`);
      let delta = ps.totalPoints;
      if (oldScoreDoc && oldScoreDoc.totalPoints !== undefined) {
        delta = ps.totalPoints - oldScoreDoc.totalPoints;
      }

      const userData = await getDocument('users', ps.userId);
      if (!userData) continue;

      const newSeasonPoints = (userData.seasonPoints || 0) + delta;
      const userRef = getDocRef('users', ps.userId);
      batch.update(userRef, {
        seasonPoints: newSeasonPoints,
        lastEventScore: ps.totalPoints
      });

      const scoreRef = getDocRef('scores', `${ps.userId}_${raceId}_${session}`);
      batch.set(scoreRef, {
        userId: ps.userId,
        raceId,
        session,
        totalPoints: ps.totalPoints,
        accuracyPoints: ps.accuracyPoints,
        bonusPoints: ps.bonusPoints,
        driverScores: ps.driverScores,
        bonuses: ps.bonuses,
        calculatedAt: serverTimestamp()
      });
    }

    await batch.commit();

    // 5. Show results breakdown
    await showResultsBreakdown(page, playerScores, officialOrder, raceId, session);
    showToast(`Scores calculated for ${SESSION_FULL_LABELS[session] || session}!`, 'success');

  } catch (error) {
    console.error('[Results] Error processing results:', error);
    showToast('Failed to calculate scores: ' + error.message, 'error');
    navigateTo('races');
  }
}

/**
 * Display the score breakdown, official classification, and other players' results
 * @param {HTMLElement} page 
 * @param {Array} playerScores 
 * @param {Array} officialOrder 
 * @param {string} raceId
 * @param {string} session 
 */
async function showResultsBreakdown(page, playerScores, officialOrder, raceId, session) {
  if (!page) return;

  // Load race data for session tabs and weekend selector
  const raceDoc = await getDocument('races', raceId);
  const allRaces = await getAllDocuments('races');
  allRaces.sort((a, b) => a.round - b.round);
  const currentRaceIndex = allRaces.findIndex(r => r.id === raceId);
  const prevRace = currentRaceIndex > 0 ? allRaces[currentRaceIndex - 1] : null;
  const nextRace = currentRaceIndex >= 0 && currentRaceIndex < allRaces.length - 1 ? allRaces[currentRaceIndex + 1] : null;

  // Query all results to show status tags in the dropdown
  const allResults = await getAllDocuments('results');
  const racesWithResultsStatus = {};
  (allResults || []).forEach(r => {
    if (r.calculatedAt && r.order?.length) {
      racesWithResultsStatus[r.raceId] = true;
    }
  });

  const sessions = raceDoc ? (SESSION_KEYS[raceDoc.weekendType] || SESSION_KEYS.standard) : [session];
  const cancelledSessions = raceDoc?.cancelledSessions || {};

  // Check confirmed results status for all sessions
  const sessionResultsStatus = {};
  for (const s of sessions) {
    try {
      const resDoc = await getDocument('results', `${raceId}_${s}`);
      if (resDoc?.calculatedAt && resDoc?.order?.length) {
        sessionResultsStatus[s] = true;
      }
    } catch (e) {}
  }

  // Get user names
  const users = await getAllDocuments('users');
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u; });

  const hasResults = Boolean(officialOrder && officialOrder.length > 0);

  // Sort players by total points descending
  playerScores.sort((a, b) => b.totalPoints - a.totalPoints);

  const currentUserId = auth.currentUser?.uid;
  const currentUserScore = playerScores.find(ps => ps.userId === currentUserId);
  const currentUserRank = currentUserScore ? (playerScores.indexOf(currentUserScore) + 1) : null;
  const currentUserName = userMap[currentUserId]?.displayName || 'You';

  const sessionLabel = SESSION_FULL_LABELS[session] || session;
  const raceName = raceDoc?.name || 'Grand Prix';

  page.innerHTML = `
    <div class="page-header" style="margin-bottom: var(--space-4);">
      <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
        <button class="btn btn-ghost btn-sm" id="btn-back-results">← Back to Races</button>
        <span class="badge-round text-display">${formatRound(raceDoc?.round || 1)}</span>
        <div>
          <h1 class="page-title text-display" style="margin-bottom: 0; font-size: var(--text-xl);">
            ${raceName} — ${sessionLabel}
          </h1>
          <p class="text-body-sm text-muted" style="margin: 0;">${escapeHTML(raceDoc?.circuit || '')} · ${escapeHTML(raceDoc?.country || '')}</p>
        </div>

        <span class="badge" style="background: ${hasResults ? 'var(--status-completed)' : 'var(--accent)'}; color: white; border: none;">
          ${hasResults ? 'RESULTS CONFIRMED' : 'AWAITING CLASSIFICATION'}
        </span>
      </div>
      <p class="page-subtitle" style="margin-top: var(--space-2);">
        ${hasResults ? `${playerScores.length} players scored · Official race classification confirmed` : `${playerScores.length} player prediction(s) submitted`}
      </p>
    </div>

    <!-- Grand Prix Weekend Selector Bar -->
    <div class="results-weekend-bar" style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-4); background: var(--bg-surface); padding: var(--space-3) var(--space-4); border-radius: var(--radius-lg); border: 1px solid var(--glass-border);">
      <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
        <label for="results-race-select" style="font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; color: var(--text-muted); display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          Select Weekend:
        </label>
        <select id="results-race-select" class="form-input" style="min-height: 36px; padding: 4px 12px; font-size: var(--text-sm); font-weight: 600; background: var(--bg-base); color: var(--text-primary); border-color: var(--glass-border); border-radius: var(--radius-md); cursor: pointer; max-width: 360px;">
          ${allRaces.map(r => {
            const isSelected = r.id === raceId;
            const hasRes = racesWithResultsStatus[r.id];
            const tag = hasRes ? '✓ Results Available' : (r.status || 'upcoming').toUpperCase();
            return `<option value="${r.id}" ${isSelected ? 'selected' : ''}>
              Round ${String(r.round).padStart(2, '0')} · ${r.countryFlag || '🏁'} ${r.name} (${tag})
            </option>`;
          }).join('')}
        </select>
        <div style="display: inline-flex; gap: 4px;">
          <button class="btn btn-sm btn-ghost" id="btn-prev-gp" ${prevRace ? '' : 'disabled'} title="${prevRace ? `Go to Round ${prevRace.round} (${prevRace.name})` : 'No previous Grand Prix'}" style="padding: 4px 8px; font-size: var(--text-xs);">
            ← Prev GP
          </button>
          <button class="btn btn-sm btn-ghost" id="btn-next-gp" ${nextRace ? '' : 'disabled'} title="${nextRace ? `Go to Round ${nextRace.round} (${nextRace.name})` : 'No next Grand Prix'}" style="padding: 4px 8px; font-size: var(--text-xs);">
            Next GP →
          </button>
        </div>
      </div>

      <div style="display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap;">
        <button class="btn btn-secondary btn-sm" id="btn-export-results-breakdown" style="display: inline-flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="12" y1="18" x2="12" y2="12"></line>
            <line x1="9" y1="15" x2="12" y2="18"></line>
            <line x1="15" y1="15" x2="12" y2="18"></line>
          </svg>
          Export Excel
        </button>
        ${isAdmin() ? `
          <button class="btn btn-secondary btn-sm" id="btn-edit-results-breakdown" style="display: inline-flex; align-items: center; gap: 6px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
            Edit Results
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Session Tabs -->
    <div class="session-tabs" id="session-tabs" role="tablist" style="margin-bottom: var(--space-4);">
      ${sessions.map(s => {
        const isActive = s === session;
        const tabIsVoided = cancelledSessions[s] === true;
        const isConfirmed = sessionResultsStatus[s] === true;
        return `
          <button class="session-tab ${isActive ? 'active' : ''}" 
                  data-session="${s}" 
                  role="tab" 
                  aria-selected="${isActive}"
                  aria-label="${SESSION_FULL_LABELS[s]}">
            ${SESSION_LABELS[s]}
            ${tabIsVoided 
              ? `<span class="tab-score" style="color: #ff4d4d; font-weight: bold;">CANCELLED</span>` 
              : (isConfirmed 
                  ? `<span class="tab-score" style="color: var(--status-completed); font-weight: bold;">✓ CONFIRMED</span>` 
                  : `<span class="tab-score" style="color: var(--text-muted);">PENDING</span>`)}
          </button>
        `;
      }).join('')}
    </div>

    <!-- View Mode Switcher -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-5);">
      <div class="toggle-group" id="results-view-mode">
        <button class="toggle-option active" data-view="scores" id="view-tab-scores" style="display: inline-flex; align-items: center; gap: 6px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          Player Scores & Standings
        </button>
        <button class="toggle-option" data-view="official" id="view-tab-official" style="display: inline-flex; align-items: center; gap: 6px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
            <line x1="4" y1="22" x2="4" y2="15"></line>
          </svg>
          Official Classification (${officialOrder.length ? officialOrder.length : 22})
        </button>
        <button class="toggle-option" data-view="matrix" id="view-tab-matrix" style="display: inline-flex; align-items: center; gap: 6px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="3" y1="15" x2="21" y2="15"></line>
            <line x1="9" y1="3" x2="9" y2="21"></line>
            <line x1="15" y1="3" x2="15" y2="21"></line>
          </svg>
          Grid Picks Matrix
        </button>
        <button class="toggle-option" data-view="overall" id="view-tab-overall" style="display: inline-flex; align-items: center; gap: 6px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
            <path d="M4 22h16"></path>
            <path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34c3.48-.82 6-3.96 6-7.66V4H4v3c0 3.7 2.52 6.84 6 7.66z"></path>
          </svg>
          Overall Leaderboard
        </button>
      </div>

      <div style="font-size: var(--text-xs); color: var(--text-muted);">
        Compare your predictions, view official finishing orders, and export full reports.
      </div>
    </div>

    <!-- Main Results Dynamic Content Area -->
    <div id="results-content-area"></div>
  `;

  // Render view mode function
  let currentView = 'scores';

  function renderView() {
    const area = document.getElementById('results-content-area');
    if (!area) return;

    // Update toggle active buttons
    page.querySelectorAll('#results-view-mode .toggle-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === currentView);
    });

    if (currentView === 'official') {
      // ==========================================
      // VIEW 1: OFFICIAL CLASSIFICATION TABLE
      // ==========================================
      if (!hasResults) {
        area.innerHTML = `
          <div class="empty-state" style="padding: var(--space-8) var(--space-4);">
            ${renderEmptyStateSVG()}
            <h3 class="empty-state-title">Official Results Pending</h3>
            <p class="empty-state-text">Race control has not published the official classification for ${sessionLabel} yet.</p>
            ${isAdmin() ? `
              <button class="btn btn-primary" id="btn-enter-results-inline" style="margin-top: var(--space-3);">
                Admin: Enter Official Results
              </button>
            ` : ''}
          </div>
        `;
        document.getElementById('btn-enter-results-inline')?.addEventListener('click', () => {
          renderResults(raceId, session, true);
        });
        return;
      }

      area.innerHTML = `
        <div class="card" style="background: var(--bg-surface); padding: var(--space-5); border-radius: var(--radius-lg); overflow-x: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); flex-wrap: wrap; gap: var(--space-2);">
            <div>
              <h2 class="text-display-sm" style="margin: 0;">FIA Official Classification</h2>
              <p class="text-body-sm text-muted" style="margin: 0;">Verified finishing order for ${raceName} — ${sessionLabel}</p>
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-export-official-direct" style="display: inline-flex; align-items: center; gap: 6px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Export to Excel (.xlsx)
            </button>
          </div>

          <table class="official-table">
            <thead>
              <tr>
                <th style="width: 70px;">Pos</th>
                <th>Driver</th>
                <th>No.</th>
                <th>Team</th>
                <th>Engine</th>
                <th>Nationality</th>
              </tr>
            </thead>
            <tbody>
              ${officialOrder.map((driverId, idx) => {
                const driver = getDriver(driverId);
                const team = driver ? getTeamById(driver.team) : null;
                const teamColor = team ? team.color : '#888';
                const pos = idx + 1;
                const posBadgeStyle = pos === 1 
                  ? 'background: #ffd700; color: #111; font-weight: bold;'
                  : pos === 2 
                    ? 'background: #c0c0c0; color: #111; font-weight: bold;'
                    : pos === 3 
                      ? 'background: #cd7f32; color: #fff; font-weight: bold;'
                      : 'background: var(--glass-bg); color: var(--text-muted);';

                return `
                  <tr>
                    <td>
                      <span class="badge" style="${posBadgeStyle}; min-width: 32px; text-align: center;">
                        P${pos}
                      </span>
                    </td>
                    <td style="font-weight: 600;">
                      <span style="display: inline-block; width: 4px; height: 14px; background: ${teamColor}; border-radius: 2px; margin-right: 8px; vertical-align: middle;"></span>
                      ${driver ? `${driver.code} — ${driver.name}` : driverId}
                    </td>
                    <td style="color: var(--text-muted); font-family: var(--font-data);">#${driver?.number || '-'}</td>
                    <td>${team?.name || '-'}</td>
                    <td style="color: var(--text-muted);">${team?.engine || '-'}</td>
                    <td>${driver?.flag || ''} ${driver?.nationality || '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      document.getElementById('btn-export-official-direct')?.addEventListener('click', () => {
        exportSessionToExcel(raceId, session);
      });

    } else if (currentView === 'matrix') {
      // ==========================================
      // VIEW 2: GRID PICKS MATRIX (ALL PLAYERS)
      // ==========================================
      if (playerScores.length === 0) {
        area.innerHTML = `
          <div class="empty-state" style="padding: var(--space-8) var(--space-4);">
            ${renderEmptyStateSVG()}
            <h3 class="empty-state-title">No Predictions Submitted</h3>
            <p class="empty-state-text">No players entered predictions for this session.</p>
          </div>
        `;
        return;
      }

      area.innerHTML = `
        <div class="card" style="background: var(--bg-surface); padding: var(--space-5); border-radius: var(--radius-lg); overflow-x: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); flex-wrap: wrap; gap: var(--space-2);">
            <div>
              <h2 class="text-display-sm" style="margin: 0;">Grid Picks Matrix</h2>
              <p class="text-body-sm text-muted" style="margin: 0;">Side-by-side comparison of every player's predicted grid</p>
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-export-matrix-direct" style="display: inline-flex; align-items: center; gap: 6px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Export to Excel (.xlsx)
            </button>
          </div>

          <table class="official-table" style="min-width: ${300 + playerScores.length * 160}px;">
            <thead>
              <tr>
                <th style="width: 60px;">Pos</th>
                ${hasResults ? '<th style="width: 200px; background: rgba(232,0,45,0.15);">Official Result</th>' : ''}
                ${playerScores.map(ps => {
                  const uName = userMap[ps.userId]?.displayName || 'Player';
                  const isYou = ps.userId === currentUserId;
                  return `<th style="${isYou ? 'background: rgba(232,0,45,0.2); color: var(--accent);' : ''}">${escapeHTML(uName)}${isYou ? ' (You)' : ''}</th>`;
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${Array.from({ length: 22 }).map((_, idx) => {
                const pos = idx + 1;
                const actualDriver = hasResults && officialOrder[idx] ? getDriver(officialOrder[idx]) : null;
                const actualText = actualDriver ? `${actualDriver.code} - ${actualDriver.name}` : '-';

                return `
                  <tr>
                    <td style="font-weight: bold; color: var(--text-muted);">P${pos}</td>
                    ${hasResults ? `<td style="font-weight: 600; background: rgba(232,0,45,0.05);">${actualText}</td>` : ''}
                    ${playerScores.map(ps => {
                      const ds = ps.driverScores?.find(d => d.actualPos === pos || d.predictedPos === pos);
                      // Driver predicted at this exact index
                      const predDoc = ps.order ? ps.order[idx] : null;
                      // Fallback to driverScores
                      const driverIdAtPos = predDoc || (ps.driverScores?.find(d => d.predictedPos === pos)?.driverId);
                      const drv = getDriver(driverIdAtPos);
                      const isYou = ps.userId === currentUserId;

                      return `
                        <td style="${isYou ? 'background: rgba(232,0,45,0.04);' : ''}">
                          ${drv ? `${drv.code} - ${drv.name}` : '-'}
                        </td>
                      `;
                    }).join('')}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      document.getElementById('btn-export-matrix-direct')?.addEventListener('click', () => {
        exportSessionToExcel(raceId, session);
      });

    } else {
      // ==========================================
      // VIEW 3: SCORES & BREAKDOWN (DEFAULT)
      // ==========================================
      let html = '';

      // --- SECTION 1: YOUR RESULT (FEATURED HERO CARD) ---
      if (currentUserScore) {
        const sortedScores = sortByActualPosition(currentUserScore.driverScores || []);
        html += `
          <div class="result-hero-card animate-card-enter">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-4); margin-bottom: var(--space-4); border-bottom: 1px solid var(--glass-border); padding-bottom: var(--space-3);">
              <div>
                <span class="badge" style="background: var(--accent); color: white; font-weight: bold; margin-bottom: 6px; display: inline-flex; align-items: center; gap: 6px;">
                  <span class="live-dot" style="background: #fff; width: 6px; height: 6px; border-radius: 50%;"></span>
                  YOUR PERFORMANCE
                </span>
                <h2 class="text-display-sm" style="margin: 2px 0;">
                  ${escapeHTML(currentUserName)}
                </h2>
                <span class="badge" style="background: var(--glass-bg); border: 1px solid var(--glass-border); font-size: var(--text-xs); margin-top: 4px; display: inline-flex; align-items: center; gap: 5px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--gold);">
                    <circle cx="12" cy="8" r="7"></circle>
                    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
                  </svg>
                  Rank #${currentUserRank} of ${playerScores.length} players
                </span>
              </div>

              <div style="text-align: right;">
                <span class="text-muted" style="font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em; display: block;">
                  TOTAL SCORE
                </span>
                <span class="result-player-score" style="font-size: 2.2rem; line-height: 1;">
                  ${currentUserScore.totalPoints} <small style="font-size: 1rem; color: var(--text-muted);">PTS</small>
                </span>
                <div style="display: flex; gap: var(--space-2); margin-top: 4px; justify-content: flex-end;">
                  <span class="badge" style="background: rgba(255,255,255,0.06); font-size: 11px;">
                    🎯 Accuracy: ${currentUserScore.accuracyPoints || 0} pts
                  </span>
                  <span class="badge" style="background: rgba(232,0,45,0.15); color: var(--accent); font-size: 11px;">
                    ⭐ Bonus: ${currentUserScore.bonusPoints || 0} pts
                  </span>
                </div>
              </div>
            </div>

            <!-- Driver breakdown table -->
            <div style="max-height: 340px; overflow-y: auto; margin-bottom: var(--space-4);">
              <table class="score-breakdown">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Your Pick</th>
                    <th>Actual Result</th>
                    <th>Diff</th>
                    <th>Accuracy Pts</th>
                  </tr>
                </thead>
                <tbody>
                  ${sortedScores.map(ds => {
                    const driver = getDriver(ds.driverId);
                    const teamColor = driver ? getTeamColor(driver.team) : '#888';
                    const isExact = ds.diff === 0;
                    const diffColor = isExact ? 'var(--success)' : ds.diff <= 2 ? 'var(--sprint-amber)' : 'var(--text-muted)';
                    return `
                      <tr>
                        <td>
                          <span style="display: inline-block; width: 3px; height: 12px; background: ${teamColor}; border-radius: 2px; margin-right: 6px; vertical-align: middle;"></span>
                          <strong>${driver?.code || ds.driverId}</strong> — ${driver?.name || ''}
                        </td>
                        <td><span class="badge" style="background: var(--glass-bg);">P${ds.predictedPos}</span></td>
                        <td><span class="badge" style="background: rgba(255,255,255,0.05);">P${ds.actualPos}</span></td>
                        <td style="color: ${diffColor}; font-weight: 600;">
                          ${isExact ? '✓ Exact (0)' : `Off by ${ds.diff}`}
                        </td>
                        <td style="color: ${ds.points > 0 ? 'var(--accent)' : 'var(--text-muted)'}; font-weight: bold;">
                          +${ds.points}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <!-- Bonuses earned -->
            ${(currentUserScore.bonuses || []).some(b => b.earned) ? `
              <div style="display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center; padding-top: var(--space-3); border-top: 1px solid var(--glass-border);">
                <span style="font-size: var(--text-xs); color: var(--text-muted); font-weight: 600;">BONUSES ACHIEVED:</span>
                ${(currentUserScore.bonuses || []).filter(b => b.earned).map(b => `
                  <span class="badge" style="background: rgba(232,0,45,0.2); color: #fff; border: 1px solid var(--accent); font-weight: 600;">
                    ✓ ${b.label} (+${b.points} pts)
                  </span>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `;
      } else if (!isAdmin()) {
        html += `
          <div class="card" style="background: var(--glass-bg); padding: var(--space-4) var(--space-5); border-radius: var(--radius-lg); margin-bottom: var(--space-6); display: flex; align-items: center; justify-content: space-between;">
            <div>
              <h3 class="text-md" style="margin: 0 0 4px 0;">You did not enter predictions for this session</h3>
              <p class="text-body-sm text-muted" style="margin: 0;">Explore the official results and other players' predictions below.</p>
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-export-unsubmitted-excel" style="display: inline-flex; align-items: center; gap: 6px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Export Excel
            </button>
          </div>
        `;
      }

      // --- SECTION 2: ALL PLAYERS' RESULTS GRID ---
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); flex-wrap: wrap; gap: var(--space-2);">
          <h2 class="text-display-sm" style="margin: 0;">
            ${currentUserScore ? "All Players' Standings & Breakdowns" : "Session Leaderboard & Scores"}
          </h2>
          <span class="badge" style="background: var(--glass-bg); border: 1px solid var(--glass-border);">
            ${playerScores.length} Players
          </span>
        </div>

        <div class="result-grid" id="results-grid">
          ${playerScores.length === 0 ? `
            <div class="empty-state" style="grid-column: 1 / -1; padding: var(--space-8) var(--space-4);">
              ${renderEmptyStateSVG()}
              <h3 class="empty-state-title">No Predictions Found</h3>
              <p class="empty-state-text">No players entered predictions for this session.</p>
            </div>
          ` : playerScores.map((ps, index) => {
            const user = userMap[ps.userId];
            const userName = user?.displayName || 'Unknown Player';
            const sortedScores = sortByActualPosition(ps.driverScores || []);
            const isUser = ps.userId === currentUserId;

            return `
              <div class="result-player-card ${isUser ? 'is-current-user' : ''} animate-card-enter stagger-${(index % 6) + 1}">
                <div class="result-player-header">
                  <div>
                    <span class="text-body-sm text-muted">#${index + 1}</span>
                    <span class="result-player-name">${escapeHTML(userName)}${isUser ? ' (You)' : ''}</span>
                  </div>
                  <div style="text-align: right;">
                    <span class="result-player-score animate-count-up">${ps.totalPoints}</span>
                    <small style="display: block; font-size: 10px; color: var(--text-muted);">${ps.accuracyPoints || 0} acc + ${ps.bonusPoints || 0} bon</small>
                  </div>
                </div>
                <div style="padding: 0; max-height: 380px; overflow-y: auto;">
                  <table class="score-breakdown">
                    <thead>
                      <tr>
                        <th>Driver</th>
                        <th>Pred</th>
                        <th>Actual</th>
                        <th>Diff</th>
                        <th>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${sortedScores.map(ds => {
                        const driver = getDriver(ds.driverId);
                        const teamColor = driver ? getTeamColor(driver.team) : '#888';
                        const diffColor = ds.diff === 0 ? 'var(--success)' : ds.diff <= 2 ? 'var(--sprint-amber)' : 'var(--text-muted)';
                        return `
                          <tr>
                            <td>
                              <span style="display: inline-block; width: 3px; height: 12px; background: ${teamColor}; border-radius: 2px; margin-right: 6px; vertical-align: middle;"></span>
                              ${driver?.code || ds.driverId}
                            </td>
                            <td>P${ds.predictedPos}</td>
                            <td>P${ds.actualPos}</td>
                            <td style="color: ${diffColor}; font-weight: 600;">${ds.diff === 0 ? '✓' : ds.diff}</td>
                            <td style="color: ${ds.points > 0 ? 'var(--accent)' : 'var(--text-muted)'}; font-weight: bold;">${ds.points}</td>
                          </tr>
                        `;
                      }).join('')}
                      ${(ps.bonuses || []).filter(b => b.earned).map(b => `
                        <tr class="bonus-row">
                          <td colspan="4" style="font-weight: 600; color: var(--accent);">✓ ${b.label}</td>
                          <td style="font-weight: bold; color: var(--accent);">+${b.points}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      area.innerHTML = html;
      document.getElementById('btn-export-unsubmitted-excel')?.addEventListener('click', () => {
        exportSessionToExcel(raceId, session);
      });
    }

    if (currentView === 'overall') {
      // ==========================================
      // VIEW 4: OVERALL LEADERBOARD TILL THIS SESSION
      // ==========================================
      const scoreMap = {};
      playerScores.forEach(ps => { scoreMap[ps.userId] = ps; });

      area.innerHTML = `
        <div class="spinner-overlay" style="min-height: 200px;">
          <div class="spinner-sm"></div>
          <span class="spinner-text">Tallying overall leaderboard...</span>
        </div>
      `;

      getCumulativeLeaderboardTillSession(raceDoc, session, scoreMap).then(overallStandings => {
        if (!overallStandings || overallStandings.length === 0) {
          area.innerHTML = `
            <div class="empty-state" style="padding: var(--space-8) var(--space-4);">
              ${renderEmptyStateSVG()}
              <h3 class="empty-state-title">No Standings Available</h3>
              <p class="empty-state-text">No player points have been recorded up to this session yet.</p>
            </div>
          `;
          return;
        }

        const topThree = overallStandings.slice(0, 3);
        const currentUid = auth.currentUser?.uid;

        area.innerHTML = `
          <div class="card animate-fade-in" style="margin-bottom: var(--space-6);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-4);">
              <div>
                <p class="eyebrow" style="color: var(--accent); margin-bottom: 2px;">CUMULATIVE CHAMPIONSHIP STANDINGS</p>
                <h2 class="text-display" style="font-size: var(--text-lg); margin: 0;">
                  Overall Leaderboard Through Round ${raceDoc?.round || 1} (${sessionLabel})
                </h2>
                <p class="text-body-sm text-muted" style="margin: 4px 0 0 0;">
                  Cumulative standings for all players tallying points from Round 1 through this session.
                </p>
              </div>
              <button class="btn btn-secondary btn-sm" id="btn-export-overall-direct" style="display: inline-flex; align-items: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="12" y1="18" x2="12" y2="12"></line>
                  <line x1="9" y1="15" x2="12" y2="18"></line>
                  <line x1="15" y1="15" x2="12" y2="18"></line>
                </svg>
                Export Excel (.xlsx)
              </button>
            </div>

            <!-- Podium Mini Cards -->
            ${topThree.length >= 1 ? `
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-5);">
                ${topThree.map((p, idx) => {
                  const borderColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
                  const badges = ['1ST', '2ND', '3RD'];
                  const isMe = p.userId === currentUid;
                  return `
                    <div style="background: var(--bg-surface); border: 1px solid ${borderColors[idx] || 'var(--glass-border)'}; border-radius: var(--radius-md); padding: 12px 14px; position: relative; overflow: hidden;">
                      <div style="position: absolute; top: 0; right: 0; background: ${borderColors[idx]}; color: #000; font-size: 10px; font-weight: 800; padding: 2px 8px; border-bottom-left-radius: var(--radius-sm);">
                        ${badges[idx]}
                      </div>
                      <div style="font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; font-weight: 600;">
                        Rank #${p.rank}
                      </div>
                      <div style="font-weight: 700; font-size: var(--text-base); color: ${isMe ? 'var(--accent)' : 'var(--text-primary)'}; margin: 2px 0;">
                        ${escapeHTML(p.displayName)} ${isMe ? '<span style="font-size: 11px; opacity: 0.8;">(You)</span>' : ''}
                      </div>
                      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px;">
                        <span class="text-data" style="font-size: var(--text-lg); font-weight: 700; color: var(--text-primary);">${p.totalPoints} PTS</span>
                        <span style="font-size: var(--text-xs); color: var(--text-muted);">${p.gap}</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : ''}

            <!-- Overall Championship Table -->
            <div class="table-responsive">
              <table class="official-table" role="table" aria-label="Overall leaderboard till session">
                <thead>
                  <tr>
                    <th style="width: 70px;">Rank</th>
                    <th>Player</th>
                    <th style="text-align: right;">Cumulative Accuracy</th>
                    <th style="text-align: right;">Cumulative Bonus</th>
                    <th style="text-align: right;">This Event</th>
                    <th style="text-align: right;">Cumulative Total</th>
                    <th style="text-align: right;">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  ${overallStandings.map((p) => {
                    const isMe = p.userId === currentUid;
                    return `
                      <tr style="${isMe ? 'background: rgba(232, 0, 45, 0.06); font-weight: 600;' : ''}">
                        <td>
                          <span class="badge ${p.rank === 1 ? 'badge-primary' : 'badge-surface'}" style="font-weight: 700;">
                            #${p.rank}
                          </span>
                        </td>
                        <td style="font-weight: 600; color: ${isMe ? 'var(--accent)' : 'var(--text-primary)'};">
                          ${escapeHTML(p.displayName)}
                          ${isMe ? ' <span style="font-size: var(--text-xs); color: var(--text-muted);">(You)</span>' : ''}
                        </td>
                        <td style="text-align: right; color: var(--text-secondary);">${p.accuracyPoints}</td>
                        <td style="text-align: right; color: var(--text-secondary);">${p.bonusPoints}</td>
                        <td style="text-align: right; color: var(--accent); font-weight: 600;">+${p.currentSessionPoints}</td>
                        <td style="text-align: right;">
                          <span class="text-data" style="font-weight: 800; font-size: var(--text-base); color: var(--text-primary);">
                            ${p.totalPoints}
                          </span>
                        </td>
                        <td style="text-align: right; color: var(--text-muted); font-size: var(--text-sm);">${p.gap}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;

        document.getElementById('btn-export-overall-direct')?.addEventListener('click', () => {
          exportSessionToExcel(raceId, session);
        });
      });
      return;
    }
  }

  // Initial render of default view
  renderView();

  // View toggle handlers
  page.querySelectorAll('#results-view-mode .toggle-option').forEach(btn => {
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      renderView();
    });
  });

  // Back button
  document.getElementById('btn-back-results')?.addEventListener('click', () => {
    navigateTo('races');
  });

  // Edit Results button (Admin)
  document.getElementById('btn-edit-results-breakdown')?.addEventListener('click', () => {
    renderResults(raceId, session, true);
  });

  // Export Results button (For all users and admin)
  document.getElementById('btn-export-results-breakdown')?.addEventListener('click', () => {
    exportSessionToExcel(raceId, session);
  });

  // Session tabs click handler
  page.querySelectorAll('.session-tab[data-session]').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetSession = tab.dataset.session;
      if (targetSession === session) return;
      navigateTo('results', raceId, targetSession);
    });
  });

  // Grand Prix Weekend dropdown change handler
  document.getElementById('results-race-select')?.addEventListener('change', (e) => {
    const targetRaceId = e.target.value;
    if (targetRaceId === raceId) return;
    const targetRace = allRaces.find(r => r.id === targetRaceId);
    const targetSessions = targetRace ? (SESSION_KEYS[targetRace.weekendType] || SESSION_KEYS.standard) : ['race'];
    const targetSession = targetSessions.includes(session) ? session : targetSessions[targetSessions.length - 1];
    navigateTo('results', targetRaceId, targetSession);
  });

  // Prev GP button
  document.getElementById('btn-prev-gp')?.addEventListener('click', () => {
    if (!prevRace) return;
    const targetSessions = SESSION_KEYS[prevRace.weekendType] || SESSION_KEYS.standard;
    const targetSession = targetSessions.includes(session) ? session : targetSessions[targetSessions.length - 1];
    navigateTo('results', prevRace.id, targetSession);
  });

  // Next GP button
  document.getElementById('btn-next-gp')?.addEventListener('click', () => {
    if (!nextRace) return;
    const targetSessions = SESSION_KEYS[nextRace.weekendType] || SESSION_KEYS.standard;
    const targetSession = targetSessions.includes(session) ? session : targetSessions[targetSessions.length - 1];
    navigateTo('results', nextRace.id, targetSession);
  });
}

/**
 * Load and display results breakdown for a race session
 * @param {string} raceId 
 * @param {string} session 
 */
async function renderResultsBreakdown(raceId, session) {
  const page = document.getElementById('results-page');
  if (!page) return;

  page.innerHTML = `
    <div class="spinner-overlay">
      <div class="spinner-lg"></div>
      <span class="spinner-text">Loading session results...</span>
    </div>
  `;

  try {
    const existingResult = await getDocument('results', `${raceId}_${session}`);
    const officialOrder = existingResult?.order || [];

    // Get predictions
    const predictions = await queryCollection('predictions', [
      ['raceId', '==', raceId],
      ['session', '==', session]
    ]);

    const playerScores = [];
    for (const pred of predictions) {
      if (!pred.order || pred.order.length === 0) continue;

      if (officialOrder.length === 22) {
        const scoreDoc = await getDocument('scores', `${pred.userId}_${raceId}_${session}`);
        if (scoreDoc && scoreDoc.totalPoints !== undefined) {
          playerScores.push(scoreDoc);
        } else {
          const result = calculateSessionScore(pred.order, officialOrder, session);
          playerScores.push({
            userId: pred.userId,
            predictionId: pred.id,
            ...result
          });
        }
      } else {
        // Pending official result
        playerScores.push({
          userId: pred.userId,
          predictionId: pred.id,
          order: pred.order,
          lockedAt: pred.lockedAt,
          totalPoints: 0,
          accuracyPoints: 0,
          bonusPoints: 0,
          driverScores: pred.order.map((d, i) => ({
            driverId: d,
            predictedPos: i + 1,
            actualPos: '-',
            diff: '-',
            points: 0
          }))
        });
      }
    }

    await showResultsBreakdown(page, playerScores, officialOrder, raceId, session);
  } catch (err) {
    console.error('[Results] Error showing breakdown:', err);
    showToast('Failed to load score breakdown', 'error');
    navigateTo('races');
  }
}

// --- Exports ---
export {
  renderResults,
  processResults,
  renderResultsBreakdown
};
