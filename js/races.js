// ============================================
// F1 PREDICTION LEAGUE — RACES
// Race list · Side panel · CRUD · Status
// ============================================

import {
  auth,
  isAdmin,
  getAllDocuments,
  setDocument,
  updateDocument,
  deleteDocument,
  getDocument,
  serverTimestamp
} from './firebase.js';
import { SESSION_KEYS, SESSION_LABELS } from './seed.js';
import { createTelemetrySVG, renderEmptyStateSVG } from './drivers.js';
import {
  navigateTo,
  showToast,
  showModal,
  openSidePanel,
  closeSidePanel,
  rowSkeletonHTML,
  formatRound
} from './ui.js';

/**
 * Render the Race Management page
 */
async function renderRaces() {
  const page = document.getElementById('races-page');
  if (!page) return;

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title text-display">Race Calendar</h1>
      <p class="page-subtitle">2026 Formula 1 World Championship</p>
    </div>
    <div class="race-list" id="race-list">
      ${rowSkeletonHTML(22)}
    </div>
    ${isAdmin() ? `
      <div class="fab">
        <button class="btn btn-primary btn-lg" id="btn-new-race" aria-label="Add new race">
          + New Race
        </button>
      </div>
    ` : ''}
  `;

  try {
    const races = await getAllDocuments('races');
    races.sort((a, b) => a.round - b.round);
    renderRaceList(races);

    // FAB click handler
    document.getElementById('btn-new-race')?.addEventListener('click', () => {
      openNewRacePanel();
    });

  } catch (error) {
    console.error('[Races] Error:', error);
    document.getElementById('race-list').innerHTML = `
      <div class="empty-state">
        ${renderEmptyStateSVG()}
        <h3 class="empty-state-title">Failed to load races</h3>
        <p class="empty-state-text">${error.message}</p>
      </div>
    `;
  }
}

/**
 * Render the race list rows
 * @param {Array} races 
 */
function renderRaceList(races) {
  const container = document.getElementById('race-list');
  if (!container) return;

  if (races.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        ${renderEmptyStateSVG()}
        <h3 class="empty-state-title">No races found</h3>
        <p class="empty-state-text">The race calendar hasn't been set up yet.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = races.map((race, i) => {
    const sprintBadge = race.weekendType === 'sprint'
      ? `<span class="badge badge-sprint">SPRINT</span>`
      : `<span class="badge badge-standard">STANDARD</span>`;

    const statusBadge = getStatusBadge(race.status);

    return `
      <div class="card card-interactive animate-card-enter stagger-${(i % 6) + 1}" 
           data-race-id="${race.id}" 
           id="race-row-${race.id}">
        <div class="card-body" style="padding: var(--space-3) var(--space-5);">
          <div style="display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap;">
            <span class="badge-round text-display" style="min-width: 42px;">${formatRound(race.round)}</span>
            <span style="font-size: var(--text-lg);">${race.countryFlag}</span>
            <div style="flex: 1; min-width: 200px;">
              <h3 class="text-display-sm" style="font-size: var(--text-base); margin-bottom: 2px;">${race.name}</h3>
              <p class="text-body-sm text-muted">${race.circuit} · ${race.startDate || ''}</p>
            </div>
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              ${sprintBadge}
              ${statusBadge}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Click handlers for each race row
  container.querySelectorAll('[data-race-id]').forEach(row => {
    row.addEventListener('click', () => {
      const raceId = row.dataset.raceId;
      const race = races.find(r => r.id === raceId);
      if (race) openRacePanel(race);
    });
  });
}

/**
 * Get status badge HTML
 * @param {string} status 
 * @returns {string}
 */
function getStatusBadge(status) {
  const map = {
    upcoming: { class: 'badge-upcoming', label: 'UPCOMING' },
    active: { class: 'badge-active', label: 'ACTIVE' },
    locked: { class: 'badge-locked', label: 'LOCKED' },
    completed: { class: 'badge-completed', label: 'COMPLETED' }
  };
  const s = map[status] || map.upcoming;
  return `<span class="badge ${s.class}">${s.label}</span>`;
}

/**
 * Open the race detail/edit side panel
 * @param {Object} race 
 */
