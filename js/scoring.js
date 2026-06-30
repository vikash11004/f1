// ============================================
// F1 PREDICTION LEAGUE — SCORING
// Pure functions — no Firebase dependency
// Race · Sprint · Quali · Sprint Quali scoring
// ============================================

/**
 * Accuracy points table for Race & Sprint sessions
 * Maps position difference to points
 */
const RACE_SPRINT_POINTS = {
  0: 20,  // Exact
  1: 15,  // Off by 1
  2: 10,  // Off by 2
  3: 7,   // Off by 3
  4: 5,   // Off by 4
  5: 3,   // Off by 5
};

/**
 * Accuracy points table for Qualifying & Sprint Qualifying sessions
 * Maps position difference to points
 */
const QUALI_POINTS = {
  0: 15,  // Exact
  1: 10,  // Off by 1
  2: 7,   // Off by 2
  3: 5,   // Off by 3
  4: 3,   // Off by 4
  5: 1,   // Off by 5
};

/**
 * Bonus conditions for Race & Sprint sessions
 */
const BONUS_CONDITIONS = [
  {
    id: 'p1_correct',
    label: 'P1 Correct',
    points: 20,
    check: (predicted, actual) => predicted[0] === actual[0]
  },
  {
    id: 'top3_any',
    label: 'Top 3 (Any Order)',
    points: 20,
    check: (predicted, actual) => {
      const predTop3 = predicted.slice(0, 3);
      const actualTop3 = actual.slice(0, 3);
      return predTop3.every(d => actualTop3.includes(d));
    }
  },
  {
    id: 'top3_exact',
    label: 'Top 3 (Exact Order)',
    points: 40,
    check: (predicted, actual) =>
      predicted[0] === actual[0] &&
      predicted[1] === actual[1] &&
      predicted[2] === actual[2]
  },
  {
    id: 'top5_any',
    label: 'Top 5 (Any Order)',
    points: 30,
    check: (predicted, actual) => {
      const predTop5 = predicted.slice(0, 5);
      const actualTop5 = actual.slice(0, 5);
      return predTop5.every(d => actualTop5.includes(d));
    }
  },
  {
    id: 'top5_exact',
    label: 'Top 5 (Exact Order)',
    points: 60,
    check: (predicted, actual) =>
      predicted.slice(0, 5).every((d, i) => d === actual[i])
  },
  {
    id: 'perfect',
    label: 'Perfect Prediction (P1–P22)',
    points: 500,
    check: (predicted, actual) =>
      predicted.every((d, i) => d === actual[i])
  }
];

/**
 * Determine if a session type uses race/sprint scoring or quali scoring
 * @param {string} sessionType - "race" | "sprint" | "quali" | "sprint_quali"
 * @returns {boolean} true if race/sprint type (has bonuses)
 */
function isRaceType(sessionType) {
  return sessionType === 'race' || sessionType === 'sprint';
}

/**
 * Get the points for a given position difference
 * @param {number} diff - absolute position difference
 * @param {string} sessionType - session type
 * @returns {number} points earned
 */
function getPointsForDiff(diff, sessionType) {
  const table = isRaceType(sessionType) ? RACE_SPRINT_POINTS : QUALI_POINTS;
  return table[diff] !== undefined ? table[diff] : 0;
}

/**
 * Calculate the score for a single session prediction
 * 
 * @param {Array<string>} predicted - array of 22 driver IDs in predicted order
 * @param {Array<string>} actual - array of 22 driver IDs in actual finishing order
 * @param {string} sessionType - "race" | "sprint" | "quali" | "sprint_quali"
 * @returns {Object} {
 *   totalPoints: number,
 *   accuracyPoints: number,
 *   bonusPoints: number,
 *   driverScores: Array<{ driverId, predictedPos, actualPos, diff, points }>,
 *   bonuses: Array<{ id, label, points, earned }>
 * }
 */
