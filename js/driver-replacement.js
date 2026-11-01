// ============================================
// F1 PREDICTION LEAGUE — DRIVER REPLACEMENT
// Admin replacement manager for weekend & season substitutions
// ============================================

import {
  isAdmin,
  getAllDocuments,
  updateDocument,
  createBatch,
  getDocRef,
  serverTimestamp
} from './firebase.js';
import {
  DRIVERS_2026,
  TEAMS_2026,
  getTeamById
} from './seed.js';
import {
  getDriver,
  getTeamColor,
  getDriverInitials,
  getRaceReplacements
} from './drivers.js';
import {
  showToast,
  formatRound
} from './ui.js';
import { escapeHTML } from './design.js';

// --- Comprehensive Nationalities & Flag List for Dropdown Menu ---
export const NATIONALITY_OPTIONS = [
  { nationality: 'British',        flag: '🇬🇧' },
  { nationality: 'American',       flag: '🇺🇸' },
  { nationality: 'Australian',     flag: '🇦🇺' },
  { nationality: 'Austrian',       flag: '🇦🇹' },
  { nationality: 'Argentine',      flag: '🇦🇷' },
  { nationality: 'Barbadian',      flag: '🇧🇧' },
  { nationality: 'Belgian',        flag: '🇧🇪' },
  { nationality: 'Brazilian',      flag: '🇧🇷' },
  { nationality: 'Canadian',       flag: '🇨🇦' },
  { nationality: 'Chilean',        flag: '🇨🇱' },
  { nationality: 'Chinese',        flag: '🇨🇳' },
  { nationality: 'Colombian',      flag: '🇨🇴' },
  { nationality: 'Czech',          flag: '🇨🇿' },
  { nationality: 'Danish',         flag: '🇩🇰' },
  { nationality: 'Dutch',          flag: '🇳🇱' },
  { nationality: 'Emirati',        flag: '🇦🇪' },
  { nationality: 'Estonian',       flag: '🇪🇪' },
  { nationality: 'Finnish',        flag: '🇫🇮' },
  { nationality: 'French',         flag: '🇫🇷' },
  { nationality: 'German',         flag: '🇩🇪' },
  { nationality: 'Greek',          flag: '🇬🇷' },
  { nationality: 'Hungarian',      flag: '🇭🇺' },
  { nationality: 'Indian',         flag: '🇮🇳' },
  { nationality: 'Indonesian',     flag: '🇮🇩' },
  { nationality: 'Irish',          flag: '🇮🇪' },
  { nationality: 'Israeli',        flag: '🇮🇱' },
  { nationality: 'Italian',        flag: '🇮🇹' },
  { nationality: 'Japanese',       flag: '🇯🇵' },
  { nationality: 'Mexican',        flag: '🇲🇽' },
  { nationality: 'Monégasque',     flag: '🇲🇨' },
  { nationality: 'New Zealander',  flag: '🇳🇿' },
  { nationality: 'Norwegian',      flag: '🇳🇴' },
  { nationality: 'Polish',         flag: '🇵🇱' },
  { nationality: 'Portuguese',     flag: '🇵🇹' },
  { nationality: 'Saudi Arabian',  flag: '🇸🇦' },
  { nationality: 'South African',  flag: '🇿🇦' },
  { nationality: 'South Korean',   flag: '🇰🇷' },
  { nationality: 'Spanish',        flag: '🇪🇸' },
  { nationality: 'Swedish',        flag: '🇸🇪' },
  { nationality: 'Swiss',          flag: '🇨🇭' },
  { nationality: 'Thai',           flag: '🇹🇭' },
  { nationality: 'Turkish',        flag: '🇹🇷' },
  { nationality: 'International',  flag: '🏁' }
];

/**
 * Apply a driver replacement in Firestore for a given scope
 * @param {Object} params
 * @param {Object} params.race - race object
 * @param {string} params.originalDriverId - ID of driver being replaced (e.g. 'sai')
 * @param {Object} params.replacementData - { name, code, number, nationality, flag, notes }
 * @param {string} params.scope - 'weekend' | 'rest_of_season' | 'all_season'
 * @returns {Promise<{ affectedCount: number, updatedRace: Object }>}
 */