function openRacePanel(race) {
  const admin = isAdmin();
  const sessions = SESSION_KEYS[race.weekendType] || SESSION_KEYS.standard;

  // Status transitions (forward-only)
  const nextStatus = {
    upcoming: 'active',
    active: 'locked',
    locked: 'completed'
  };
  const nextLabel = {
    upcoming: 'Activate Predictions',
    active: 'Lock All Predictions',
    locked: 'Mark as Completed'
  };

  const html = `
    <div class="side-panel-header">
      <div>
        <h2 class="text-display-sm">${race.name}</h2>
        <p class="text-body-sm text-muted">${formatRound(race.round)} · ${race.circuit}</p>
      </div>
      <button class="btn btn-icon btn-ghost" id="close-panel" aria-label="Close panel">✕</button>
    </div>
    <div class="side-panel-body">
      <div style="margin-bottom: var(--space-6);">
        <span class="text-label">Status</span>
        <div style="margin-top: var(--space-2);">
          ${getStatusBadge(race.status)}
        </div>
      </div>

      <div style="margin-bottom: var(--space-6);">
        <span class="text-label">Details</span>
        <div style="margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-2);">
          <p class="text-body-sm">${race.countryFlag} ${race.country}</p>
          <p class="text-body-sm text-muted">${race.startDate || 'No dates set'}</p>
          <p class="text-body-sm text-muted">Race day: ${race.raceDate || 'TBD'}</p>
        </div>
      </div>

      <div style="margin-bottom: var(--space-6);">
        <span class="text-label">Weekend Type</span>
        <div style="margin-top: var(--space-2);">
          ${race.weekendType === 'sprint' 
            ? '<span class="badge badge-sprint">SPRINT WEEKEND</span>' 
            : '<span class="badge badge-standard">STANDARD</span>'}
        </div>
        ${admin && race.status === 'upcoming' ? `
          <div class="toggle-group" style="margin-top: var(--space-3);">
            <button class="toggle-option ${race.weekendType === 'standard' ? 'active' : ''}" data-type="standard">Standard</button>
            <button class="toggle-option ${race.weekendType === 'sprint' ? 'active' : ''}" data-type="sprint">Sprint</button>
          </div>
        ` : ''}
      </div>

      <div style="margin-bottom: var(--space-6);">
        <span class="text-label">Sessions</span>
        <div style="margin-top: var(--space-2); display: flex; gap: var(--space-2); flex-wrap: wrap;">
          ${sessions.map(s => `<span class="badge badge-upcoming">${SESSION_LABELS[s]}</span>`).join('')}
        </div>
      </div>

      ${admin && race.status !== 'completed' ? `
        <div style="margin-bottom: var(--space-6);">
          <span class="text-label">Actions</span>
          <div style="margin-top: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2);">
            ${nextStatus[race.status] ? `
              <button class="btn btn-primary" id="btn-status-transition">
                ${nextLabel[race.status]}
              </button>
            ` : ''}
            ${race.status === 'locked' || race.status === 'active' ? `
              <button class="btn btn-secondary" id="btn-enter-results">
                Enter Results
              </button>
            ` : ''}
          </div>
        </div>
      ` : ''}

      ${!admin && (race.status === 'active' || race.status === 'locked') ? `
        <div style="margin-bottom: var(--space-6);">
          <button class="btn btn-secondary" id="btn-make-prediction" style="width: 100%;">
            ${race.status === 'active' ? 'Make Predictions →' : 'View Predictions'}
          </button>
        </div>
      ` : ''}
    </div>

    ${admin && race.status === 'upcoming' ? `
      <div class="side-panel-footer">
        <button class="btn btn-danger btn-sm" id="btn-delete-race">Delete Race</button>
      </div>
    ` : ''}
  `;

  openSidePanel(html);

  // --- Event Listeners ---
  document.getElementById('close-panel')?.addEventListener('click', closeSidePanel);

  // Weekend type toggle
  document.querySelectorAll('.toggle-option[data-type]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      try {
        await updateDocument('races', race.id, { weekendType: type });
        showToast(`Weekend type changed to ${type}`, 'success');
        closeSidePanel();
        renderRaces(); // refresh
      } catch (err) {
        showToast('Failed to update weekend type', 'error');
      }
    });
  });

  // Status transition
  document.getElementById('btn-status-transition')?.addEventListener('click', async () => {
    const next = nextStatus[race.status];
    if (!next) return;

    const confirmMessages = {
      active: 'This will open predictions for all players. Continue?',
      locked: 'This will freeze all predictions. No player can make changes after this. Continue?',
      completed: 'This will finalize the race and update the leaderboard. Continue?'
    };

    showModal({
      title: `${nextLabel[race.status]}?`,
      message: confirmMessages[next],
      confirmText: nextLabel[race.status],
      danger: next === 'locked',
      onConfirm: async () => {
        try {
          await updateDocument('races', race.id, { status: next });
          showToast(`Race status: ${next.toUpperCase()}`, 'success');
          closeSidePanel();
          renderRaces();
        } catch (err) {
          showToast('Failed to update status', 'error');
        }
      }
    });
  });

  // Enter results
  document.getElementById('btn-enter-results')?.addEventListener('click', () => {
    const sessions = SESSION_KEYS[race.weekendType] || SESSION_KEYS.standard;
    closeSidePanel();
    navigateTo('results', race.id, sessions[0]);
  });

  // Make prediction
  document.getElementById('btn-make-prediction')?.addEventListener('click', () => {
    const sessions = SESSION_KEYS[race.weekendType] || SESSION_KEYS.standard;
    closeSidePanel();
    navigateTo('predict', race.id, sessions[0]);
  });

  // Delete race
  document.getElementById('btn-delete-race')?.addEventListener('click', () => {
    showModal({
      title: 'Delete Race',
      message: `This can't be undone. Delete ${race.name}?`,
      confirmText: 'Delete',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteDocument('races', race.id);
          showToast('Race deleted', 'success');
          closeSidePanel();
          renderRaces();
        } catch (err) {
          showToast('Failed to delete race', 'error');
        }
      }
    });
  });
}

