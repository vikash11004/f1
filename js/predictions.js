// ============================================
// F1 PREDICTION LEAGUE — PREDICTIONS
// Session tabs · Two-panel UI · Tap/Drag · Auto-save
// ============================================

import {
  auth,
  isAdmin,
  getDocument,
  setDocument,
  getAllDocuments,
  queryCollection,
  serverTimestamp
} from './firebase.js';
import {
  DRIVERS_2026,
  SESSION_KEYS,
  SESSION_LABELS,
  SESSION_FULL_LABELS,
  getTeamById
} from './seed.js';
import {
  getTeamColor,
  getDriver,
  getAllDriversSorted,
  getDriverInitials,
  renderDriverCard,
  renderEmptySlot,
  renderEmptyStateSVG,
  renderDriverSkeletons
} from './drivers.js';
import {
  navigateTo,
  showToast,
  showModal,
  openSidePanel,
  debounce,
  formatRound
} from './ui.js';

// --- State ---
let currentRace = null;
let currentSession = null;
let orderedDrivers = [];     // Array of driverIds in predicted order (length 0-22)
let poolDrivers = [];        // Array of driverIds still in the pool
let isLocked = false;
let isReadOnly = false;
let selectedPoolDriver = null; // For mobile tap-to-select
let saveTimeout = null;
let isResultsMode = false;    // true when admin is entering results
let hasCalculatedResults = false;
let officialResultOrder = null;
let userSessionScoreData = null;

/**
 * Get the current page container based on mode
 */
function getPage() {
  return document.getElementById(isResultsMode ? 'results-page' : 'predict-page');
}

/**
 * Render the prediction builder (also used by results entry)
 * @param {string} raceId 
 * @param {string} sessionKey 
 * @param {boolean} resultsMode - true if admin results entry
 */
async function renderPredictionBuilder(raceId, sessionKey, resultsMode = false) {
  const page = resultsMode
    ? document.getElementById('results-page')
    : document.getElementById('predict-page');
  if (!page) return;

  isResultsMode = resultsMode;

  // Show loading
  page.innerHTML = `
    <div class="spinner-overlay">
      <div class="spinner-lg"></div>
      <span class="spinner-text">Loading prediction builder...</span>
    </div>
  `;

  try {
    // Load race data
    currentRace = await getDocument('races', raceId);
    if (!currentRace) {
      page.innerHTML = `
        <div class="empty-state">
          ${renderEmptyStateSVG()}
          <h3 class="empty-state-title">Race not found</h3>
          <button class="btn btn-secondary" onclick="window.location.hash='#races'">Back to Races</button>
        </div>
      `;
      return;
    }

    const sessions = SESSION_KEYS[currentRace.weekendType] || SESSION_KEYS.standard;
    currentSession = sessions.includes(sessionKey) ? sessionKey : sessions[0];

    // Determine lock state
    isLocked = false;
    isReadOnly = false;
    hasCalculatedResults = false;

    if (!resultsMode) {
      if (currentRace.status === 'completed') {
        isReadOnly = true;
      } else if (currentRace.status === 'locked') {
        isReadOnly = true;
        isLocked = true;
      }
    }

    let playerHasLocked = false;
    // Load existing prediction or result
    let existingOrder = [];
    if (resultsMode) {
      const existingResult = await getDocument('results', `${raceId}_${currentSession}`);
      if (existingResult?.order) {
        existingOrder = existingResult.order;
      }
      if (existingResult?.calculatedAt) {
        hasCalculatedResults = true;
        isReadOnly = true;
      }
    } else {
      const predId = `${auth.currentUser.uid}_${raceId}_${currentSession}`;
      const existingPred = await getDocument('predictions', predId);
      if (existingPred?.order) {
        existingOrder = existingPred.order;
        if (existingPred.lockedAt) {
          isLocked = true;
          isReadOnly = true;
          playerHasLocked = true;
        }
      }

      // Check if official results exist
      if (isLocked || currentRace.status === 'completed') {
        try {
          const existingResult = await getDocument('results', `${raceId}_${currentSession}`);
          if (existingResult?.order && existingResult?.calculatedAt) {
            hasCalculatedResults = true;
            officialResultOrder = existingResult.order;
            userSessionScoreData = await getDocument('scores', `${auth.currentUser.uid}_${raceId}_${currentSession}`);
          }
        } catch (e) {
          console.warn('[Predictions] Could not check official results:', e);
        }
      }
    }

    // Initialize order and pool
    const allDriverIds = DRIVERS_2026.map(d => d.id);
    orderedDrivers = existingOrder.filter(id => allDriverIds.includes(id));
    poolDrivers = allDriverIds.filter(id => !orderedDrivers.includes(id));

    // Load session scores if completed
    let sessionScores = {};
    if (currentRace.status === 'completed' || isLocked) {
      for (const s of sessions) {
        try {
          const scoreDoc = await getDocument('scores', `${auth.currentUser.uid}_${raceId}_${s}`);
          if (scoreDoc?.totalPoints !== undefined) {
            sessionScores[s] = scoreDoc.totalPoints;
          }
        } catch (e) {
          console.warn(`[Predictions] Could not load score for session ${s}:`, e);
        }
      }
    }

    // Render the page
    renderBuilderUI(page, sessions, sessionScores);

  } catch (error) {
    console.error('[Predictions] Error:', error);
    page.innerHTML = `
      <div class="empty-state">
        ${renderEmptyStateSVG()}
        <h3 class="empty-state-title">Failed to load predictions</h3>
        <p class="empty-state-text">${error.message}</p>
        <button class="btn btn-secondary" onclick="window.location.hash='#dashboard'">Back to Dashboard</button>
      </div>
    `;
  }
}

