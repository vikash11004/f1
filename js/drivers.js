// ============================================
// F1 PREDICTION LEAGUE — DRIVERS
// Driver card component · Team color helpers
// ============================================

import { TEAMS_2026, DRIVERS_2026, getTeamById } from './seed.js';

// --- Team color map (cached) ---
const teamColorMap = {};
for (const team of TEAMS_2026) {
  teamColorMap[team.id] = team.color;
}

// --- Driver map (cached) ---
const driverMap = {};
for (const driver of DRIVERS_2026) {
  driverMap[driver.id] = driver;
}

/**
 * Get team color hex by team ID
 * @param {string} teamId 
 * @returns {string} hex color
 */
function getTeamColor(teamId) {
  return teamColorMap[teamId] || '#888888';
}

/**
 * Get driver data from cache
 * @param {string} driverId 
 * @returns {Object|undefined}
 */
function getDriver(driverId) {
  return driverMap[driverId];
}

/**
 * Get all drivers sorted by team
 * @returns {Array}
 */
function getAllDriversSorted() {
  return [...DRIVERS_2026].sort((a, b) => {
    const teamOrder = TEAMS_2026.findIndex(t => t.id === a.team) - TEAMS_2026.findIndex(t => t.id === b.team);
    if (teamOrder !== 0) return teamOrder;
    return a.number - b.number;
  });
}

/**
 * Get driver initials for avatar
 * @param {string} name - full name
 * @returns {string} two-letter initials
 */
function getDriverInitials(name) {
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Create the telemetry SVG polyline for card headers
 * @param {number} width 
 * @returns {string} SVG HTML string
 */
function createTelemetrySVG(width = 400) {
  // Generate a random-ish speed trace polyline
  const points = [];
  const segments = 20;
  const segWidth = width / segments;
  const midY = 20;
  const amplitude = 12;

  for (let i = 0; i <= segments; i++) {
    const x = i * segWidth;
    // Simulate speed trace with some variation
    const noise = Math.sin(i * 0.8) * amplitude + Math.cos(i * 1.3) * (amplitude * 0.5);
    const y = midY + noise;
    points.push(`${x},${Math.max(4, Math.min(36, y))}`);
  }

  return `<svg class="telemetry-svg" viewBox="0 0 ${width} 40" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <polyline class="telemetry-line is-idle" points="${points.join(' ')}" />
  </svg>`;
}

/**
 * Render a driver card HTML string
 * @param {Object} driver - driver data object
 * @param {Object} options - rendering options
 * @param {boolean} options.showTeam - show team name (default true)
 * @param {boolean} options.compact - compact mode
 * @param {string} options.extraClass - additional CSS class
 * @param {number} options.position - position number to show
 * @returns {string} HTML string
 */
function renderDriverCard(driver, options = {}) {
  const {
    showTeam = true,
    compact = false,
    extraClass = '',
    position = null
  } = options;

  if (!driver) return '';

  const teamColor = getTeamColor(driver.team);
  const team = getTeamById(driver.team);
  const initials = getDriverInitials(driver.name);

  const positionHTML = position !== null
    ? `<span class="order-slot-position ${position <= 3 ? 'top3' : ''}">${'P' + position}</span>`
    : '';

  return `
    <div class="driver-card ${extraClass}" 
         data-driver-id="${driver.id}" 
         data-team="${driver.team}"
         tabindex="0"
         role="button"
         aria-label="${driver.name}, ${driver.code}, number ${driver.number}">
      <div class="driver-card-color-bar" style="background-color: ${teamColor}"></div>
      ${positionHTML}
      <div class="driver-card-avatar" style="background-color: ${teamColor}20; color: ${teamColor}">
        ${initials}
      </div>
      <div class="driver-card-number">${driver.number}</div>
      <div class="driver-card-info">
        <span class="driver-card-code">${driver.code}</span>
        <span class="driver-card-name">${driver.name}</span>
        ${showTeam && team ? `<span class="driver-card-team">${team.name}</span>` : ''}
      </div>
    </div>
  `;
}

/**
 * Render an empty order slot
 * @param {number} position - 1-indexed position
 * @returns {string} HTML string
 */
function renderEmptySlot(position) {
  return `
    <div class="order-slot" data-position="${position}" tabindex="0" role="listitem" aria-label="Position ${position}, empty">
      <span class="order-slot-position ${position <= 3 ? 'top3' : ''}">P${position}</span>
      <span class="order-slot-placeholder">Tap a driver to fill this slot</span>
    </div>
  `;
}

/**
 * Render a filled order slot with a driver card inside
 * @param {number} position - 1-indexed position
 * @param {Object} driver - driver data
 * @returns {string} HTML string
 */
function renderFilledSlot(position, driver) {
  return `
    <div class="order-slot filled" data-position="${position}" data-driver-id="${driver.id}" tabindex="0" role="listitem" aria-label="Position ${position}, ${driver.name}">
      ${renderDriverCard(driver, { position, showTeam: true })}
    </div>
  `;
}

/**
 * Render the F1 car silhouette SVG for empty states
 * @returns {string} SVG HTML string
 */
function renderEmptyStateSVG() {
  return `
    <svg class="empty-state-icon" viewBox="0 0 200 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- F1 car silhouette -->
      <path d="M20 55 L35 55 L40 45 L55 40 L80 38 L100 35 L130 33 L150 35 L165 40 L175 45 L180 55 L185 55" 
            stroke="currentColor" stroke-width="2" fill="none" opacity="0.3"/>
      <!-- Front wing -->
      <path d="M15 57 L40 57 L38 52 L20 52 Z" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.2"/>
      <!-- Rear wing -->
      <path d="M170 57 L190 57 L190 42 L175 42 Z" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.2"/>
      <!-- Wheels -->
      <circle cx="55" cy="58" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.25"/>
      <circle cx="55" cy="58" r="5" stroke="currentColor" stroke-width="1" fill="none" opacity="0.15"/>
      <circle cx="155" cy="58" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.25"/>
      <circle cx="155" cy="58" r="5" stroke="currentColor" stroke-width="1" fill="none" opacity="0.15"/>
      <!-- Halo -->
      <path d="M95 35 Q100 25 110 33" stroke="currentColor" stroke-width="2" fill="none" opacity="0.2"/>
      <!-- Speed lines -->
      <line x1="5" y1="40" x2="25" y2="40" stroke="currentColor" stroke-width="1" opacity="0.1"/>
      <line x1="0" y1="48" x2="18" y2="48" stroke="currentColor" stroke-width="1" opacity="0.08"/>
      <line x1="8" y1="35" x2="20" y2="35" stroke="currentColor" stroke-width="1" opacity="0.06"/>
    </svg>
  `;
}

/**
 * Render skeleton loading for driver cards
 * @param {number} count - number of skeleton cards
 * @returns {string} HTML string
 */
function renderDriverSkeletons(count = 22) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `<div class="skeleton skeleton-row stagger-${(i % 6) + 1}"></div>`;
  }
  return html;
}

// --- Exports ---
export {
  getTeamColor,
  getDriver,
  getAllDriversSorted,
  getDriverInitials,
  createTelemetrySVG,
  renderDriverCard,
  renderEmptySlot,
  renderFilledSlot,
  renderEmptyStateSVG,
  renderDriverSkeletons,
  teamColorMap,
  driverMap
};