/**
 * Open the new race creation panel
 */
function openNewRacePanel() {
  const html = `
    <div class="side-panel-header">
      <h2 class="text-display-sm">New Race</h2>
      <button class="btn btn-icon btn-ghost" id="close-panel" aria-label="Close panel">✕</button>
    </div>
    <div class="side-panel-body">
      <form id="new-race-form">
        <div class="form-group">
          <label class="form-label" for="race-name">Grand Prix Name</label>
          <input class="form-input" type="text" id="race-name" placeholder="Australian Grand Prix" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="race-circuit">Circuit</label>
          <input class="form-input" type="text" id="race-circuit" placeholder="Albert Park" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="race-country">Country</label>
          <input class="form-input" type="text" id="race-country" placeholder="Australia" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="race-flag">Country Flag Emoji</label>
          <input class="form-input" type="text" id="race-flag" placeholder="🇦🇺" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="race-round">Round Number</label>
          <input class="form-input" type="number" id="race-round" min="1" max="30" placeholder="1" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="race-date">Race Date</label>
          <input class="form-input" type="date" id="race-date" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="race-start-date">Weekend Dates</label>
          <input class="form-input" type="text" id="race-start-date" placeholder="6–8 Mar 2026">
        </div>
        <div class="form-group">
          <label class="form-label">Weekend Type</label>
          <div class="toggle-group" style="margin-top: var(--space-2);">
            <button type="button" class="toggle-option active" data-type="standard" id="toggle-standard">Standard</button>
            <button type="button" class="toggle-option" data-type="sprint" id="toggle-sprint">Sprint</button>
          </div>
          <input type="hidden" id="race-weekend-type" value="standard">
        </div>
      </form>
    </div>
    <div class="side-panel-footer">
      <button class="btn btn-secondary" id="cancel-new-race">Cancel</button>
      <button class="btn btn-primary" id="save-new-race">Create Race</button>
    </div>
  `;

  openSidePanel(html);

  // Close handler
  document.getElementById('close-panel')?.addEventListener('click', closeSidePanel);
  document.getElementById('cancel-new-race')?.addEventListener('click', closeSidePanel);

  // Weekend type toggle
  let weekendType = 'standard';
  document.querySelectorAll('.toggle-option[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      weekendType = btn.dataset.type;
      document.getElementById('race-weekend-type').value = weekendType;
      document.querySelectorAll('.toggle-option[data-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Save handler
  document.getElementById('save-new-race')?.addEventListener('click', async () => {
    const name = document.getElementById('race-name').value.trim();
    const circuit = document.getElementById('race-circuit').value.trim();
    const country = document.getElementById('race-country').value.trim();
    const flag = document.getElementById('race-flag').value.trim();
    const round = parseInt(document.getElementById('race-round').value);
    const raceDate = document.getElementById('race-date').value;
    const startDate = document.getElementById('race-start-date').value.trim();

    if (!name || !circuit || !country || !round || !raceDate) {
      showToast('Please fill in all required fields', 'warning');
      return;
    }

    const raceId = `r${String(round).padStart(2, '0')}`;

    try {
      await setDocument('races', raceId, {
        name,
        circuit,
        country,
        countryFlag: flag,
        round,
        weekendType,
        startDate,
        raceDate,
        status: 'upcoming'
      });

      showToast(`${name} created!`, 'success');
      closeSidePanel();
      renderRaces();
    } catch (err) {
      showToast('Failed to create race', 'error');
      console.error('[Races] Create error:', err);
    }
  });
}

// --- Exports ---
export {
  renderRaces
};
