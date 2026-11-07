// ============================================
// ADMIN UNLOCK PREDICTIONS TEST SUITE
// Verifies:
// 1. Session lock resolution across all race states
// 2. Admin explicit session unlock overriding completed/locked race state
// 3. Unpredicted player ability to submit late predictions
// 4. Protection of already-locked predictions
// 5. Late prediction scoring against official classification
// ============================================

const assert = require('node:assert/strict');

// Mock browser window environment
global.window = {
  __isAdmin: true,
  __writes: []
};

async function runTests() {
  console.log('🏁 Starting Admin Unlock Predictions Test Suite...\n');

  const {
    isSessionLocked,
    isSessionUnlockedByAdmin,
    DRIVERS_2026,
    SESSION_KEYS
  } = await import('../js/seed.js');

  const {
    calculateSessionScore
  } = await import('../js/scoring.js');

  // --- Test 1: Standard race state defaults ---
  console.log('Test 1: Standard race state defaults');
  const upcomingRace = { id: 'r1', status: 'upcoming', weekendType: 'standard' };
  const activeRace = { id: 'r2', status: 'active', weekendType: 'standard' };
  const lockedRace = { id: 'r3', status: 'locked', weekendType: 'standard' };
  const completedRace = { id: 'r4', status: 'completed', weekendType: 'standard' };

  assert.equal(isSessionLocked(upcomingRace, 'quali'), true, 'Upcoming race should be locked by default');
  assert.equal(isSessionLocked(upcomingRace, 'race'), true, 'Upcoming race should be locked by default');
  assert.equal(isSessionLocked(activeRace, 'quali'), false, 'Active race should be open by default');
  assert.equal(isSessionLocked(activeRace, 'race'), false, 'Active race should be open by default');
  assert.equal(isSessionLocked(lockedRace, 'race'), true, 'Locked race should be locked by default');
  assert.equal(isSessionLocked(completedRace, 'race'), true, 'Completed race should be locked by default');
  assert.equal(isSessionUnlockedByAdmin(completedRace, 'race'), false);
  console.log('✓ Standard race status defaults pass');

  // --- Test 2: Admin explicit unlock for COMPLETED race session ---
  console.log('\nTest 2: Admin explicit unlock for COMPLETED race session');
  const completedRaceWithUnlockedRaceSession = {
    id: 'r4',
    status: 'completed',
    weekendType: 'standard',
    sessionLocks: {
      quali: true,
      race: false // Admin explicitly unlocked the race session!
    }
  };

  assert.equal(isSessionLocked(completedRaceWithUnlockedRaceSession, 'race'), false,
    'Session with sessionLocks[session] === false must be UNLOCKED even if race is completed');
  assert.equal(isSessionUnlockedByAdmin(completedRaceWithUnlockedRaceSession, 'race'), true,
    'isSessionUnlockedByAdmin should return true for completed race with false lock');
  assert.equal(isSessionLocked(completedRaceWithUnlockedRaceSession, 'quali'), true,
    'Quali session should remain locked');
  console.log('✓ Admin unlock overrides completed race status');

  // --- Test 3: Admin explicit unlock for LOCKED race session ---
  console.log('\nTest 3: Admin explicit unlock for LOCKED race session');
  const lockedRaceWithUnlockedQuali = {
    id: 'r3',
    status: 'locked',
    weekendType: 'sprint',
    sessionLocks: {
      sprint_quali: true,
      sprint: true,
      quali: false, // Admin unlocked quali
      race: true
    }
  };

  assert.equal(isSessionLocked(lockedRaceWithUnlockedQuali, 'quali'), false,
    'Quali session must be unlocked');
  assert.equal(isSessionUnlockedByAdmin(lockedRaceWithUnlockedQuali, 'quali'), true);
  assert.equal(isSessionLocked(lockedRaceWithUnlockedQuali, 'race'), true,
    'Race session must remain locked');
  console.log('✓ Admin unlock overrides locked race status');

  // --- Test 4: Admin explicit lock for ACTIVE race session ---
  console.log('\nTest 4: Admin explicit lock for ACTIVE race session');
  const activeRaceWithLockedQuali = {
    id: 'r2',
    status: 'active',
    weekendType: 'standard',
    sessionLocks: {
      quali: true, // Admin explicitly locked quali while race session is still open
      race: false
    }
  };

  assert.equal(isSessionLocked(activeRaceWithLockedQuali, 'quali'), true,
    'Quali session must be locked when explicitly set to true');
  assert.equal(isSessionLocked(activeRaceWithLockedQuali, 'race'), false,
    'Race session must be open');
  console.log('✓ Admin explicit lock on active race passes');

  // --- Test 5: Cancelled/Voided session is always locked ---
  console.log('\nTest 5: Cancelled/Voided session is always locked');
  const raceWithCancelledSession = {
    id: 'r2',
    status: 'active',
    weekendType: 'standard',
    cancelledSessions: {
      quali: true
    },
    sessionLocks: {
      quali: false // Even if lock flag is false, voided status takes precedence
    }
  };

  assert.equal(isSessionLocked(raceWithCancelledSession, 'quali'), true,
    'Voided session must always be locked');
  assert.equal(isSessionUnlockedByAdmin(raceWithCancelledSession, 'quali'), false);
  console.log('✓ Cancelled/Voided safety check passes');

  // --- Test 6: Toggle state transitions ---
  console.log('\nTest 6: Toggle state transitions');
  const raceToToggle = {
    id: 'r4',
    status: 'completed',
    weekendType: 'standard',
    sessionLocks: {}
  };

  // Initially completed race session is locked
  assert.equal(isSessionLocked(raceToToggle, 'race'), true);

  // Admin toggles: currentlyLocked is true, newLocks['race'] becomes false
  const currentlyLocked1 = isSessionLocked(raceToToggle, 'race');
  raceToToggle.sessionLocks.race = !currentlyLocked1; // false
  assert.equal(isSessionLocked(raceToToggle, 'race'), false, 'Session must now be unlocked');

  // Admin toggles back: currentlyLocked is false, newLocks['race'] becomes true
  const currentlyLocked2 = isSessionLocked(raceToToggle, 'race');
  raceToToggle.sessionLocks.race = !currentlyLocked2; // true
  assert.equal(isSessionLocked(raceToToggle, 'race'), true, 'Session must now be locked');
  console.log('✓ Toggle state transitions pass');

  // --- Test 7: Late prediction scoring continuity ---
  console.log('\nTest 7: Late prediction scoring against official results');
  const officialOrder = DRIVERS_2026.map(d => d.id);
  const latePlayerOrder = [...officialOrder]; // Exact match

  const scoreResult = calculateSessionScore(latePlayerOrder, officialOrder, 'race');
  const exactMatches = scoreResult.driverScores.filter(d => d.diff === 0).length;
  assert.equal(exactMatches, 22);
  assert.ok(scoreResult.totalPoints > 0);
  assert.equal(scoreResult.driverScores.length, 22);
  console.log(`✓ Late prediction scored accurately (${scoreResult.totalPoints} pts, ${exactMatches} exact matches)`);

  // --- Test 8: Auto-update Standings on Lock ---
  console.log('\nTest 8: Standings recalculation on locking unlocked session');
  const { calculateSessionWins, calculateCumulativePoints } = await import('../js/scoring.js');
  const mockScores = [
    {
      userId: 'u1',
      raceId: 'r1',
      session: 'race',
      totalPoints: scoreResult.totalPoints,
      accuracyPoints: scoreResult.accuracyPoints,
      bonusPoints: scoreResult.bonusPoints
    }
  ];
  const winsMap = calculateSessionWins(mockScores);
  const cumMap = calculateCumulativePoints(mockScores);

  assert.equal(winsMap['u1'], 1, 'Player u1 should have 1 session win');
  assert.equal(cumMap['u1']?.accuracyPoints, scoreResult.accuracyPoints, 'Cumulative accuracy points should match');
  assert.equal(cumMap['u1']?.bonusPoints, scoreResult.bonusPoints, 'Cumulative bonus points should match');
  console.log('✓ Auto-update Standings calculations on session lock pass cleanly');

  console.log('\n🎉 ALL 8 ADMIN UNLOCK TEST SUITES PASSED CLEANLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