export async function applyDriverReplacement({ race, originalDriverId, replacementData, scope = 'weekend' }) {
  if (!isAdmin()) {
    throw new Error('Access Denied: Only administrators can replace drivers.');
  }

  if (!race || !race.id) {
    throw new Error('Invalid race specification.');
  }

  const baseDriver = DRIVERS_2026.find(d => d.id === originalDriverId);
  if (!baseDriver) {
    throw new Error(`Driver with ID "${originalDriverId}" not found in 2026 grid.`);
  }

  const cleanName = (replacementData.name || '').trim();
  const cleanCode = (replacementData.code || '').trim().toUpperCase();
  const numVal = parseInt(replacementData.number, 10);
  const cleanNumber = Number.isFinite(numVal) && numVal > 0 ? numVal : baseDriver.number;

  if (!cleanName) {
    throw new Error('Replacement driver name is required.');
  }
  if (!cleanCode || cleanCode.length < 2 || cleanCode.length > 4) {
    throw new Error('Driver code must be 2 to 4 characters (e.g. BEA).');
  }

  const payload = {
    originalDriverId,
    name: cleanName,
    code: cleanCode,
    number: cleanNumber,
    nationality: (replacementData.nationality || baseDriver.nationality || '').trim(),
    flag: (replacementData.flag || baseDriver.flag || '🏁').trim(),
    team: baseDriver.team,
    scope,
    notes: (replacementData.notes || '').trim(),
    updatedAt: new Date().toISOString()
  };

  let affectedCount = 0;
  let updatedTargetRace = { ...race };

  if (scope === 'weekend') {
    // Only current race
    const existingReplacements = { ...(race.driverReplacements || {}) };
    existingReplacements[originalDriverId] = payload;

    await updateDocument('races', race.id, {
      driverReplacements: existingReplacements
    });

    updatedTargetRace.driverReplacements = existingReplacements;
    affectedCount = 1;

  } else if (scope === 'rest_of_season') {
    // From current race round through end of season
    const allRaces = await getAllDocuments('races');
    const targetRound = Number(race.round) || 1;
    const eligibleRaces = allRaces.filter(r => (Number(r.round) || 1) >= targetRound);

    const batch = createBatch();
    for (const r of eligibleRaces) {
      const rep = { ...(r.driverReplacements || {}) };
      rep[originalDriverId] = payload;
      batch.update(getDocRef('races', r.id), { driverReplacements: rep });
      if (r.id === race.id) {
        updatedTargetRace.driverReplacements = rep;
      }
    }
    await batch.commit();
    affectedCount = eligibleRaces.length;

  } else if (scope === 'all_season') {
    // All 2026 races
    const allRaces = await getAllDocuments('races');
    const batch = createBatch();
    for (const r of allRaces) {
      const rep = { ...(r.driverReplacements || {}) };
      rep[originalDriverId] = payload;
      batch.update(getDocRef('races', r.id), { driverReplacements: rep });
      if (r.id === race.id) {
        updatedTargetRace.driverReplacements = rep;
      }
    }
    await batch.commit();
    affectedCount = allRaces.length;
  }

  return { affectedCount, updatedRace: updatedTargetRace };
}

/**
 * Remove a driver replacement (restore original driver)
 * @param {Object} params
 * @param {Object} params.race - race object
 * @param {string} params.originalDriverId - driver ID to restore
 * @param {string} params.scope - 'weekend' | 'rest_of_season' | 'all_season'
 * @returns {Promise<{ affectedCount: number, updatedRace: Object }>}
 */
export async function removeDriverReplacement({ race, originalDriverId, scope = 'weekend' }) {
  if (!isAdmin()) {
    throw new Error('Access Denied: Only administrators can restore drivers.');
  }

  let affectedCount = 0;
  let updatedTargetRace = { ...race };

  if (scope === 'weekend') {
    const existingReplacements = { ...(race.driverReplacements || {}) };
    delete existingReplacements[originalDriverId];

    await updateDocument('races', race.id, {
      driverReplacements: existingReplacements
    });

    updatedTargetRace.driverReplacements = existingReplacements;
    affectedCount = 1;

  } else if (scope === 'rest_of_season') {
    const allRaces = await getAllDocuments('races');
    const targetRound = Number(race.round) || 1;
    const eligibleRaces = allRaces.filter(r => (Number(r.round) || 1) >= targetRound);

    const batch = createBatch();
    for (const r of eligibleRaces) {
      const rep = { ...(r.driverReplacements || {}) };
      delete rep[originalDriverId];
      batch.update(getDocRef('races', r.id), { driverReplacements: rep });
      if (r.id === race.id) {
        updatedTargetRace.driverReplacements = rep;
      }
    }
    await batch.commit();
    affectedCount = eligibleRaces.length;

  } else if (scope === 'all_season') {
    const allRaces = await getAllDocuments('races');
    const batch = createBatch();
    for (const r of allRaces) {
      const rep = { ...(r.driverReplacements || {}) };
      delete rep[originalDriverId];
      batch.update(getDocRef('races', r.id), { driverReplacements: rep });
      if (r.id === race.id) {
        updatedTargetRace.driverReplacements = rep;
      }
    }
    await batch.commit();
    affectedCount = allRaces.length;
  }

  return { affectedCount, updatedRace: updatedTargetRace };
}

/**
 * Open the Driver Replacement Modal (Admin Only)
 * @param {Object} options
 * @param {Object} options.race - race object
 * @param {string} [options.preselectedDriverId=null] - driver ID to preselect
 * @param {Function} [options.onSaved=null] - callback when replacement is saved
 * @param {Function} [options.onRestored=null] - callback when driver is restored
 */
