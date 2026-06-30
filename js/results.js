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
import { SESSION_FULL_LABELS, getDriverById } from './seed.js';
import { getDriver, getTeamColor, renderEmptyStateSVG } from './drivers.js';
import { calculateSessionScore, isRaceType, sortByActualPosition } from './scoring.js';
import { renderPredictionBuilder } from './predictions.js';
import { showToast, navigateTo } from './ui.js';

/**
 * Render the results entry page (admin only)
 * Delegates to prediction builder in results mode
 * @param {string} raceId 
 * @param {string} sessionKey 
 */
async function renderResults(raceId, sessionKey) {
  // Admin guard
  if (!isAdmin()) {
    navigateTo('leaderboard');
    return;
  }

  // Use the prediction builder in results mode
  await renderPredictionBuilder(raceId, sessionKey, true);
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
    const existingContent = page.innerHTML;
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

    if (predictions.length === 0) {
      showToast('No predictions found for this session', 'warning');
      navigateTo('races');
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
    const batch = createBatch();

    for (const ps of playerScores) {
      // Get current user data
      const userData = await getDocument('users', ps.userId);
      if (!userData) continue;

      const newSeasonPoints = (userData.seasonPoints || 0) + ps.totalPoints;
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

    // Auto-complete the race if the main race session is processed
    if (session === 'race') {
      const raceRef = getDocRef('races', raceId);
      batch.update(raceRef, { status: 'completed' });
    }

    await batch.commit();

    // 5. Show results breakdown
    showResultsBreakdown(page, playerScores, officialOrder, session);

    showToast(`Scores calculated for ${SESSION_FULL_LABELS[session] || session}!`, 'success');

  } catch (error) {
    console.error('[Results] Error processing results:', error);
    showToast('Failed to calculate scores: ' + error.message, 'error');
    navigateTo('races');
  }
}

/**
 * Display the score breakdown after calculation
 * @param {HTMLElement} page 
 * @param {Array} playerScores 
 * @param {Array} officialOrder 
 * @param {string} session 
 */
async function showResultsBreakdown(page, playerScores, officialOrder, session) {
  if (!page) return;

  // Get user names
  const users = await getAllDocuments('users');
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u; });

  // Sort players by total points descending
  playerScores.sort((a, b) => b.totalPoints - a.totalPoints);

  const sessionLabel = SESSION_FULL_LABELS[session] || session;

  page.innerHTML = `
    <div class="page-header">
      <div style="display: flex; align-items: center; gap: var(--space-3);">
        <button class="btn btn-ghost btn-sm" id="btn-back-results">← Back to Races</button>
        <h1 class="page-title text-display" style="margin-bottom: 0; font-size: var(--text-xl);">${sessionLabel} — Results</h1>
      </div>
      <p class="page-subtitle">${playerScores.length} players scored</p>
    </div>

    <div class="result-grid" id="results-grid">
      ${playerScores.map((ps, index) => {
        const user = userMap[ps.userId];
        const userName = user?.displayName || 'Unknown Player';
        const sortedScores = sortByActualPosition(ps.driverScores);

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
                  ${ps.bonuses.filter(b => b.earned).map(b => `
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
}

// --- Exports ---
export {
  renderResults,
  processResults
};