/**
 * Render the builder UI
 */
function renderBuilderUI(page, sessions, sessionScores) {
  const sprintBadge = currentRace.weekendType === 'sprint'
    ? `<span class="badge badge-sprint">SPRINT WEEKEND</span>`
    : '';

  page.innerHTML = `
    <div class="page-header" style="margin-bottom: var(--space-4);">
      <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
        <button class="btn btn-ghost btn-sm" id="btn-back-predict" aria-label="Back">← Back</button>
        <span class="badge-round text-display">${formatRound(currentRace.round)}</span>
        <h1 class="page-title text-display" style="margin-bottom: 0; font-size: var(--text-xl);">${currentRace.name}</h1>
        ${sprintBadge}
        ${isResultsMode 
          ? (hasCalculatedResults 
              ? '<span class="badge" style="background: var(--status-completed); color: white; border: none;">RESULTS CONFIRMED</span>' 
              : '<span class="badge badge-active">ADMIN: RESULTS ENTRY</span>') 
          : (userSessionScoreData ? `
              <span class="badge" style="background: var(--accent); color: white; border: none;">SCORE: ${userSessionScoreData.totalPoints} PTS</span>
              <button class="btn btn-ghost btn-sm" id="btn-export-xlsx" style="margin-left: var(--space-2);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: text-bottom;">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="8" y1="13" x2="16" y2="13"></line>
                  <line x1="8" y1="17" x2="16" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Export Excel
              </button>
            ` : '')}
        ${(playerHasLocked && !isResultsMode) ? `
          <button class="btn btn-secondary btn-sm" id="btn-view-others" style="margin-left: var(--space-2);">
            👀 View Others
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Session Tabs -->
    <div class="session-tabs" id="session-tabs" role="tablist">
      ${sessions.map(s => {
        const isActive = s === currentSession;
        const scoreStr = sessionScores[s] !== undefined ? `${sessionScores[s]} pts` : '';
        const lockIcon = isLocked && s === currentSession ? '🔒' : '';
        return `
          <button class="session-tab ${isActive ? 'active' : ''}" 
                  data-session="${s}" 
                  role="tab" 
                  aria-selected="${isActive}"
                  aria-label="${SESSION_FULL_LABELS[s]}">
            ${SESSION_LABELS[s]}
            ${scoreStr ? `<span class="tab-score">${scoreStr}</span>` : ''}
            ${lockIcon ? `<span class="tab-lock">${lockIcon}</span>` : ''}
          </button>
        `;
      }).join('')}
    </div>

    <!-- Save Indicator -->
    <div style="display: flex; justify-content: flex-end; padding: var(--space-2) 0;">
      <span class="save-indicator" id="save-indicator"></span>
    </div>

    <!-- Two-Panel Layout -->
    <div class="prediction-layout">
      <!-- Order List (Left) -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">${isResultsMode ? 'Official Order' : 'Your Prediction'}</span>
          <span class="panel-count text-data" id="filled-count">${orderedDrivers.length}/22</span>
        </div>
        <div class="order-list" id="order-list" role="list">
          ${renderOrderList()}
        </div>
      </div>

      <!-- Right Panel: Official Result or Driver Pool -->
      ${(!isResultsMode && hasCalculatedResults) ? `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Official Result</span>
          <span class="panel-count text-data">22/22</span>
        </div>
        <div class="order-list" role="list">
          ${renderOfficialOrderList()}
        </div>
      </div>
      ` : `
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">Driver Pool</span>
          <span class="panel-count text-data" id="pool-count">${poolDrivers.length} available</span>
        </div>
        <div class="driver-pool" id="driver-pool" role="list">
          ${renderPool()}
        </div>
      </div>
      `}
    </div>

    <!-- Confirm Bar -->
    <div class="confirm-bar hidden" id="confirm-bar">
      <p class="confirm-bar-message" id="confirm-message"></p>
      <div class="confirm-bar-actions">
        <button class="btn btn-secondary" id="btn-review">Review</button>
        <button class="btn btn-primary" id="btn-confirm"></button>
      </div>
    </div>
  `;

  // --- Bind Events ---
  bindTabEvents(sessions);
  bindPoolEvents();
  bindOrderEvents();
  bindConfirmEvents();

  // Back button
  getPage().querySelector('#btn-back-predict')?.addEventListener('click', () => {
    navigateTo(isResultsMode ? 'races' : 'dashboard');
  });

  // Export XLSX
  getPage().querySelector('#btn-export-xlsx')?.addEventListener('click', handleExportXLSX);

  // View Others' Predictions
  getPage().querySelector('#btn-view-others')?.addEventListener('click', fetchAndShowOthersPredictions);

  // Show confirm bar if all filled
  updateConfirmBar();
}

/**
 * Fetch and Show Others' Predictions
 */
async function fetchAndShowOthersPredictions() {
  openSidePanel(`
    <div class="panel-header" style="margin-bottom: var(--space-3);">
      <h2 class="text-lg">Other Players' Predictions</h2>
      <button class="btn btn-icon btn-ghost" onclick="document.getElementById('side-panel-overlay').click()">✕</button>
    </div>
    <div class="skeleton-row" style="margin-bottom: 8px;"></div>
    <div class="skeleton-row" style="margin-bottom: 8px;"></div>
    <div class="skeleton-row"></div>
  `);

  try {
    const allPredictions = await queryCollection('predictions', [
      ['raceId', '==', currentRace.id],
      ['session', '==', currentSession]
    ]);

    // Filter for locked predictions, excluding the current user
    const lockedPredictions = allPredictions.filter(p => p.lockedAt && p.userId !== auth.currentUser.uid);

    if (lockedPredictions.length === 0) {
      document.getElementById('side-panel').innerHTML = `
        <div class="panel-header" style="margin-bottom: var(--space-3);">
          <h2 class="text-lg">Other Players' Predictions</h2>
          <button class="btn btn-icon btn-ghost" onclick="document.getElementById('side-panel-overlay').click()">✕</button>
        </div>
        <div class="empty-state">
          <div style="font-size: 3rem; margin-bottom: 1rem;">👀</div>
          <h3>No locked predictions yet</h3>
          <p class="text-muted">You are the first to lock in your prediction!</p>
        </div>
      `;
      return;
    }

    // Get user details
    const users = await getAllDocuments('users');
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });

    let html = `
      <div class="panel-header" style="margin-bottom: var(--space-3); position: sticky; top: 0; background: var(--bg-elevated); z-index: 10; padding-bottom: 10px; border-bottom: 1px solid var(--border);">
        <h2 class="text-lg">Other Players' Predictions</h2>
        <button class="btn btn-icon btn-ghost" onclick="document.getElementById('side-panel-overlay').click()">✕</button>
      </div>
      <div style="display: flex; flex-direction: column; gap: var(--space-4);">
    `;

    lockedPredictions.forEach(pred => {
      const user = userMap[pred.userId];
      const userName = user?.displayName || 'Unknown Player';

      html += `
        <div class="prediction-card" style="background: var(--bg-base); padding: var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border);">
          <h3 class="text-md" style="margin-bottom: var(--space-3); color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
            <div class="avatar" style="width: 24px; height: 24px; background: var(--accent); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">
              ${userName.charAt(0).toUpperCase()}
            </div>
            ${userName}
          </h3>
          <table class="score-breakdown">
            <thead>
              <tr>
                <th style="width: 60px;">Pos</th>
                <th>Driver</th>
              </tr>
            </thead>
            <tbody>
              ${pred.order.map((driverId, idx) => {
                const driver = getDriver(driverId);
                if (!driver) return '';
                const teamColor = getTeamColor(driver.team);
                return `
                  <tr>
                    <td style="color: var(--text-muted); font-weight: bold;">P${idx + 1}</td>
                    <td>
                      <span style="display: inline-block; width: 3px; height: 12px; background: ${teamColor}; border-radius: 2px; margin-right: 6px; vertical-align: middle;"></span>
                      ${driver.code} - ${driver.name}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    });

    html += `</div>`;
    document.getElementById('side-panel').innerHTML = html;

  } catch (error) {
    console.error('Error fetching others predictions:', error);
    showToast('Failed to load predictions', 'error');
  }
}

/**
 * Handle Excel Export (XLSX)
 */
function handleExportXLSX() {
  if (!officialResultOrder || !userSessionScoreData || !orderedDrivers) return;
  if (!window.XLSX) {
    showToast("Excel export library is loading, please try again in a moment.", "warning");
    return;
  }

  const rows = [
    ["Formula 1 Prediction League — Session Results Export"],
    [`Race: ${currentRace.name}`],
    [`Session: ${SESSION_FULL_LABELS[currentSession]}`],
    [],
    ["Position", "Your Prediction", "Official Result", "Difference", "Points Earned"]
  ];

  for (let i = 0; i < 22; i++) {
    const pos = i + 1;
    const predDriverId = orderedDrivers[i];
    const actualDriverId = officialResultOrder[i];
    
    const predDriver = getDriver(predDriverId);
    const actualDriver = getDriver(actualDriverId);
    
    const predName = predDriver ? `${predDriver.code} - ${predDriver.name}` : "-";
    const actualName = actualDriver ? `${actualDriver.code} - ${actualDriver.name}` : "-";

    const scoreObj = userSessionScoreData.driverScores?.find(ds => ds.driverId === predDriverId);
    const diff = scoreObj ? scoreObj.diff : "-";
    const points = scoreObj ? scoreObj.points : 0;

    rows.push([pos, predName, actualName, diff, points]);
  }

  rows.push([]);
  rows.push(["", "", "Accuracy Points", userSessionScoreData.accuracyPoints, ""]);
  rows.push(["", "", "Bonus Points", userSessionScoreData.bonusPoints, ""]);
  rows.push(["", "", "TOTAL SCORE", userSessionScoreData.totalPoints, ""]);

  const worksheet = window.XLSX.utils.aoa_to_sheet(rows);
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, "Results");

  // Format column widths for neatness
  worksheet['!cols'] = [
    { wch: 10 }, // Position
    { wch: 28 }, // Your Prediction
    { wch: 28 }, // Official Result
    { wch: 12 }, // Difference
    { wch: 15 }  // Points
  ];

  const filename = `${currentRace.name.replace(/\\s+/g, '_')}_${SESSION_LABELS[currentSession]}_Results.xlsx`;
  window.XLSX.writeFile(workbook, filename);
}

/**
 * Render the order list HTML
 */
function renderOrderList() {
  let html = '';
  for (let i = 0; i < 22; i++) {
    const position = i + 1;
    if (i < orderedDrivers.length) {
      const driver = getDriver(orderedDrivers[i]);
      if (driver) {
        const teamColor = getTeamColor(driver.team);
        const initials = getDriverInitials(driver.name);
        html += `
          <div class="order-slot filled ${isReadOnly ? '' : 'draggable'}" 
               data-position="${position}" 
               data-driver-id="${driver.id}"
               ${!isReadOnly ? 'draggable="true"' : ''}
               tabindex="0"
               role="listitem"
               aria-label="Position ${position}, ${driver.name}">
            <div class="driver-card-color-bar" style="background-color: ${teamColor}"></div>
            <span class="order-slot-position ${position <= 3 ? 'top3' : ''}">P${position}</span>
            <div class="driver-card-avatar" style="background-color: ${teamColor}20; color: ${teamColor}">${initials}</div>
            <div class="driver-card-number">${driver.number}</div>
            <div class="driver-card-info">
              <span class="driver-card-code">${driver.code}</span>
              <span class="driver-card-name">${driver.name}</span>
            </div>
          </div>
        `;
      }
    } else {
      html += `
        <div class="order-slot" data-position="${position}" tabindex="0" role="listitem" aria-label="Position ${position}, empty">
          <span class="order-slot-position ${position <= 3 ? 'top3' : ''}">P${position}</span>
          <span class="order-slot-placeholder">Tap a driver to fill P${position}</span>
        </div>
      `;
    }
  }
  return html;
}

/**
 * Render the official order list HTML (read-only)
 */
function renderOfficialOrderList() {
  if (!officialResultOrder) return '';
  let html = '';
  for (let i = 0; i < 22; i++) {
    const position = i + 1;
    if (i < officialResultOrder.length) {
      const driver = getDriver(officialResultOrder[i]);
      if (driver) {
        const teamColor = getTeamColor(driver.team);
        const initials = getDriverInitials(driver.name);
        html += `
          <div class="order-slot filled" 
               data-position="${position}" 
               tabindex="0"
               role="listitem"
               aria-label="Position ${position}, ${driver.name}">
            <div class="driver-card-color-bar" style="background-color: ${teamColor}"></div>
            <span class="order-slot-position ${position <= 3 ? 'top3' : ''}">P${position}</span>
            <div class="driver-card-avatar" style="background-color: ${teamColor}20; color: ${teamColor}">${initials}</div>
            <div class="driver-card-number">${driver.number}</div>
            <div class="driver-card-info">
              <span class="driver-card-code">${driver.code}</span>
              <span class="driver-card-name">${driver.name}</span>
            </div>
          </div>
        `;
      }
    }
  }
  return html;
}

/**
 * Render the pool HTML
 */
function renderPool() {
  if (poolDrivers.length === 0 && orderedDrivers.length === 22) {
    return `<p class="text-body-sm text-muted" style="padding: var(--space-4); text-align: center;">All drivers placed ✓</p>`;
  }

  return poolDrivers.map(driverId => {
    const driver = getDriver(driverId);
    if (!driver) return '';
    return renderDriverCard(driver, { showTeam: true, extraClass: isReadOnly ? 'readonly' : '' });
  }).join('');
}

/**
 * Bind session tab click events
 */
function bindTabEvents(sessions) {
  getPage().querySelectorAll('.session-tab[data-session]').forEach(tab => {
    tab.addEventListener('click', () => {
      const session = tab.dataset.session;
      if (session === currentSession) return;
      
      // Navigate to the new session tab
      const raceId = currentRace.id;
      const route = isResultsMode ? 'results' : 'predict';
      navigateTo(route, raceId, session);
    });
  });
}

/**
 * Bind pool driver click events (tap to place)
 */
function bindPoolEvents() {
  if (isReadOnly) return;

  const pool = getPage().querySelector('#driver-pool');
  if (!pool) return;

  pool.addEventListener('click', (e) => {
    const card = e.target.closest('.driver-card');
    if (!card) return;

    const driverId = card.dataset.driverId;
    if (!driverId) return;

    // Mobile: if already selected, deselect
    if (selectedPoolDriver === driverId) {
      card.classList.remove('selected');
      selectedPoolDriver = null;
      return;
    }

    // Place the driver at the next available slot
    placeDriver(driverId);
  });
}

/**
 * Bind order list events (tap to remove + drag to reorder)
 */
function bindOrderEvents() {
  if (isReadOnly) return;

  const orderList = getPage().querySelector('#order-list');
  if (!orderList) return;

  // Tap to remove
  orderList.addEventListener('click', (e) => {
    const slot = e.target.closest('.order-slot.filled');
    if (!slot) return;

    const driverId = slot.dataset.driverId;
    if (!driverId) return;

    removeDriver(driverId);
  });

  // Drag and drop
  let draggedDriverId = null;
  let draggedFromPosition = null;

  orderList.addEventListener('dragstart', (e) => {
    const slot = e.target.closest('.order-slot.filled');
    if (!slot) return;

    draggedDriverId = slot.dataset.driverId;
    draggedFromPosition = parseInt(slot.dataset.position) - 1;
    slot.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedDriverId);
  });

  orderList.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const slot = e.target.closest('.order-slot');
    if (!slot) return;

    // Clear previous drag-over styles
    orderList.querySelectorAll('.drag-over').forEach(s => s.classList.remove('drag-over'));
    slot.classList.add('drag-over');
  });

  orderList.addEventListener('dragleave', (e) => {
    const slot = e.target.closest('.order-slot');
    if (slot) slot.classList.remove('drag-over');
  });

  orderList.addEventListener('drop', (e) => {
    e.preventDefault();
    orderList.querySelectorAll('.drag-over').forEach(s => s.classList.remove('drag-over'));
    orderList.querySelectorAll('.dragging').forEach(s => s.classList.remove('dragging'));

    if (!draggedDriverId) return;

    const targetSlot = e.target.closest('.order-slot');
    if (!targetSlot) return;

    const targetPosition = parseInt(targetSlot.dataset.position) - 1;

    if (draggedFromPosition !== null && draggedFromPosition !== targetPosition && targetPosition < orderedDrivers.length) {
      // Reorder: remove from old position, insert at new
      const [moved] = orderedDrivers.splice(draggedFromPosition, 1);
      orderedDrivers.splice(targetPosition, 0, moved);
      refreshUI();
      triggerAutoSave();
    }

    draggedDriverId = null;
    draggedFromPosition = null;
  });

  orderList.addEventListener('dragend', () => {
    orderList.querySelectorAll('.dragging').forEach(s => s.classList.remove('dragging'));
    orderList.querySelectorAll('.drag-over').forEach(s => s.classList.remove('drag-over'));
    draggedDriverId = null;
    draggedFromPosition = null;
  });

  // Keyboard support
  orderList.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const slot = e.target.closest('.order-slot.filled');
      if (slot) {
        e.preventDefault();
        const driverId = slot.dataset.driverId;
        if (driverId) removeDriver(driverId);
      }
    }
  });
}

/**
 * Place a driver from pool to next empty slot
 * @param {string} driverId 
 */
function placeDriver(driverId) {
  if (orderedDrivers.length >= 22) return;
  if (orderedDrivers.includes(driverId)) return;

  // Remove from pool
  poolDrivers = poolDrivers.filter(id => id !== driverId);
  // Add to order
  orderedDrivers.push(driverId);

  refreshUI();
  triggerAutoSave();
}

/**
 * Remove a driver from order back to pool
 * @param {string} driverId 
 */
function removeDriver(driverId) {
  // Remove from order
  orderedDrivers = orderedDrivers.filter(id => id !== driverId);
  // Add back to pool (in original order)
  const allIds = DRIVERS_2026.map(d => d.id);
  poolDrivers.push(driverId);
  poolDrivers.sort((a, b) => allIds.indexOf(a) - allIds.indexOf(b));

  refreshUI();
  triggerAutoSave();
}

/**
 * Refresh the UI after state changes
 */
function refreshUI() {
  const page = getPage();
  if (!page) return;

  const orderList = page.querySelector('#order-list');
  const pool = page.querySelector('#driver-pool');
  const filledCount = page.querySelector('#filled-count');
  const poolCount = page.querySelector('#pool-count');

  if (orderList) orderList.innerHTML = renderOrderList();
  if (pool) pool.innerHTML = renderPool();
  if (filledCount) filledCount.textContent = `${orderedDrivers.length}/22`;
  if (poolCount) poolCount.textContent = `${poolDrivers.length} available`;

  updateConfirmBar();
}

/**
 * Trigger auto-save with 800ms debounce
 */
function triggerAutoSave() {
  const indicator = getPage().querySelector('#save-indicator');
  if (indicator) {
    indicator.className = 'save-indicator saving';
    indicator.textContent = 'Saving...';
  }

  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    performSave();
  }, 800);
}

/**
 * Save prediction to Firestore
 */
async function performSave() {
  const indicator = getPage().querySelector('#save-indicator');

  try {
    if (isResultsMode) {
      // Save as result (admin)
      await setDocument('results', `${currentRace.id}_${currentSession}`, {
        raceId: currentRace.id,
        session: currentSession,
        order: orderedDrivers,
        updatedAt: serverTimestamp()
      }, true);
    } else {
      // Save as prediction (player)
      const predId = `${auth.currentUser.uid}_${currentRace.id}_${currentSession}`;
      await setDocument('predictions', predId, {
        userId: auth.currentUser.uid,
        raceId: currentRace.id,
        session: currentSession,
        order: orderedDrivers,
        updatedAt: serverTimestamp()
      }, true);
    }

    if (indicator) {
      indicator.className = 'save-indicator saved animate-saved';
      indicator.textContent = '✓ Saved';
    }
  } catch (err) {
    console.error('[Predictions] Save failed:', err);
    if (indicator) {
      indicator.className = 'save-indicator failed';
      indicator.innerHTML = '⚠ Save failed — tap to retry';
      indicator.onclick = () => performSave();
    }
  }
}

/**
 * Show/hide the confirm bar based on state
 */
function updateConfirmBar() {
  const page = getPage();
  if (!page) return;

  const bar = page.querySelector('#confirm-bar');
  const message = page.querySelector('#confirm-message');
  const confirmBtn = page.querySelector('#btn-confirm');

  if (!bar || isReadOnly) {
    if (bar) bar.classList.add('hidden');
    return;
  }

  if (orderedDrivers.length === 22) {
    bar.classList.remove('hidden');

    if (isResultsMode) {
      message.textContent = "This will trigger score calculation for all players.";
      confirmBtn.textContent = "Confirm Results ✓";
    } else {
      message.textContent = "This is your final order for this session. You won't be able to change it.";
      confirmBtn.textContent = "Lock It ✓";
    }
  } else {
    bar.classList.add('hidden');
  }
}

/**
 * Bind confirm bar button events
 */
function bindConfirmEvents() {
  const page = getPage();
  page.querySelector('#btn-review')?.addEventListener('click', () => {
    // Scroll order list to top
    const orderList = page.querySelector('#order-list');
    if (orderList) orderList.scrollTop = 0;
  });

  page.querySelector('#btn-confirm')?.addEventListener('click', () => {
    if (isResultsMode) {
      handleConfirmResults();
    } else {
      handleLockPrediction();
    }
  });
}

/**
 * Handle player locking their prediction
 */
async function handleLockPrediction() {
  showModal({
    title: 'Lock Prediction?',
    message: "This is your final order for this session. You won't be able to change it.",
    confirmText: 'Lock It ✓',
    onConfirm: async () => {
      try {
        const predId = `${auth.currentUser.uid}_${currentRace.id}_${currentSession}`;
        await setDocument('predictions', predId, {
          userId: auth.currentUser.uid,
          raceId: currentRace.id,
          session: currentSession,
          order: orderedDrivers,
          lockedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, true);

        isLocked = true;
        isReadOnly = true;
        
        // Re-render entirely to show the "View Others" button in the header
        await renderPredictionBuilder(currentRace.id, currentSession, isResultsMode);

        // Update tab with lock icon
        const tab = getPage().querySelector(`.session-tab[data-session="${currentSession}"]`);
        if (tab && !tab.querySelector('.tab-lock')) {
          tab.innerHTML += ' <span class="tab-lock animate-lock">🔒</span>';
        }

        showToast('Prediction locked! Good luck 🏁', 'success');
      } catch (err) {
        showToast('Failed to lock prediction', 'error');
      }
    }
  });
}

/**
 * Handle admin confirming results (triggers score calculation)
 * This is called from within the prediction builder when in results mode.
 * The actual score calculation is done in results.js
 */
async function handleConfirmResults() {
  // Import results module dynamically to avoid circular deps
  const { processResults } = await import('./results.js');
  
  showModal({
    title: 'Confirm Results?',
    message: 'This will trigger score calculation for all players who made predictions for this session.',
    confirmText: 'Confirm Results ✓',
    onConfirm: async () => {
      await processResults(currentRace.id, currentSession, orderedDrivers);
    }
  });
}

/**
 * Clean up prediction builder state
 */
function cleanupPredictions() {
  clearTimeout(saveTimeout);
  currentRace = null;
  currentSession = null;
  orderedDrivers = [];
  poolDrivers = [];
  isLocked = false;
  isReadOnly = false;
  selectedPoolDriver = null;
  isResultsMode = false;
  hasCalculatedResults = false;
  officialResultOrder = null;
  userSessionScoreData = null;
}

// --- Exports ---
export {
  renderPredictionBuilder,
  cleanupPredictions
};