function calculateSessionScore(predicted, actual, sessionType) {
  if (!predicted || !actual || predicted.length !== 22 || actual.length !== 22) {
    return {
      totalPoints: 0,
      accuracyPoints: 0,
      bonusPoints: 0,
      driverScores: [],
      bonuses: []
    };
  }

  // Build position lookup for actual results: driverId -> position (0-indexed)
  const actualPositionMap = {};
  actual.forEach((driverId, index) => {
    actualPositionMap[driverId] = index;
  });

  // Calculate per-driver accuracy points
  let accuracyPoints = 0;
  const driverScores = predicted.map((driverId, predictedIndex) => {
    const actualIndex = actualPositionMap[driverId];
    const diff = actualIndex !== undefined ? Math.abs(predictedIndex - actualIndex) : 22;
    const points = getPointsForDiff(diff, sessionType);
    accuracyPoints += points;

    return {
      driverId,
      predictedPos: predictedIndex + 1,  // 1-indexed for display
      actualPos: actualIndex !== undefined ? actualIndex + 1 : '-',
      diff,
      points
    };
  });

  // Calculate bonuses (now applies to all session types)
  let bonusPoints = 0;
  const bonuses = [];

  for (const bonus of BONUS_CONDITIONS) {
    const earned = bonus.check(predicted, actual);
    if (earned) {
      bonusPoints += bonus.points;
    }
    bonuses.push({
      id: bonus.id,
      label: bonus.label,
      points: bonus.points,
      earned
    });
  }

  return {
    totalPoints: accuracyPoints + bonusPoints,
    accuracyPoints,
    bonusPoints,
    driverScores,
    bonuses
  };
}

/**
 * Calculate total weekend score from multiple session scores
 * @param {Array<Object>} sessionScores - array of calculateSessionScore results
 * @returns {number} total weekend points
 */
function calculateWeekendTotal(sessionScores) {
  return sessionScores.reduce((sum, s) => sum + (s?.totalPoints || 0), 0);
}

/**
 * Get theoretical maximum points for a weekend type
 * @param {string} weekendType - "standard" | "sprint"
 * @returns {Object} { maxBase, maxWithBonuses, maxPerfect }
 */
function getMaxPoints(weekendType) {
  const raceBase = 22 * 20;     // 440 per race-type session
  const qualiBase = 22 * 15;    // 330 per quali-type session
  const bonusPerSession = 20 + 20 + 40 + 30 + 60;  // 170 (without perfect)
  const perfectBonus = 500;
  const totalBonusPerSession = bonusPerSession + perfectBonus; // 670

  if (weekendType === 'sprint') {
    return {
      maxBase: (raceBase * 2) + (qualiBase * 2),           // 1540
      maxWithBonuses: (raceBase * 2) + (qualiBase * 2) + (bonusPerSession * 4),  // 2220
      maxPerfect: (raceBase * 2) + (qualiBase * 2) + (totalBonusPerSession * 4)  // 4220
    };
  }

  // Standard weekend
  return {
    maxBase: raceBase + qualiBase,                          // 770
    maxWithBonuses: raceBase + qualiBase + (bonusPerSession * 2),  // 1110
    maxPerfect: raceBase + qualiBase + (totalBonusPerSession * 2)  // 2110
  };
}

/**
 * Get session type label for scoring purposes
 * @param {string} sessionKey 
 * @returns {string} human-readable session name
 */
function getSessionTypeLabel(sessionKey) {
  const labels = {
    sprint_quali: 'Sprint Qualifying',
    sprint: 'Sprint',
    quali: 'Qualifying',
    race: 'Race'
  };
  return labels[sessionKey] || sessionKey;
}

/**
 * Sort driver scores by actual position for display
 * @param {Array} driverScores 
 * @returns {Array} sorted by actual position
 */
function sortByActualPosition(driverScores) {
  return [...driverScores].sort((a, b) => {
    if (a.actualPos === '-') return 1;
    if (b.actualPos === '-') return -1;
    return a.actualPos - b.actualPos;
  });
}

/**
 * Calculate accuracy percentage
 * @param {number} score - actual score
 * @param {number} maxScore - maximum possible score
 * @returns {number} percentage 0-100
 */
function calculateAccuracy(score, maxScore) {
  if (maxScore === 0) return 0;
  return Math.round((score / maxScore) * 100);
}

// --- Exports ---
export {
  RACE_SPRINT_POINTS,
  QUALI_POINTS,
  BONUS_CONDITIONS,
  isRaceType,
  getPointsForDiff,
  calculateSessionScore,
  calculateWeekendTotal,
  getMaxPoints,
  getSessionTypeLabel,
  sortByActualPosition,
  calculateAccuracy
};
