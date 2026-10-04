// ============================================
// F1 PREDICTION LEAGUE — EXCEL EXPORT SERVICE
// Admin and player Excel (.xlsx) session exports
// ============================================

import {
  getDocument,
  getAllDocuments,
  queryCollection,
  isAdmin,
  ADMIN_UID,
  auth
} from './firebase.js';
import {
  SESSION_KEYS,
  SESSION_LABELS,
  SESSION_FULL_LABELS,
  getTeamById
} from './seed.js';
import { getDriver } from './drivers.js';
import { calculateSessionScore } from './scoring.js';
import { showToast, navigateTo } from './ui.js';

/**
 * Ensure SheetJS (window.XLSX) is loaded and ready
 * @returns {Promise<boolean>}
 */
export async function ensureXLSXLoaded() {
  if (window.XLSX) return true;
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="xlsx"]');
    if (existing) {
      if (window.XLSX) return resolve(true);
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => reject(new Error('Failed to load Excel library')));
      setTimeout(() => {
        if (window.XLSX) resolve(true);
        else reject(new Error('Excel export library load timed out'));
      }, 4000);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Failed to load Excel library from CDN'));
    document.head.appendChild(script);
  });
}

/**
 * Calculate the cumulative overall leaderboard up to and including a specific race & session.
 * @param {Object} targetRace - race object { id, round, name, ... }
 * @param {string} targetSessionKey - session key ('quali', 'race', etc.)
 * @param {Object} [currentSessionScoreMap={}] - optional map of userId -> score object for current session
 * @returns {Promise<Array<Object>>} sorted array of player overall standings objects
 */
export async function getCumulativeLeaderboardTillSession(targetRace, targetSessionKey, currentSessionScoreMap = {}) {
  try {
    const [allRaces, allScores, users] = await Promise.all([
      getAllDocuments('races'),
      getAllDocuments('scores'),
      getAllDocuments('users')
    ]);

    allRaces.sort((a, b) => a.round - b.round);

    // Filter out admin users
    const players = (users || []).filter(u => u.id !== ADMIN_UID && !u.isAdmin && u.role !== 'admin');

    // Build list of eligible sessions in chronological order up to targetRace + targetSessionKey
    const targetRound = Number(targetRace.round) || 1;
    const eligibleSessions = [];

    for (const r of allRaces) {
      const rRound = Number(r.round) || 1;
      if (rRound > targetRound) continue;

      const sessions = SESSION_KEYS[r.weekendType] || SESSION_KEYS.standard;
      if (rRound < targetRound) {
        for (const s of sessions) {
          eligibleSessions.push({ raceId: r.id, round: rRound, session: s });
        }
      } else if (rRound === targetRound) {
        const idx = sessions.indexOf(targetSessionKey);
        const cut = idx >= 0 ? sessions.slice(0, idx + 1) : sessions;
        for (const s of cut) {
          eligibleSessions.push({ raceId: r.id, round: rRound, session: s });
        }
      }
    }

    // Build player standings
    const standings = players.map(p => {
      let cumulativeTotal = 0;
      let cumulativeAccuracy = 0;
      let cumulativeBonus = 0;
      let sessionsCount = 0;
      let currentSessionPts = 0;

      for (const es of eligibleSessions) {
        let score = null;
        if (es.raceId === targetRace.id && es.session === targetSessionKey) {
          score = currentSessionScoreMap[p.id] || allScores.find(s => s.userId === p.id && s.raceId === es.raceId && s.session === es.session);
        } else {
          score = allScores.find(s => s.userId === p.id && s.raceId === es.raceId && s.session === es.session);
        }

        if (score && score.totalPoints !== undefined) {
          cumulativeTotal += Number(score.totalPoints || 0);
          cumulativeAccuracy += Number(score.accuracyPoints || 0);
          cumulativeBonus += Number(score.bonusPoints || 0);
          sessionsCount += 1;

          if (es.raceId === targetRace.id && es.session === targetSessionKey) {
            currentSessionPts = Number(score.totalPoints || 0);
          }
        }
      }

      // If no granular session scores were found (e.g. initial fixture or mock where only seasonPoints is set on user),
      // fall back gracefully to user.seasonPoints or current session points
      if (sessionsCount === 0) {
        const currentScore = currentSessionScoreMap[p.id];
        if (currentScore && currentScore.totalPoints !== undefined) {
          cumulativeTotal = Number(currentScore.totalPoints || 0);
          cumulativeAccuracy = Number(currentScore.accuracyPoints || 0);
          cumulativeBonus = Number(currentScore.bonusPoints || 0);
          currentSessionPts = cumulativeTotal;
          sessionsCount = 1;
        } else if (p.seasonPoints !== undefined && p.seasonPoints > 0) {
          cumulativeTotal = Number(p.seasonPoints || 0);
        }
      }

      return {
        userId: p.id,
        displayName: p.displayName || 'Player',
        totalPoints: cumulativeTotal,
        accuracyPoints: cumulativeAccuracy,
        bonusPoints: cumulativeBonus,
        currentSessionPoints: currentSessionPts,
        sessionsCount,
        email: p.email || ''
      };
    });

    // Sort by totalPoints descending, then accuracyPoints descending, then name ascending
    standings.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.accuracyPoints !== a.accuracyPoints) return b.accuracyPoints - a.accuracyPoints;
      return a.displayName.localeCompare(b.displayName);
    });

    // Compute ranks and gap to leader
    const leaderPts = standings[0]?.totalPoints || 0;
    standings.forEach((p, idx) => {
      p.rank = idx + 1;
      p.gap = idx === 0 ? '-' : `-${leaderPts - p.totalPoints}`;
    });

    return standings;
  } catch (err) {
    console.warn('[Export] Error calculating cumulative leaderboard:', err);
    return [];
  }
}