export function openDriverReplacementModal({ race, preselectedDriverId = null, onSaved = null, onRestored = null }) {
  if (!isAdmin()) {
    showToast('Only administrators can manage driver lineups.', 'warning');
    return;
  }

  const container = document.getElementById('modal-container');
  if (!container) return;

  const activeReplacements = getRaceReplacements(race);
  const activeDriverIdMap = {};
  activeReplacements.forEach(item => {
    activeDriverIdMap[item.driverId] = item;
  });

  // Determine initial selected team and driver
  let initialDriver = null;
  if (preselectedDriverId) {
    initialDriver = DRIVERS_2026.find(d => d.id === preselectedDriverId);
  }
  if (!initialDriver) {
    // Prefer un-substituted driver so admin can cleanly add another replacement
    initialDriver = DRIVERS_2026.find(d => !activeDriverIdMap[d.id]);
  }
  if (!initialDriver) {
    initialDriver = DRIVERS_2026[0];
  }

  const initialTeamId = initialDriver.team;
  const initialReplacement = activeDriverIdMap[initialDriver.id]?.replacement;

  // Render modal structure
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" id="driver-replacement-overlay" style="z-index: 1100;">
      <div class="modal animate-card-enter" style="max-width: 580px; width: 94%; max-height: 90vh; display: flex; flex-direction: column;" role="dialog" aria-modal="true" aria-labelledby="driver-sub-title">
        
        <!-- Header -->
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: flex-start; padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--glass-border);">
          <div>
            <p class="eyebrow" style="margin-bottom: 2px; color: var(--accent);">RACE CONTROL / DRIVER SUBSTITUTION</p>
            <h2 class="modal-title text-display" id="driver-sub-title" style="font-size: var(--text-lg); margin: 0; display: flex; align-items: center; gap: 8px;">
              <span>Replace Driver</span>
            </h2>
            <p style="font-size: var(--text-xs); color: var(--text-muted); margin: 2px 0 0;">
              ${escapeHTML(race.name)} (${formatRound(race.round)})
            </p>
          </div>
          <button class="btn btn-icon btn-ghost" id="btn-close-sub-modal" aria-label="Close" style="margin-top: -4px;">✕</button>
        </div>

        <!-- Body (Scrollable) -->
        <div class="modal-body" style="padding: var(--space-5); overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-4);">
          
          <!-- Active Substitutions Alert if any exist -->
          ${activeReplacements.length > 0 ? `
            <div style="background: var(--bg-surface); border: 1px solid var(--sprint-amber, #e5a93c); border-radius: var(--radius-md); padding: 10px 14px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-size: var(--text-xs); font-weight: 700; color: var(--sprint-amber, #e5a93c); text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 5px;">
                  ⚠️ Active Substitution${activeReplacements.length > 1 ? 's' : ''} for this GP (${activeReplacements.length})
                </span>
                <button type="button" class="btn btn-sm btn-secondary" id="btn-sub-add-another-modal" style="padding: 2px 8px; font-size: 11px;">
                  + Add Another Replacement
                </button>
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${activeReplacements.map(item => `
                  <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-base); padding: 6px 10px; border-radius: var(--radius-sm); font-size: var(--text-xs);">
                    <div>
                      <strong style="color: var(--text-primary);">${escapeHTML(item.replacement.name)} (${escapeHTML(item.replacement.code)} #${item.replacement.number})</strong>
                      <span style="color: var(--text-muted);"> subbing for </span>
                      <strong style="color: var(--text-secondary);">${escapeHTML(item.originalDriver?.name)}</strong>
                      <span style="color: var(--text-muted);"> (${escapeHTML(item.team?.name)})</span>
                    </div>
                    <div style="display: flex; gap: 6px;">
                      <button type="button" class="btn btn-sm btn-ghost btn-sub-select-active" data-driver-id="${item.driverId}" data-team-id="${item.originalDriver?.team}" style="padding: 2px 6px; font-size: 11px;">Edit</button>
                      <button type="button" class="btn btn-sm btn-ghost btn-sub-quick-restore" data-driver-id="${item.driverId}" style="padding: 2px 6px; font-size: 11px; color: var(--accent);">Restore</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Step 1: Replacement Driver Name & Info -->
          <div>
            <span style="font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 6px;">
              1. Replacement Driver Details
            </span>
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-3);">
              <div class="form-group" style="margin: 0;">
                <label for="sub-name" style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Driver's Name *</label>
                <input type="text" class="form-input" id="sub-name" placeholder="e.g. Oliver Bearman" value="${escapeHTML(initialReplacement?.name || '')}" required autocomplete="off" />
              </div>
              <div class="form-group" style="margin: 0;">
                <label for="sub-code" style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Code (3 char) *</label>
                <input type="text" class="form-input" id="sub-code" placeholder="BEA" maxlength="4" value="${escapeHTML(initialReplacement?.code || '')}" style="text-transform: uppercase; font-family: var(--font-data);" required autocomplete="off" />
              </div>
              <div class="form-group" style="margin: 0;">
                <label for="sub-number" style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Car Number *</label>
                <input type="number" class="form-input" id="sub-number" placeholder="38" min="1" max="99" value="${initialReplacement?.number || ''}" required />
              </div>
            </div>
          </div>

          <!-- Step 2: Team Driving For & Nationality/Flag -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            
            <!-- Team Selection -->
            <div class="form-group" style="margin: 0;">
              <label for="sub-team" style="font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 6px;">
                2. Team Driving For *
              </label>
              <select class="form-input" id="sub-team" style="background: var(--bg-surface); cursor: pointer; font-size: var(--text-sm);">
                ${TEAMS_2026.map(t => `
                  <option value="${t.id}" ${t.id === initialTeamId ? 'selected' : ''}>
                    ${escapeHTML(t.name)}
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- National Flag (Top-down menu) -->
            <div class="form-group" style="margin: 0;">
              <label for="sub-nationality" style="font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 6px;">
                3. National Flag *
              </label>
              <select class="form-input" id="sub-nationality" style="background: var(--bg-surface); cursor: pointer; font-size: var(--text-sm);">
                ${NATIONALITY_OPTIONS.map(opt => {
                  const isSelected = initialReplacement
                    ? (initialReplacement.nationality === opt.nationality || initialReplacement.flag === opt.flag)
                    : (opt.nationality === 'British');
                  return `
                    <option value="${opt.nationality}" data-flag="${opt.flag}" ${isSelected ? 'selected' : ''}>
                      ${opt.flag} ${opt.nationality}
                    </option>
                  `;
                }).join('')}
              </select>
            </div>

          </div>

          <!-- Step 3: Prompt which driver is being replaced in the selected team -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">
                4. Which Driver Is Being Replaced? *
              </span>
              <span id="sub-team-indicator" style="font-size: 11px; font-weight: 600;"></span>
            </div>
            <div id="sub-drivers-container" style="display: flex; flex-direction: column; gap: var(--space-2);">
              <!-- Rendered dynamically based on sub-team -->
            </div>
          </div>

          <!-- Step 4: Duration / Scope -->
          <div>
            <span style="font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 8px;">
              5. Replacement Duration / Scope
            </span>
            <div style="display: flex; flex-direction: column; gap: var(--space-2);">
              
              <!-- Option 1: Weekend Only -->
              <label class="replacement-scope-card selected" data-scope="weekend">
                <input type="radio" name="sub-scope" value="weekend" checked style="margin-top: 3px;" />
                <div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <strong style="color: var(--text-primary); font-size: var(--text-sm);">This weekend only</strong>
                    <span class="badge" style="background: var(--accent); color: white; font-size: 9px; padding: 1px 5px;">One-off / Injury</span>
                  </div>
                  <p style="font-size: var(--text-xs); color: var(--text-muted); margin: 3px 0 0;">
                    Applies <strong>only to ${escapeHTML(race.name)} (Round ${race.round})</strong>. The original driver returns automatically next weekend.
                  </p>
                </div>
              </label>

              <!-- Option 2: Rest of Season -->
              <label class="replacement-scope-card" data-scope="rest_of_season">
                <input type="radio" name="sub-scope" value="rest_of_season" style="margin-top: 3px;" />
                <div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <strong style="color: var(--text-primary); font-size: var(--text-sm);">For the rest of the season</strong>
                    <span class="badge" style="background: var(--sprint-amber, #e5a93c); color: #111; font-size: 9px; padding: 1px 5px;">Mid-season swap</span>
                  </div>
                  <p style="font-size: var(--text-xs); color: var(--text-muted); margin: 3px 0 0;">
                    Applies from <strong>Round ${race.round} through Round 22</strong>. Historical results of past rounds will remain unchanged.
                  </p>
                </div>
              </label>

              <!-- Option 3: Entire Season -->
              <label class="replacement-scope-card" data-scope="all_season">
                <input type="radio" name="sub-scope" value="all_season" style="margin-top: 3px;" />
                <div>
                  <strong style="color: var(--text-primary); font-size: var(--text-sm);">Entire season (All rounds)</strong>
                  <p style="font-size: var(--text-xs); color: var(--text-muted); margin: 3px 0 0;">
                    Applies across all 22 rounds in the calendar.
                  </p>
                </div>
              </label>

            </div>
          </div>

          <!-- Reason / Notes -->
          <div class="form-group" style="margin: 0;">
            <label for="sub-notes" style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">
              Reason / Medical Notes (Optional)
            </label>
            <input type="text" class="form-input" id="sub-notes" placeholder="e.g. Injured for this weekend — returning next week" value="${escapeHTML(initialReplacement?.notes || '')}" autocomplete="off" />
          </div>

          <!-- Live Preview Banner -->
          <div id="sub-live-preview" style="background: var(--bg-surface); border: 1px solid var(--glass-border); border-radius: var(--radius-md); padding: 12px;">
            <!-- Dynamically updated -->
          </div>

        </div>

        <!-- Footer -->
        <div class="modal-footer" style="padding: var(--space-4) var(--space-5); border-top: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface);">
          <div id="sub-restore-btn-container">
            <!-- Render restore button if selected driver currently replaced -->
          </div>
          <div style="display: flex; gap: var(--space-2);">
            <button type="button" class="btn btn-secondary" id="btn-cancel-sub">Cancel</button>
            <button type="button" class="btn btn-primary" id="btn-save-sub">Save Driver Replacement</button>
          </div>
        </div>

      </div>
    </div>
  `;

  // Grab elements
  const overlay = document.getElementById('driver-replacement-overlay');
  const closeBtn = document.getElementById('btn-close-sub-modal');
  const cancelBtn = document.getElementById('btn-cancel-sub');
  const saveBtn = document.getElementById('btn-save-sub');
  const teamSelect = document.getElementById('sub-team');
  const nationalitySelect = document.getElementById('sub-nationality');
  const driversContainer = document.getElementById('sub-drivers-container');
  const teamIndicator = document.getElementById('sub-team-indicator');
  const nameInput = document.getElementById('sub-name');
  const codeInput = document.getElementById('sub-code');
  const numberInput = document.getElementById('sub-number');
  const notesInput = document.getElementById('sub-notes');
  const livePreviewDiv = document.getElementById('sub-live-preview');
  const restoreBtnContainer = document.getElementById('sub-restore-btn-container');

  let selectedOriginalDriverId = initialDriver.id;

  const closeModal = () => {
    container.classList.add('hidden');
    container.innerHTML = '';
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Handle radio cards click styling for Scope
  document.querySelectorAll('.replacement-scope-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.replacement-scope-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
      updateLivePreview();
    });
  });

  // Auto-generate 3-letter code from name if user hasn't explicitly customized it
  let codeManuallyEdited = Boolean(initialReplacement?.code);
  codeInput.addEventListener('input', () => {
    codeManuallyEdited = Boolean(codeInput.value.trim());
  });

  nameInput.addEventListener('input', () => {
    if (!codeManuallyEdited) {
      const parts = nameInput.value.trim().split(/\s+/);
      const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
      if (lastName && lastName.length >= 2) {
        codeInput.value = lastName.slice(0, 3).toUpperCase();
      }
    }
    updateLivePreview();
  });

  // Populate input fields based on whether selected driver currently has an active replacement
  const populateFormForDriver = (driverId) => {
    const existingRep = activeDriverIdMap[driverId]?.replacement;
    if (existingRep) {
      nameInput.value = existingRep.name || '';
      codeInput.value = existingRep.code || '';
      numberInput.value = existingRep.number || '';
      notesInput.value = existingRep.notes || '';
      codeManuallyEdited = true;

      // Select matching nationality
      for (let i = 0; i < nationalitySelect.options.length; i++) {
        const opt = nationalitySelect.options[i];
        if (opt.value === existingRep.nationality || opt.dataset.flag === existingRep.flag) {
          nationalitySelect.selectedIndex = i;
          break;
        }
      }

      // Select matching scope
      document.querySelectorAll('.replacement-scope-card[data-scope]').forEach(card => {
        const radio = card.querySelector('input[type="radio"]');
        const isMatch = radio?.value === (existingRep.scope || 'weekend');
        card.classList.toggle('selected', isMatch);
        if (radio) radio.checked = isMatch;
      });
    } else {
      // Clear inputs for clean new replacement
      nameInput.value = '';
      codeInput.value = '';
      numberInput.value = '';
      notesInput.value = '';
      codeManuallyEdited = false;

      // Default scope to weekend
      document.querySelectorAll('.replacement-scope-card[data-scope]').forEach(card => {
        const radio = card.querySelector('input[type="radio"]');
        const isMatch = radio?.value === 'weekend';
        card.classList.toggle('selected', isMatch);
        if (radio) radio.checked = isMatch;
      });
    }

    updateRestoreButton();
    updateLivePreview();
  };

  // Render drivers prompt for selected team
  const updateTeamDriversPrompt = () => {
    const teamId = teamSelect.value;
    const team = getTeamById(teamId);
    const teamColor = getTeamColor(teamId);
    const teamDrivers = DRIVERS_2026.filter(d => d.team === teamId);

    if (teamIndicator) {
      teamIndicator.style.color = teamColor;
      teamIndicator.textContent = team ? `${team.name} Driver Roster` : '';
    }

    // Check if previously selected driver is in this team
    if (!teamDrivers.some(d => d.id === selectedOriginalDriverId)) {
      const unrep = teamDrivers.find(d => !activeDriverIdMap[d.id]);
      selectedOriginalDriverId = (unrep || teamDrivers[0])?.id || '';
      populateFormForDriver(selectedOriginalDriverId);
    }

    driversContainer.innerHTML = teamDrivers.map(d => {
      const isSelected = d.id === selectedOriginalDriverId;
      const existingRep = activeDriverIdMap[d.id]?.replacement;

      return `
        <label class="replacement-scope-card ${isSelected ? 'selected' : ''}" style="cursor: pointer; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between;" data-driver-id="${d.id}">
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="radio" name="sub-driver-choice" value="${d.id}" ${isSelected ? 'checked' : ''} style="margin: 0;" />
            <div style="width: 4px; height: 28px; background: ${teamColor}; border-radius: 2px;"></div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <strong style="color: var(--text-primary); font-size: var(--text-sm);">${escapeHTML(d.name)}</strong>
                <span style="font-family: var(--font-data); font-size: var(--text-xs); color: var(--text-secondary);">${d.code} #${d.number}</span>
                <span>${d.flag}</span>
              </div>
              <p style="font-size: 10px; color: var(--text-muted); margin: 2px 0 0;">
                ${existingRep ? `<span style="color: var(--sprint-amber, #e5a93c); font-weight: 700;">Currently replaced by ${escapeHTML(existingRep.name)}</span>` : 'Full-time seat'}
              </p>
            </div>
          </div>
          <div>
            ${existingRep ? `<span class="badge" style="background: var(--sprint-amber, #e5a93c); color: #111; font-size: 9px; padding: 1px 5px;">REPLACED</span>` : ''}
          </div>
        </label>
      `;
    }).join('');

    // Wire driver choice clicks
    driversContainer.querySelectorAll('[data-driver-id]').forEach(label => {
      label.addEventListener('click', () => {
        driversContainer.querySelectorAll('[data-driver-id]').forEach(l => l.classList.remove('selected'));
        label.classList.add('selected');
        selectedOriginalDriverId = label.dataset.driverId;
        const radio = label.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;

        populateFormForDriver(selectedOriginalDriverId);
      });
    });

    updateRestoreButton();
    updateLivePreview();
  };

  const updateRestoreButton = () => {
    const existingRep = activeDriverIdMap[selectedOriginalDriverId]?.replacement;
    const base = DRIVERS_2026.find(d => d.id === selectedOriginalDriverId);

    if (existingRep && base) {
      restoreBtnContainer.innerHTML = `
        <button type="button" class="btn btn-danger btn-sm" id="btn-restore-from-modal">
          ↺ Restore ${escapeHTML(base.name)}
        </button>
      `;
      document.getElementById('btn-restore-from-modal')?.addEventListener('click', () => {
        closeModal();
        openRestoreDriverModal({
          race,
          driverId: selectedOriginalDriverId,
          onRestored
        });
      });
    } else {
      restoreBtnContainer.innerHTML = '';
    }
  };

  const updateLivePreview = () => {
    const base = DRIVERS_2026.find(d => d.id === selectedOriginalDriverId);
    if (!base) return;

    const team = getTeamById(teamSelect.value) || getTeamById(base.team);
    const teamColor = getTeamColor(team.id);

    const subName = nameInput.value.trim() || 'Replacement Driver';
    const subCode = (codeInput.value.trim() || 'SUB').toUpperCase();
    const subNumber = numberInput.value.trim() || '??';
    
    // Grab flag from nationality option data attribute
    const selectedOption = nationalitySelect.options[nationalitySelect.selectedIndex];
    const subFlag = selectedOption?.dataset?.flag || '🏁';
    const subNationality = nationalitySelect.value;
    const subScope = document.querySelector('input[name="sub-scope"]:checked')?.value || 'weekend';

    const scopeLabels = {
      weekend: `This weekend only (${escapeHTML(race.name)})`,
      rest_of_season: `Rest of Season (Rounds ${race.round}–22)`,
      all_season: 'Entire Season (All 22 rounds)'
    };

    livePreviewDiv.innerHTML = `
      <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
        Preview: Grid Appearance for this Grand Prix
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
        
        <!-- Original Driver Being Replaced -->
        <div style="display: flex; align-items: center; gap: 8px; opacity: 0.6; min-width: 140px;">
          <div style="width: 32px; height: 32px; border-radius: 50%; background: ${teamColor}22; color: ${teamColor}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: var(--text-xs);">
            ${getDriverInitials(base.name)}
          </div>
          <div>
            <div style="font-size: var(--text-xs); font-weight: 600; text-decoration: line-through;">${escapeHTML(base.name)}</div>
            <div style="font-size: 10px; color: var(--text-muted);">${base.code} #${base.number} · ${base.flag}</div>
          </div>
        </div>

        <div style="color: var(--accent); font-weight: 700; font-size: var(--text-md);">➔</div>

        <!-- New Replacement Driver -->
        <div style="display: flex; align-items: center; gap: 8px; min-width: 160px; background: var(--bg-base); padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid ${teamColor};">
          <div style="width: 32px; height: 32px; border-radius: 50%; background: ${teamColor}22; color: ${teamColor}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: var(--text-xs);">
            ${getDriverInitials(subName)}
          </div>
          <div>
            <div style="font-size: var(--text-xs); font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 4px;">
              <span>${escapeHTML(subName)}</span>
              <span class="driver-card-sub" style="font-size: 8px; padding: 1px 4px;">SUB</span>
            </div>
            <div style="font-size: 10px; color: var(--text-muted);">${subCode} #${subNumber} · ${subFlag} ${escapeHTML(team.name)}</div>
          </div>
        </div>

      </div>
      <div style="margin-top: 8px; font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between;">
        <span>Duration: <strong style="color: var(--text-secondary);">${scopeLabels[subScope]}</strong></span>
        <span>Team: <strong style="color: ${teamColor};">${escapeHTML(team.name)}</strong> (${subNationality})</span>
      </div>
    `;
  };

  // Wire input listeners
  teamSelect.addEventListener('change', () => {
    updateTeamDriversPrompt();
    populateFormForDriver(selectedOriginalDriverId);
  });

  // Top banner button: + Add Another Replacement
  document.getElementById('btn-sub-add-another-modal')?.addEventListener('click', () => {
    const unrep = DRIVERS_2026.find(d => !activeDriverIdMap[d.id]);
    if (unrep) {
      teamSelect.value = unrep.team;
      selectedOriginalDriverId = unrep.id;
      updateTeamDriversPrompt();
      populateFormForDriver(unrep.id);
      nameInput.focus();
    }
  });
  nationalitySelect.addEventListener('change', updateLivePreview);
  [codeInput, numberInput, notesInput].forEach(inp => {
    inp.addEventListener('input', updateLivePreview);
  });

  // Active substitutions quick clicks inside alert
  document.querySelectorAll('.btn-sub-select-active').forEach(b => {
    b.addEventListener('click', () => {
      const driverId = b.dataset.driverId;
      const teamId = b.dataset.teamId;
      if (teamId) teamSelect.value = teamId;
      selectedOriginalDriverId = driverId;
      updateTeamDriversPrompt();
      populateFormForDriver(driverId);
      nameInput.focus();
    });
  });

  document.querySelectorAll('.btn-sub-quick-restore').forEach(b => {
    b.addEventListener('click', () => {
      closeModal();
      openRestoreDriverModal({
        race,
        driverId: b.dataset.driverId,
        onRestored
      });
    });
  });

  // Save Replacement Handler
  saveBtn.addEventListener('click', async () => {
    const originalDriverId = selectedOriginalDriverId;
    const name = nameInput.value.trim();
    const code = codeInput.value.trim().toUpperCase();
    const number = parseInt(numberInput.value.trim(), 10);
    const selectedOption = nationalitySelect.options[nationalitySelect.selectedIndex];
    const nationality = nationalitySelect.value;
    const flag = selectedOption?.dataset?.flag || '🏁';
    const notes = notesInput.value.trim();
    const scope = document.querySelector('input[name="sub-scope"]:checked')?.value || 'weekend';

    if (!name) {
      showToast('Please type in the replacement driver\'s name.', 'warning');
      nameInput.focus();
      return;
    }

    if (!code || code.length < 2 || code.length > 4) {
      showToast('Please enter a valid 2-4 character driver code (e.g. BEA).', 'warning');
      codeInput.focus();
      return;
    }

    if (!number || number < 1 || number > 99) {
      showToast('Please enter a valid car number (1–99).', 'warning');
      numberInput.focus();
      return;
    }

    if (!originalDriverId) {
      showToast('Please select which driver is being replaced.', 'warning');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      const { affectedCount, updatedRace } = await applyDriverReplacement({
        race,
        originalDriverId,
        replacementData: {
          name,
          code,
          number,
          nationality,
          flag,
          notes
        },
        scope
      });

      const scopeDesc = scope === 'weekend' 
        ? 'this weekend' 
        : (scope === 'rest_of_season' ? `the rest of the season (${affectedCount} races)` : `all ${affectedCount} races`);

      const totalSubs = Object.keys(updatedRace.driverReplacements || {}).length;
      showToast(`✓ Driver replaced: ${name} (${code} #${number}) for ${scopeDesc}! (${totalSubs} active substitution${totalSubs > 1 ? 's' : ''} this GP)`, 'success');
      closeModal();

      if (typeof onSaved === 'function') {
        onSaved(updatedRace);
      }

    } catch (err) {
      console.error('[Driver Replacement] Save error:', err);
      showToast(err.message || 'Failed to save driver replacement', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Driver Replacement';
    }
  });

  // Initial populate
  updateTeamDriversPrompt();
}

