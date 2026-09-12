// ============================================
// F1 PREDICTION LEAGUE — RESULTS
// Admin results entry · Score calculation trigger
// ============================================

import {
  auth,
  isAdmin,
  getDocument,
  setDocument,
  updateDocument,
  queryCollection,
  getAllDocuments,
  createBatch,
  getDocRef,
  serverTimestamp
} from './firebase.js';
import { SESSION_KEYS, SESSION_FULL_LABELS, getDriverById } from './seed.js';
import { getDriver, getTeamColor, renderEmptyStateSVG } from './drivers.js';
import { calculateSessionScore, isRaceType, sortByActualPosition } from './scoring.js';
import { renderPredictionBuilder } from './predictions.js';
import { showToast, navigateTo } from './ui.js';

/**
 * Render the results entry page (admin only)
 * Delegates to prediction builder in results mode
 * @param {string} raceId 
 * @param {string} sessionKey 
 * @param {boolean} editOverride - whether to force edit mode
 */
async function renderResults(raceId, sessionKey, editOverride = false) {
  // Admin guard
  if (!isAdmin()) {
    navigateTo('leaderboard');
    return;
  }

  // Use the prediction builder in results mode directly with editOverride
  await renderPredictionBuilder(raceId, sessionKey, true, editOverride);
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
  
  // Show calculating spinner
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
      
      // Check if every non-voided session has confirmed results
      let allDone = true;
      for (const s of nonVoidedSessions) {
        if (s === session) continue; // This session is being saved right now
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
      await renderPredictionBuilder(raceId, session, true, false);
      return;
    }

    // 3. Calculate scores for each player
    const sessionType = session; // 'race', 'sprint', 'quali', 'sprint_quali'
    const playerScores = [];

    for (const pred of predictions) {
      if (!pred.order || pred.order.length !== 22) continue;

      const result = calculateSessionScore(pred.order, officialOrder, sessionType);
      playerScores.push({
        userId: pred.userId,
        predictionId: pred.id,
        ...result
      });
    }

    // 4. Batch update user scores and save per-prediction scores
    for (const ps of playerScores) {
      // Calculate delta to avoid double counting if results are edited
      const oldScoreDoc = await getDocument('scores', `${ps.userId}_${raceId}_${session}`);
      let delta = ps.totalPoints;
      if (oldScoreDoc && oldScoreDoc.totalPoints !== undefined) {
        delta = ps.totalPoints - oldScoreDoc.totalPoints;
      }

      // Get current user data
      const userData = await getDocument('users', ps.userId);
      if (!userData) continue;

      const newSeasonPoints = (userData.seasonPoints || 0) + delta;
      const userRef = getDocRef('users', ps.userId);
      batch.update(userRef, {
        seasonPoints: newSeasonPoints,
        lastEventScore: ps.totalPoints
      });

      // Save the detailed score for this prediction
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
 * Display the score breakdown after calculation or on request
 * @param {HTMLElement} page 
 * @param {Array} playerScores 
 * @param {Array} officialOrder 
 * @param {string} raceId
 * @param {string} session 
 */
async function showResultsBreakdown(page, playerScores, officialOrder, raceId, session) {
  if (!page) return;

  // Load race data for session tabs
  const raceDoc = await getDocument('races', raceId);
  const sessions = raceDoc ? (SESSION_KEYS[raceDoc.weekendType] || SESSION_KEYS.standard) : [session];
  const cancelledSessions = raceDoc?.cancelledSessions || {};

  // Check confirmed results status for all sessions
  const sessionResultsStatus = {};
  for (const s of sessions) {
    try {
      const resDoc = await getDocument('results', `${raceId}_${s}`);
      if (resDoc?.calculatedAt) {
        sessionResultsStatus[s] = true;
      }
    } catch (e) {}
  }

  // Get user names
  const users = await getAllDocuments('users');
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u; });

  // Sort players by total points descending
  playerScores.sort((a, b) => b.totalPoints - a.totalPoints);

  const sessionLabel = SESSION_FULL_LABELS[session] || session;

  page.innerHTML = `
    <div class="page-header" style="margin-bottom: var(--space-4);">
      <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
        <button class="btn btn-ghost btn-sm" id="btn-back-results">← Back to Races</button>
        <button class="btn btn-secondary btn-sm" id="btn-view-order-breakdown">📋 Finishing Order</button>
        <h1 class="page-title text-display" style="margin-bottom: 0; font-size: var(--text-xl);">${sessionLabel} — Results</h1>
        <span class="badge" style="background: var(--status-completed); color: white; border: none;">CONFIRMED</span>
        <button class="btn btn-secondary btn-sm" id="btn-edit-results-breakdown" style="margin-left: auto;">✏️ Edit Results</button>
      </div>
      <p class="page-subtitle">${playerScores.length} players scored</p>
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

    <div class="result-grid" id="results-grid">
      ${playerScores.length === 0 ? `
        <div class="empty-state" style="grid-column: 1 / -1; padding: var(--space-8) var(--space-4);">
          ${renderEmptyStateSVG()}
          <h3 class="empty-state-title">No predictions scored</h3>
          <p class="empty-state-text">No players entered predictions for this session.</p>
        </div>
      ` : playerScores.map((ps, index) => {
        const user = userMap[ps.userId];
        const userName = user?.displayName || 'Unknown Player';
        const sortedScores = sortByActualPosition(ps.driverScores || []);

        return `
          <div class="result-player-card animate-card-enter stagger-${(index % 6) + 1}">
            <div class="result-player-header">
              <div>
                <span class="text-body-sm text-muted">#${index + 1}</span>
                <span class="result-player-name">${userName}</span>
              </div>
              <span class="result-player-score animate-count-up">${ps.totalPoints}</span>
            </div>
            <div style="padding: 0; max-height: 400px; overflow-y: auto;">
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
                        <td style="color: ${diffColor};">${ds.diff === 0 ? '✓' : ds.diff}</td>
                        <td style="color: ${ds.points > 0 ? 'var(--accent)' : 'var(--text-muted)'};">${ds.points}</td>
                      </tr>
                    `;
                  }).join('')}
                  ${(ps.bonuses || []).filter(b => b.earned).map(b => `
                    <tr class="bonus-row">
                      <td colspan="4">${b.label}</td>
                      <td>+${b.points}</td>
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

  // Back button
  document.getElementById('btn-back-results')?.addEventListener('click', () => {
    navigateTo('races');
  });

  // View Finishing Order button
  document.getElementById('btn-view-order-breakdown')?.addEventListener('click', () => {
    renderResults(raceId, session, false);
  });

  // Edit Results button
  document.getElementById('btn-edit-results-breakdown')?.addEventListener('click', () => {
    renderResults(raceId, session, true);
  });

  // Session tabs
  page.querySelectorAll('.session-tab[data-session]').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetSession = tab.dataset.session;
      if (targetSession === session) return;
      navigateTo('results', raceId, targetSession);
    });
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
      <span class="spinner-text">Loading scores...</span>
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
      if (!pred.order || pred.order.length !== 22) continue;
      const scoreDoc = await getDocument('scores', `${pred.userId}_${raceId}_${session}`);
      if (scoreDoc) {
        playerScores.push(scoreDoc);
      } else {
        const result = calculateSessionScore(pred.order, officialOrder, session);
        playerScores.push({
          userId: pred.userId,
          predictionId: pred.id,
          ...result
        });
      }
    }

    await showResultsBreakdown(page, playerScores, officialOrder, raceId, session);
  } catch (err) {
    console.error('[Results] Error showing breakdown:', err);
    showToast('Failed to load score breakdown', 'error');
    renderResults(raceId, session, false);
  }
}

// --- Exports ---
export {
  renderResults,
  processResults,
  renderResultsBreakdown
};