/**
 * Export any session's data (results or predictions) to an Excel (.xlsx) workbook.
 * @param {string|Object} raceOrId - Race document or race ID
 * @param {string} sessionKey - session key ('quali', 'race', 'sprint_quali', 'sprint')
 */
export async function exportSessionToExcel(raceOrId, sessionKey) {
  try {
    await ensureXLSXLoaded();
  } catch (err) {
    console.error('[Export] SheetJS loading error:', err);
    showToast('Excel export library failed to load. Check your internet connection.', 'error');
    return;
  }

  showToast('Preparing Excel export, please wait...', 'info', 2500);

  try {
    // 1. Resolve race data
    let race = typeof raceOrId === 'object' ? raceOrId : await getDocument('races', raceOrId);
    if (!race) {
      showToast('Race data not found for export.', 'error');
      return;
    }

    const raceName = race.name || `Round ${race.round}`;
    const sessionLabel = SESSION_LABELS[sessionKey] || sessionKey.toUpperCase();
    const sessionFullLabel = SESSION_FULL_LABELS[sessionKey] || sessionLabel;

    // 2. Query all predictions for this race and session
    const allPredictions = await queryCollection('predictions', [
      ['raceId', '==', race.id],
      ['session', '==', sessionKey]
    ]);

    // Keep all valid predictions with an order list
    const validPredictions = allPredictions.filter(p => Array.isArray(p.order) && p.order.length > 0);

    // 3. Query official results for this session
    let officialResultOrder = null;
    try {
      const resultDoc = await getDocument('results', `${race.id}_${sessionKey}`);
      if (resultDoc && Array.isArray(resultDoc.order) && resultDoc.order.length > 0) {
        officialResultOrder = resultDoc.order;
      }
    } catch (e) {
      console.warn('[Export] Could not read official result:', e);
    }

    if (validPredictions.length === 0 && !officialResultOrder) {
      showToast(`No predictions or results found for ${raceName} (${sessionFullLabel}).`, 'warning');
      return;
    }

    // 4. Fetch users for names
    const users = await getAllDocuments('users');
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });

    // 5. Query stored scores if results are available
    const scoreMap = {};
    if (officialResultOrder) {
      try {
        const storedScores = await queryCollection('scores', [
          ['raceId', '==', race.id],
          ['session', '==', sessionKey]
        ]);
        storedScores.forEach(s => { scoreMap[s.userId] = s; });
      } catch (e) {
        console.warn('[Export] Could not query stored scores:', e);
      }

      // If scores haven't been stored yet for some predictions, compute on the fly
      validPredictions.forEach(p => {
        if (!scoreMap[p.userId] && p.order.length === 22) {
          const calculated = calculateSessionScore(p.order, officialResultOrder, sessionKey);
          scoreMap[p.userId] = {
            userId: p.userId,
            ...calculated
          };
        }
      });

      // Sort predictions by total score descending
      validPredictions.sort((a, b) => {
        const scoreA = scoreMap[a.userId]?.totalPoints ?? -1;
        const scoreB = scoreMap[b.userId]?.totalPoints ?? -1;
        return scoreB - scoreA;
      });
    } else {
      // Sort predictions alphabetically by player name if no scores yet
      validPredictions.sort((a, b) => {
        const nameA = (userMap[a.userId]?.displayName || 'Unknown').toLowerCase();
        const nameB = (userMap[b.userId]?.displayName || 'Unknown').toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }

    const currentUserId = auth.currentUser?.uid;
    const currentUserPred = validPredictions.find(p => p.userId === currentUserId);
    const canViewOthers = isAdmin() || Boolean(currentUserPred);

    const workbook = window.XLSX.utils.book_new();

    // ==========================================
    // BUILD WORKBOOK: WITH OFFICIAL RESULTS
    // ==========================================
    if (officialResultOrder) {
      // --- SHEET 1: RESULTS & BREAKDOWN ---
      const headers = ["Position", "Official Result"];
      const colWidths = [{ wch: 10 }, { wch: 32 }];

      validPredictions.forEach(p => {
        const userName = userMap[p.userId]?.displayName || 'Player';
        headers.push(`${userName} (Pick)`, `${userName} (Diff)`, `${userName} (Pts)`);
        colWidths.push({ wch: 28 }, { wch: 12 }, { wch: 14 });
      });

      const rows = [
        ["FORMULA 1 PREDICTION LEAGUE — OFFICIAL SESSION CLASSIFICATION"],
        [`Race: Round ${race.round} — ${raceName}`],
        [`Circuit: ${race.circuit || 'N/A'} · ${race.country || ''}`],
        [`Session: ${sessionFullLabel} (${sessionLabel})`],
        [`Status: OFFICIAL RESULTS CONFIRMED`],
        [`Exported: ${new Date().toLocaleString()}`],
        [],
        headers
      ];

      let maxPos = officialResultOrder.length;
      validPredictions.forEach(p => {
        if (p.order && p.order.length > maxPos) maxPos = p.order.length;
      });
      maxPos = Math.max(maxPos, 22);

      for (let i = 0; i < maxPos; i++) {
        const pos = i + 1;
        const actualDriverId = officialResultOrder[i];
        const actualDriver = getDriver(actualDriverId);
        const actualTeam = actualDriver ? getTeamById(actualDriver.team)?.name : '';
        const actualName = actualDriver 
          ? `${actualDriver.code} - ${actualDriver.name}${actualTeam ? ` (${actualTeam})` : ''}` 
          : '-';

        const row = [pos, actualName];

        validPredictions.forEach(p => {
          const isYou = p.userId === currentUserId;
          if (!canViewOthers && !isYou) {
            row.push("[Hidden - Predict to unlock]", "-", 0);
            return;
          }

          const predDriverId = p.order && p.order[i] ? p.order[i] : null;
          const predDriver = getDriver(predDriverId);
          const predName = predDriver ? `${predDriver.code} - ${predDriver.name}` : '-';

          const userScore = scoreMap[p.userId];
          const driverScoreObj = userScore?.driverScores?.find(ds => ds.driverId === predDriverId);

          const diff = driverScoreObj !== undefined ? (driverScoreObj.diff === 0 ? 'Exact (0)' : driverScoreObj.diff) : '-';
          const points = driverScoreObj ? driverScoreObj.points : 0;

          row.push(predName, diff, points);
        });

        rows.push(row);
      }

      rows.push([]);

      // Summary Totals
      const accuracyRow = ["", "Accuracy Points Subtotal"];
      const bonusRow = ["", "Bonus Points Subtotal"];
      const totalRow = ["", "TOTAL POINTS"];
      const rankRow = ["", "Session Rank"];

      // Find unique bonus labels across scored users
      const uniqueBonusLabels = [];
      validPredictions.forEach(p => {
        const userScore = scoreMap[p.userId];
        if (userScore?.bonuses) {
          userScore.bonuses.forEach(b => {
            if (!uniqueBonusLabels.includes(b.label)) {
              uniqueBonusLabels.push(b.label);
            }
          });
        }
      });

      const bonusBreakdownRows = uniqueBonusLabels.map(label => {
        const row = ["", `  ↳ ${label}`];
        validPredictions.forEach(p => {
          const userScore = scoreMap[p.userId];
          let points = 0;
          if (userScore?.bonuses) {
            const b = userScore.bonuses.find(x => x.label === label);
            if (b && b.earned) points = b.points;
          }
          row.push("", "", points);
        });
        return row;
      });

      validPredictions.forEach((p, idx) => {
        const userScore = scoreMap[p.userId];
        accuracyRow.push("", "", userScore ? userScore.accuracyPoints : 0);
        bonusRow.push("", "", userScore ? userScore.bonusPoints : 0);
        totalRow.push("", "", userScore ? userScore.totalPoints : 0);
        rankRow.push("", "", `#${idx + 1}`);
      });

      rows.push(accuracyRow, bonusRow, ...bonusBreakdownRows, totalRow, rankRow);

      const mainSheet = window.XLSX.utils.aoa_to_sheet(rows);
      mainSheet['!cols'] = colWidths;
      window.XLSX.utils.book_append_sheet(workbook, mainSheet, "Results & Breakdown");

      // --- SHEET 2: SESSION LEADERBOARD ---
      const leaderboardRows = [
        ["FORMULA 1 PREDICTION LEAGUE — SESSION LEADERBOARD"],
        [`${raceName} — ${sessionFullLabel}`],
        [],
        ["Rank", "Player", "P1 Pick", "Accuracy Pts", "Bonus Pts", "Total Points"]
      ];

      validPredictions.forEach((p, idx) => {
        const userScore = scoreMap[p.userId];
        const userName = userMap[p.userId]?.displayName || 'Unknown Player';
        const isYou = p.userId === currentUserId;
        const p1Driver = getDriver(p.order?.[0]);
        const p1Name = (!canViewOthers && !isYou) ? "[Hidden]" : (p1Driver ? `${p1Driver.code} - ${p1Driver.name}` : '-');

        leaderboardRows.push([
          idx + 1,
          userName,
          p1Name,
          userScore?.accuracyPoints ?? 0,
          userScore?.bonusPoints ?? 0,
          userScore?.totalPoints ?? 0
        ]);
      });

      const lbSheet = window.XLSX.utils.aoa_to_sheet(leaderboardRows);
      lbSheet['!cols'] = [{ wch: 8 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
      window.XLSX.utils.book_append_sheet(workbook, lbSheet, "Session Leaderboard");

      // --- SHEET 3: OFFICIAL CLASSIFICATION ---
      const officialRows = [
        ["FORMULA 1 PREDICTION LEAGUE — OFFICIAL FINISHING CLASSIFICATION"],
        [`Race: Round ${race.round} — ${raceName}`],
        [`Circuit: ${race.circuit || 'N/A'} · ${race.country || ''}`],
        [`Session: ${sessionFullLabel} (${sessionLabel})`],
        [`Verified Finishing Order (P1–P${officialResultOrder.length})`],
        [],
        ["Position", "No.", "Driver Code", "Driver Name", "Team", "Engine / Power Unit", "Nationality"]
      ];

      officialResultOrder.forEach((driverId, idx) => {
        const driver = getDriver(driverId);
        const team = driver ? getTeamById(driver.team) : null;
        officialRows.push([
          `P${idx + 1}`,
          driver?.number ? `#${driver.number}` : '-',
          driver?.code || driverId,
          driver?.name || driverId,
          team?.name || '-',
          team?.engine || '-',
          driver?.nationality || '-'
        ]);
      });

      const offSheet = window.XLSX.utils.aoa_to_sheet(officialRows);
      offSheet['!cols'] = [{ wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 24 }, { wch: 24 }, { wch: 22 }, { wch: 16 }];
      window.XLSX.utils.book_append_sheet(workbook, offSheet, "Official Classification");

      // --- SHEET 4: OVERALL LEADERBOARD TILL THIS SESSION ---
      const overallStandings = await getCumulativeLeaderboardTillSession(race, sessionKey, scoreMap);
      const overallLeaderboardRows = [
        ["FORMULA 1 PREDICTION LEAGUE — OVERALL CHAMPIONSHIP LEADERBOARD"],
        [`Standings Up to: Round ${race.round} — ${raceName} (${sessionFullLabel})`],
        [`Cutoff: All verified sessions from Round 1 through Round ${race.round} [${sessionLabel}]`],
        [`Exported: ${new Date().toLocaleString()}`],
        [],
        ["Championship Rank", "Player Name", "Cumulative Points", "Cumulative Accuracy Pts", "Cumulative Bonus Pts", "Current Session Pts", "Sessions Scored", "Gap to Leader"]
      ];

      overallStandings.forEach((os) => {
        overallLeaderboardRows.push([
          `#${os.rank}`,
          os.displayName,
          os.totalPoints,
          os.accuracyPoints,
          os.bonusPoints,
          os.currentSessionPoints,
          os.sessionsCount,
          os.gap
        ]);
      });

      const overallSheet = window.XLSX.utils.aoa_to_sheet(overallLeaderboardRows);
      overallSheet['!cols'] = [
        { wch: 18 },
        { wch: 26 },
        { wch: 20 },
        { wch: 24 },
        { wch: 22 },
        { wch: 20 },
        { wch: 16 },
        { wch: 16 }
      ];
      window.XLSX.utils.book_append_sheet(workbook, overallSheet, "Overall Leaderboard");

    } else {
      // ==========================================
      // BUILD WORKBOOK: PREDICTIONS ONLY (RESULTS PENDING)
      // ==========================================
      const headers = ["Position"];
      const colWidths = [{ wch: 10 }];

      validPredictions.forEach(p => {
        const userName = userMap[p.userId]?.displayName || 'Player';
        headers.push(`${userName} Pick`);
        colWidths.push({ wch: 30 });
      });

      const rows = [
        ["FORMULA 1 PREDICTION LEAGUE — SESSION PREDICTIONS EXPORT"],
        [`Race: Round ${race.round} — ${raceName}`],
        [`Circuit: ${race.circuit || 'N/A'} · ${race.country || ''}`],
        [`Session: ${sessionFullLabel} (${sessionLabel})`],
        [`Status: PREDICTIONS RECORD (Results Pending)`],
        [`Total Players: ${validPredictions.length}`],
        [`Exported: ${new Date().toLocaleString()}`],
        [],
        headers
      ];

      let maxPos = 22;
      validPredictions.forEach(p => {
        if (p.order && p.order.length > maxPos) maxPos = p.order.length;
      });

      for (let i = 0; i < maxPos; i++) {
        const pos = i + 1;
        const row = [pos];

        validPredictions.forEach(p => {
          const isYou = p.userId === currentUserId;
          if (!canViewOthers && !isYou) {
            row.push("[Hidden - Predict to unlock]");
            return;
          }

          const driverId = p.order?.[i];
          const driver = getDriver(driverId);
          const team = driver ? getTeamById(driver.team)?.name : '';
          const name = driver ? `${driver.code} - ${driver.name}${team ? ` (${team})` : ''}` : '-';
          row.push(name);
        });

        rows.push(row);
      }

      const predSheet = window.XLSX.utils.aoa_to_sheet(rows);
      predSheet['!cols'] = colWidths;
      window.XLSX.utils.book_append_sheet(workbook, predSheet, "Grid Predictions");

      // Sheet 2: Submission Status
      const subRows = [
        ["FORMULA 1 PREDICTION LEAGUE — PLAYER SUBMISSION DETAILS"],
        [`${raceName} — ${sessionFullLabel}`],
        [],
        ["Player Name", "Status", "P1 Pick", "P2 Pick", "P3 Pick", "Locked At"]
      ];

      validPredictions.forEach(p => {
        const userName = userMap[p.userId]?.displayName || 'Unknown';
        const isLocked = Boolean(p.lockedAt);
        const lockTime = p.lockedAt ? new Date(p.lockedAt).toLocaleString() : 'Not locked';
        const isYou = p.userId === currentUserId;
        const d1 = (!canViewOthers && !isYou) ? "[Hidden]" : (getDriver(p.order?.[0])?.code || '-');
        const d2 = (!canViewOthers && !isYou) ? "[Hidden]" : (getDriver(p.order?.[1])?.code || '-');
        const d3 = (!canViewOthers && !isYou) ? "[Hidden]" : (getDriver(p.order?.[2])?.code || '-');

        subRows.push([
          userName,
          isLocked ? 'Locked' : 'Draft / Open',
          d1,
          d2,
          d3,
          lockTime
        ]);
      });

      const subSheet = window.XLSX.utils.aoa_to_sheet(subRows);
      subSheet['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 22 }];
      window.XLSX.utils.book_append_sheet(workbook, subSheet, "Submissions");

      // Sheet 3: Overall Leaderboard (Prior to this session)
      const overallStandings = await getCumulativeLeaderboardTillSession(race, sessionKey, {});
      const overallLeaderboardRows = [
        ["FORMULA 1 PREDICTION LEAGUE — OVERALL CHAMPIONSHIP LEADERBOARD"],
        [`Cumulative Standings: Prior to Round ${race.round} (${raceName}) — ${sessionFullLabel}`],
        [`Exported: ${new Date().toLocaleString()}`],
        [],
        ["Championship Rank", "Player Name", "Cumulative Points", "Cumulative Accuracy Pts", "Cumulative Bonus Pts", "Sessions Scored", "Gap to Leader"]
      ];

      overallStandings.forEach((os) => {
        overallLeaderboardRows.push([
          `#${os.rank}`,
          os.displayName,
          os.totalPoints,
          os.accuracyPoints,
          os.bonusPoints,
          os.sessionsCount,
          os.gap
        ]);
      });

      const overallSheet = window.XLSX.utils.aoa_to_sheet(overallLeaderboardRows);
      overallSheet['!cols'] = [
        { wch: 18 },
        { wch: 26 },
        { wch: 20 },
        { wch: 24 },
        { wch: 22 },
        { wch: 16 },
        { wch: 16 }
      ];
      window.XLSX.utils.book_append_sheet(workbook, overallSheet, "Overall Leaderboard");
    }

    // 6. Write and trigger file download
    const cleanRaceName = raceName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const suffix = officialResultOrder ? 'Official_Results' : 'Predictions';
    const filename = `${cleanRaceName}_${sessionLabel}_${suffix}.xlsx`;

    window.XLSX.writeFile(workbook, filename);
    if (!canViewOthers) {
      showToast(`Exported "${filename}". Note: Other players' driver picks are hidden because you haven't predicted for this session.`, 'info', 4500);
    } else {
      showToast(`Exported "${filename}" successfully!`, 'success', 3500);
    }

  } catch (err) {
    console.error('[Export] Error during exportSessionToExcel:', err);
    showToast(`Excel export failed: ${err.message || 'Unknown error'}`, 'error');
  }
}

/**
 * Open the interactive Admin Export Modal.
 * Allows the admin to select ANY race and ANY session and immediately download the Excel file.
 * @param {string} [initialRaceId] - optional raceId to pre-select
 * @param {string} [initialSessionKey] - optional session to pre-select
 */
export async function openAdminExportModal(initialRaceId = null, initialSessionKey = null) {
  const container = document.getElementById('modal-container');
  if (!container) return;

  // Load races
  let races = [];
  try {
    races = await getAllDocuments('races');
    races.sort((a, b) => a.round - b.round);
  } catch (e) {
    console.error('[Export Modal] Failed to load races:', e);
    showToast('Failed to load races list', 'error');
    return;
  }

  if (races.length === 0) {
    showToast('No races available in the database.', 'warning');
    return;
  }

  // Determine initial selected race
  let selectedRace = initialRaceId ? races.find(r => r.id === initialRaceId) : null;
  if (!selectedRace) {
    // Default to active race, or latest completed, or first race
    selectedRace = races.find(r => r.status === 'active') ||
                   races.find(r => r.status === 'locked') ||
                   races[0];
  }

  const getSessionsForRace = (race) => {
    return SESSION_KEYS[race.weekendType] || SESSION_KEYS.standard;
  };

  let currentSessions = getSessionsForRace(selectedRace);
  let selectedSession = initialSessionKey && currentSessions.includes(initialSessionKey)
    ? initialSessionKey
    : currentSessions[currentSessions.length - 1]; // Default to main race

  // Render modal HTML
  container.innerHTML = `
    <div class="modal-overlay" id="export-modal-overlay">
      <div class="modal animate-card-enter" style="max-width: 480px;" role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <p class="eyebrow" style="margin-bottom: 2px;">SESSION RESULTS & EXPORT HUB</p>
            <h2 class="modal-title" id="export-modal-title" style="display: flex; align-items: center; gap: 8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--accent);">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="8" y1="13" x2="16" y2="13"></line>
                <line x1="8" y1="17" x2="16" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              Export Session to Excel
            </h2>
          </div>
          <button class="btn btn-icon btn-ghost" id="export-modal-close" aria-label="Close" style="margin-top: -4px;">✕</button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: var(--space-4);">
          <p class="modal-message">
            Download an official Excel (.xlsx) report for any session in the 2026 season. Includes finishing orders, player predictions, accuracy scores, bonus breakdowns, and overall leaderboard till that session.
          </p>

          <div class="form-group">
            <label class="form-label" for="export-race-select" style="font-weight: 600; font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">
              Select Grand Prix
            </label>
            <select class="form-input" id="export-race-select" style="background: var(--bg-surface); cursor: pointer;">
              ${races.map(r => {
                const isSelected = r.id === selectedRace.id;
                const statusStr = (r.status || 'upcoming').toUpperCase();
                return `<option value="${r.id}" ${isSelected ? 'selected' : ''}>
                  Round ${String(r.round).padStart(2, '0')} — ${r.name} [${statusStr}]
                </option>`;
              }).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="export-session-select" style="font-weight: 600; font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">
              Select Session
            </label>
            <select class="form-input" id="export-session-select" style="background: var(--bg-surface); cursor: pointer;">
              ${currentSessions.map(s => {
                const isSelected = s === selectedSession;
                return `<option value="${s}" ${isSelected ? 'selected' : ''}>
                  ${SESSION_FULL_LABELS[s]} (${SESSION_LABELS[s]})
                </option>`;
              }).join('')}
            </select>
          </div>

          <!-- Live Session Info Preview Box -->
          <div id="export-session-preview" style="background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--radius-md); padding: 12px 14px; font-size: var(--text-xs); display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; color: var(--text-secondary);" id="preview-session-name">Checking session status...</span>
              <span class="badge" id="preview-session-badge" style="font-size: 10px; padding: 2px 6px;">Loading</span>
            </div>
            <div style="color: var(--text-muted);" id="preview-session-desc">
              Checking database for predictions and official results...
            </div>
          </div>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: var(--space-3); flex-wrap: wrap;">
          <button class="btn btn-ghost" id="export-modal-cancel">Cancel</button>
          <button class="btn btn-secondary" id="export-modal-view-results" style="display: inline-flex; align-items: center; gap: 6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            View Results
          </button>
          <button class="btn btn-primary" id="export-modal-download" style="display: inline-flex; align-items: center; gap: 6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download Excel (.xlsx)
          </button>
        </div>
      </div>
    </div>
  `;

  container.classList.remove('hidden');

  // Preview updater
  const updateSessionPreview = async () => {
    const raceSelect = document.getElementById('export-race-select');
    const sessionSelect = document.getElementById('export-session-select');
    if (!raceSelect || !sessionSelect) return;

    const rId = raceSelect.value;
    const sKey = sessionSelect.value;
    const currentRaceObj = races.find(r => r.id === rId);

    const nameEl = document.getElementById('preview-session-name');
    const badgeEl = document.getElementById('preview-session-badge');
    const descEl = document.getElementById('preview-session-desc');

    if (!nameEl || !badgeEl || !descEl || !currentRaceObj) return;

    nameEl.textContent = `${currentRaceObj.name} — ${SESSION_FULL_LABELS[sKey] || sKey}`;
    badgeEl.textContent = '...';
    badgeEl.className = 'badge';

    try {
      // Check results
      const resDoc = await getDocument('results', `${rId}_${sKey}`);
      const hasResults = Boolean(resDoc?.order?.length);

      // Check predictions
      const preds = await queryCollection('predictions', [
        ['raceId', '==', rId],
        ['session', '==', sKey]
      ]);

      const isVoided = currentRaceObj.cancelledSessions?.[sKey] === true;
      const isLocked = currentRaceObj.status === 'locked' || currentRaceObj.status === 'completed' || currentRaceObj.sessionLocks?.[sKey] === true;

      if (isVoided) {
        badgeEl.textContent = 'CANCELLED';
        badgeEl.style.background = '#e63946';
        badgeEl.style.color = '#fff';
        descEl.textContent = `This session was cancelled/voided. Predictions: ${preds.length}`;
      } else if (hasResults) {
        badgeEl.textContent = 'RESULTS CONFIRMED';
        badgeEl.style.background = 'var(--status-completed)';
        badgeEl.style.color = '#fff';
        descEl.textContent = `Official classification confirmed. ${preds.length} player prediction(s) scored.`;
      } else if (isLocked) {
        badgeEl.textContent = 'LOCKED';
        badgeEl.style.background = 'var(--status-locked)';
        badgeEl.style.color = '#fff';
        descEl.textContent = `Predictions locked. ${preds.length} player prediction(s) ready for classification.`;
      } else {
        badgeEl.textContent = (currentRaceObj.status || 'UPCOMING').toUpperCase();
        badgeEl.style.background = 'var(--accent)';
        badgeEl.style.color = '#fff';
        descEl.textContent = `Open/Upcoming session. ${preds.length} player prediction(s) submitted so far.`;
      }
    } catch (e) {
      descEl.textContent = 'Unable to preview session status.';
    }
  };

  // Populate sessions dropdown when race changes
  const raceSelectEl = document.getElementById('export-race-select');
  const sessionSelectEl = document.getElementById('export-session-select');

  raceSelectEl?.addEventListener('change', () => {
    const selectedRId = raceSelectEl.value;
    const rObj = races.find(r => r.id === selectedRId);
    if (!rObj) return;

    const newSessions = getSessionsForRace(rObj);
    sessionSelectEl.innerHTML = newSessions.map((s, idx) => {
      return `<option value="${s}" ${idx === newSessions.length - 1 ? 'selected' : ''}>
        ${SESSION_FULL_LABELS[s]} (${SESSION_LABELS[s]})
      </option>`;
    }).join('');

    updateSessionPreview();
  });

  sessionSelectEl?.addEventListener('change', () => {
    updateSessionPreview();
  });

  // Initial preview check
  updateSessionPreview();

  // Close helper
  const closeModal = () => {
    container.classList.add('hidden');
    container.innerHTML = '';
  };

  document.getElementById('export-modal-close')?.addEventListener('click', closeModal);
  document.getElementById('export-modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('export-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'export-modal-overlay') closeModal();
  });

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // Download action
  document.getElementById('export-modal-download')?.addEventListener('click', async () => {
    const rId = raceSelectEl.value;
    const sKey = sessionSelectEl.value;
    const rObj = races.find(r => r.id === rId);

    const downloadBtn = document.getElementById('export-modal-download');
    if (downloadBtn) {
      downloadBtn.disabled = true;
      downloadBtn.innerHTML = `
        <span class="spinner-sm" style="display: inline-block; width: 14px; height: 14px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></span>
        Exporting...
      `;
    }

    try {
      await exportSessionToExcel(rObj, sKey);
    } finally {
      closeModal();
    }
  });

  // View Results action
  document.getElementById('export-modal-view-results')?.addEventListener('click', () => {
    const rId = raceSelectEl.value;
    const sKey = sessionSelectEl.value;
    closeModal();
    navigateTo('results', rId, sKey);
  });
}

export { openAdminExportModal as openExportSessionModal };