/**
 * Open confirmation modal to restore original driver
 * @param {Object} options
 * @param {Object} options.race
 * @param {string} options.driverId
 * @param {Function} [options.onRestored]
 */
export function openRestoreDriverModal({ race, driverId, onRestored = null }) {
  if (!isAdmin()) {
    showToast('Only administrators can restore drivers.', 'warning');
    return;
  }

  const container = document.getElementById('modal-container');
  if (!container) return;

  const baseDriver = DRIVERS_2026.find(d => d.id === driverId);
  const activeRep = race.driverReplacements?.[driverId];
  if (!baseDriver) return;

  const subName = activeRep?.name || 'replacement driver';

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" id="restore-driver-overlay" style="z-index: 1100;">
      <div class="modal animate-card-enter" style="max-width: 480px; width: 92%;" role="dialog" aria-modal="true" aria-labelledby="restore-driver-title">
        
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: flex-start; padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--glass-border);">
          <div>
            <p class="eyebrow" style="margin-bottom: 2px; color: var(--accent);">RESTORE ORIGINAL DRIVER</p>
            <h2 class="modal-title" id="restore-driver-title" style="font-size: var(--text-lg); margin: 0;">
              Restore ${escapeHTML(baseDriver.name)}?
            </h2>
          </div>
          <button class="btn btn-icon btn-ghost" id="btn-close-restore-modal" aria-label="Close" style="margin-top: -4px;">✕</button>
        </div>

        <div class="modal-body" style="padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-4);">
          <p class="modal-message" style="margin: 0; line-height: 1.5; font-size: var(--text-sm);">
            Currently, <strong>${escapeHTML(subName)}</strong> is active in place of <strong>${escapeHTML(baseDriver.name)}</strong>. 
            Choose the scope to restore ${escapeHTML(baseDriver.name)} to the grid:
          </p>

          <div style="display: flex; flex-direction: column; gap: var(--space-2);">
            
            <label class="replacement-scope-card selected" data-restore-scope="weekend">
              <input type="radio" name="restore-scope" value="weekend" checked style="margin-top: 3px;" />
              <div>
                <strong style="color: var(--text-primary); font-size: var(--text-sm);">For this weekend only</strong>
                <p style="font-size: var(--text-xs); color: var(--text-muted); margin: 2px 0 0;">
                  Restores ${escapeHTML(baseDriver.name)} for ${escapeHTML(race.name)}.
                </p>
              </div>
            </label>

            <label class="replacement-scope-card" data-restore-scope="rest_of_season">
              <input type="radio" name="restore-scope" value="rest_of_season" style="margin-top: 3px;" />
              <div>
                <strong style="color: var(--text-primary); font-size: var(--text-sm);">From this weekend for the rest of the season</strong>
                <p style="font-size: var(--text-xs); color: var(--text-muted); margin: 2px 0 0;">
                  Restores ${escapeHTML(baseDriver.name)} from Round ${race.round} through Round 22.
                </p>
              </div>
            </label>

            <label class="replacement-scope-card" data-restore-scope="all_season">
              <input type="radio" name="restore-scope" value="all_season" style="margin-top: 3px;" />
              <div>
                <strong style="color: var(--text-primary); font-size: var(--text-sm);">Across all rounds (Entire season)</strong>
                <p style="font-size: var(--text-xs); color: var(--text-muted); margin: 2px 0 0;">
                  Removes this substitution from every round on the calendar.
                </p>
              </div>
            </label>

          </div>
        </div>

        <div class="modal-footer" style="padding: var(--space-4) var(--space-5); border-top: 1px solid var(--glass-border); display: flex; justify-content: flex-end; gap: var(--space-2); background: var(--bg-surface);">
          <button type="button" class="btn btn-secondary" id="btn-cancel-restore">Cancel</button>
          <button type="button" class="btn btn-danger" id="btn-confirm-restore">Confirm & Restore Original Driver</button>
        </div>

      </div>
    </div>
  `;

  const overlay = document.getElementById('restore-driver-overlay');
  const closeBtn = document.getElementById('btn-close-restore-modal');
  const cancelBtn = document.getElementById('btn-cancel-restore');
  const confirmBtn = document.getElementById('btn-confirm-restore');

  const closeModal = () => {
    container.classList.add('hidden');
    container.innerHTML = '';
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  document.querySelectorAll('[data-restore-scope]').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('[data-restore-scope]').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  confirmBtn?.addEventListener('click', async () => {
    const scope = document.querySelector('input[name="restore-scope"]:checked')?.value || 'weekend';
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Restoring...';

    try {
      const { affectedCount, updatedRace } = await removeDriverReplacement({
        race,
        originalDriverId: driverId,
        scope
      });

      showToast(`✓ Restored ${baseDriver.name} (${scope === 'weekend' ? 'this weekend' : `${affectedCount} races`})!`, 'success');
      closeModal();

      if (typeof onRestored === 'function') {
        onRestored(updatedRace);
      }

    } catch (err) {
      console.error('[Driver Replacement] Restore error:', err);
      showToast(err.message || 'Failed to restore driver', 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm & Restore';
    }
  });
}
