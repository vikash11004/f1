// ============================================
// DRIVER REPLACEMENT UNIT & INTEGRATION TESTS
// Tests weekend replacement, season replacement,
// scoring continuity, card rendering, and validation.
// ============================================

const assert = require('node:assert/strict');

// Mock browser environment for modules that check window
global.window = {
  __isAdmin: true,
  __writes: []
};

async function runTests() {
  console.log('🏁 Starting Driver Replacement Test Suite...\n');

  // Dynamically import ESM modules
  const {
    getDriver,
    getAllDriversSorted,
    setRaceDriverContext,
    clearRaceDriverContext,
    getRaceReplacements,
    renderDriverCard,
    getDriverInitials
  } = await import('../js/drivers.js');

  const {
    DRIVERS_2026,
    TEAMS_2026
  } = await import('../js/seed.js');

  const {
    applyDriverReplacement,
    removeDriverReplacement,
    NATIONALITY_OPTIONS
  } = await import('../js/driver-replacement.js');

  const {
    calculateSessionScore
  } = await import('../js/scoring.js');

  const firebase = await import('../js/firebase.js');

  // --- Test 1: Baseline driver data ---
  console.log('Test 1: Standard driver lookup without replacements');
  clearRaceDriverContext();
  const originalSainz = getDriver('sai');
  assert.equal(originalSainz.name, 'Carlos Sainz');
  assert.equal(originalSainz.code, 'SAI');
  assert.equal(originalSainz.number, 55);
  assert.equal(originalSainz.team, 'williams');
  assert.equal(originalSainz.isReplacement, undefined);
  console.log('✓ Standard driver lookup passes');

  // --- Test 2: Specific race weekend replacement ---
  console.log('\nTest 2: Specific race weekend replacement');
  const raceWithSub = {
    id: 'r02',
    round: 2,
    name: 'Chinese Grand Prix',
    driverReplacements: {
      sai: {
        originalDriverId: 'sai',
        name: 'Oliver Bearman',
        code: 'BEA',
        number: 38,
        nationality: 'British',
        flag: '🇬🇧',
        team: 'williams',
        scope: 'weekend',
        notes: 'Appendicitis'
      }
    }
  };

  const raceWithoutSub = {
    id: 'r03',
    round: 3,
    name: 'Japanese Grand Prix'
  };

  // Explicit race parameter
  const subDriver = getDriver('sai', raceWithSub);
  assert.equal(subDriver.id, 'sai', 'Slot ID must be preserved');
  assert.equal(subDriver.name, 'Oliver Bearman');
  assert.equal(subDriver.code, 'BEA');
  assert.equal(subDriver.number, 38);
  assert.equal(subDriver.team, 'williams');
  assert.equal(subDriver.isReplacement, true);
  assert.equal(subDriver.originalName, 'Carlos Sainz');
  assert.equal(subDriver.originalCode, 'SAI');
  assert.equal(subDriver.originalNumber, 55);

  // Other race without sub must still return Carlos Sainz
  const driverNextRace = getDriver('sai', raceWithoutSub);
  assert.equal(driverNextRace.name, 'Carlos Sainz');
  assert.equal(driverNextRace.code, 'SAI');
  assert.equal(driverNextRace.isReplacement, undefined);
  console.log('✓ Weekend replacement isolated to target race passes');

  // --- Test 3: Active race context ---
  console.log('\nTest 3: Active race context propagation');
  setRaceDriverContext(raceWithSub);
  const contextSub = getDriver('sai');
  assert.equal(contextSub.name, 'Oliver Bearman');
  assert.equal(contextSub.isReplacement, true);

  clearRaceDriverContext();
  const revertedContext = getDriver('sai');
  assert.equal(revertedContext.name, 'Carlos Sainz');
  console.log('✓ Race context set & clear passes');

  // --- Test 4: getAllDriversSorted with replacement ---
  console.log('\nTest 4: getAllDriversSorted grid consistency');
  const allDriversStandard = getAllDriversSorted(raceWithoutSub);
  assert.equal(allDriversStandard.length, 22, 'Grid must have 22 drivers');
  assert.ok(allDriversStandard.some(d => d.name === 'Carlos Sainz'));
  assert.ok(!allDriversStandard.some(d => d.name === 'Oliver Bearman' && d.team === 'williams'));

  const allDriversWithSub = getAllDriversSorted(raceWithSub);
  assert.equal(allDriversWithSub.length, 22, 'Grid with substitution must still have 22 drivers');
  assert.ok(allDriversWithSub.some(d => d.name === 'Oliver Bearman' && d.team === 'williams'));
  assert.ok(!allDriversWithSub.some(d => d.name === 'Carlos Sainz'));
  console.log('✓ Grid maintains exactly 22 drivers with sub swapped into team seat');

  // --- Test 5: getRaceReplacements helper ---
  console.log('\nTest 5: getRaceReplacements helper');
  const reps = getRaceReplacements(raceWithSub);
  assert.equal(reps.length, 1);
  assert.equal(reps[0].driverId, 'sai');
  assert.equal(reps[0].originalDriver.name, 'Carlos Sainz');
  assert.equal(reps[0].replacement.name, 'Oliver Bearman');
  assert.equal(reps[0].team.name, 'Williams');

  assert.equal(getRaceReplacements(raceWithoutSub).length, 0);
  console.log('✓ getRaceReplacements helper passes');

  // --- Test 6: Driver Card Component Rendering ---
  console.log('\nTest 6: Driver card component rendering');
  const standardCardHTML = renderDriverCard(originalSainz, { position: 4 });
  assert.ok(standardCardHTML.includes('SAI'));
  assert.ok(standardCardHTML.includes('Carlos Sainz'));
  assert.ok(!standardCardHTML.includes('is-substitute'));
  assert.ok(!standardCardHTML.includes('class="driver-card-sub"'));

  const subCardHTML = renderDriverCard(subDriver, { position: 4 });
  assert.ok(subCardHTML.includes('BEA'));
  assert.ok(subCardHTML.includes('Oliver Bearman'));
  assert.ok(subCardHTML.includes('is-substitute'));
  assert.ok(subCardHTML.includes('class="driver-card-sub"'));
  assert.ok(subCardHTML.includes('SUB'));
  assert.ok(subCardHTML.includes('Substituting for Carlos Sainz'));
  assert.equal(getDriverInitials(subDriver.name), 'OB');
  console.log('✓ Driver card renders replacement name, code, avatar initials and SUB badge');

  // --- Test 7: Predictions & Scoring Continuity ---
  console.log('\nTest 7: Predictions & scoring continuity');
  // Suppose player predicted 'sai' in P4 before replacement happened
  const playerOrder = ['nor', 'ver', 'lec', 'sai', 'rus'];
  const otherDrivers = DRIVERS_2026.map(d => d.id).filter(id => !playerOrder.includes(id));
  const fullPlayerOrder = [...playerOrder, ...otherDrivers];

  // Official race result: Bearman (in Sainz seat 'sai') finishes P4
  const officialOrder = [...fullPlayerOrder];

  const scoreResult = calculateSessionScore(fullPlayerOrder, officialOrder, 'race');
  assert.equal(scoreResult.accuracyPoints, 440); // 22 exact matches * 20
  const sainzScore = scoreResult.driverScores.find(ds => ds.driverId === 'sai');
  assert.equal(sainzScore.predictedPos, 4);
  assert.equal(sainzScore.actualPos, 4);
  assert.equal(sainzScore.diff, 0);
  assert.equal(sainzScore.points, 20);
  console.log('✓ Existing predictions score 100% accurately with replacement driver');

  // --- Test 8: Mock Firestore applyDriverReplacement for scopes ---
  console.log('\nTest 8: applyDriverReplacement Firestore scope logic');

  // Retrieve initial races from fixture
  let allRaces = await firebase.getAllDocuments('races');
  assert.ok(allRaces.length >= 5, 'Fixture should have at least 5 races');

  // Test 8A: Scope 'weekend' on Round 2
  const r2 = allRaces.find(r => r.round === 2);
  const weekendResult = await applyDriverReplacement({
    race: r2,
    originalDriverId: 'sai',
    replacementData: {
      name: 'Oliver Bearman',
      code: 'BEA',
      number: 38,
      nationality: 'British',
      flag: '🇬🇧',
      notes: 'Appendicitis'
    },
    scope: 'weekend'
  });

  assert.equal(weekendResult.affectedCount, 1);
  allRaces = await firebase.getAllDocuments('races');
  assert.equal(allRaces.find(r => r.round === 1).driverReplacements?.sai, undefined, 'Round 1 untouched');
  assert.equal(allRaces.find(r => r.round === 2).driverReplacements?.sai?.name, 'Oliver Bearman', 'Round 2 updated');
  assert.equal(allRaces.find(r => r.round === 3).driverReplacements?.sai, undefined, 'Round 3 untouched');
  console.log('✓ Weekend scope: affects only target race');

  // Test 8B: Revert weekend replacement
  const revertWeekendResult = await removeDriverReplacement({
    race: allRaces.find(r => r.round === 2),
    originalDriverId: 'sai',
    scope: 'weekend'
  });
  assert.equal(revertWeekendResult.affectedCount, 1);
  allRaces = await firebase.getAllDocuments('races');
  assert.equal(allRaces.find(r => r.round === 2).driverReplacements?.sai, undefined, 'Round 2 reverted');
  console.log('✓ Weekend revert: restores original driver');

  // Test 8C: Scope 'rest_of_season' starting at Round 3
  const r3 = allRaces.find(r => r.round === 3);
  const restOfSeasonResult = await applyDriverReplacement({
    race: r3,
    originalDriverId: 'sai',
    replacementData: {
      name: 'Liam Lawson',
      code: 'LAW',
      number: 30,
      nationality: 'New Zealander',
      flag: '🇳🇿',
      notes: 'Mid-season driver swap'
    },
    scope: 'rest_of_season'
  });

  const remainingRacesCount = allRaces.filter(r => r.round >= 3).length;
  assert.equal(restOfSeasonResult.affectedCount, remainingRacesCount);
  allRaces = await firebase.getAllDocuments('races');
  assert.equal(allRaces.find(r => r.round === 1).driverReplacements?.sai, undefined, 'Round 1 unaffected');
  assert.equal(allRaces.find(r => r.round === 2).driverReplacements?.sai, undefined, 'Round 2 unaffected');
  assert.equal(allRaces.find(r => r.round === 3).driverReplacements?.sai?.name, 'Liam Lawson', 'Round 3 replaced');
  assert.equal(allRaces.find(r => r.round === 4).driverReplacements?.sai?.name, 'Liam Lawson', 'Round 4 replaced');
  assert.equal(allRaces.find(r => r.round === 5).driverReplacements?.sai?.name, 'Liam Lawson', 'Round 5 replaced');
  console.log('✓ Rest of season scope: affects from target round onwards');

  // Test 8D: Revert 'rest_of_season' from Round 4
  const r4 = allRaces.find(r => r.round === 4);
  await removeDriverReplacement({
    race: r4,
    originalDriverId: 'sai',
    scope: 'rest_of_season'
  });
  allRaces = await firebase.getAllDocuments('races');
  assert.equal(allRaces.find(r => r.round === 3).driverReplacements?.sai?.name, 'Liam Lawson', 'Round 3 still Lawson');
  assert.equal(allRaces.find(r => r.round === 4).driverReplacements?.sai, undefined, 'Round 4 restored');
  assert.equal(allRaces.find(r => r.round === 5).driverReplacements?.sai, undefined, 'Round 5 restored');
  console.log('✓ Rest of season revert: restores from target round onwards');

  // Test 8E: Scope 'all_season'
  const r1 = allRaces.find(r => r.round === 1);
  const allSeasonResult = await applyDriverReplacement({
    race: r1,
    originalDriverId: 'alb',
    replacementData: {
      name: 'Mick Schumacher',
      code: 'MSC',
      number: 47,
      nationality: 'German',
      flag: '🇩🇪'
    },
    scope: 'all_season'
  });
  allRaces = await firebase.getAllDocuments('races');
  assert.equal(allSeasonResult.affectedCount, allRaces.length);
  for (const r of allRaces) {
    assert.equal(r.driverReplacements?.alb?.name, 'Mick Schumacher', `Race ${r.name} updated`);
  }
  console.log('✓ All season scope: affects all races');

  // --- Test 9: Security & Authorization Check ---
  console.log('\nTest 9: Admin-only security enforcement');
  global.window.__isAdmin = false; // simulate regular user
  await assert.rejects(
    async () => {
      await applyDriverReplacement({
        race: allRaces[0],
        originalDriverId: 'sai',
        replacementData: { name: 'Hacker', code: 'HCK', number: 99 },
        scope: 'weekend'
      });
    },
    /Access Denied/
  );

  await assert.rejects(
    async () => {
      await removeDriverReplacement({
        race: allRaces[0],
        originalDriverId: 'sai',
        scope: 'weekend'
      });
    },
    /Access Denied/
  );
  console.log('✓ Non-admin access strictly denied');
  global.window.__isAdmin = true;

  // --- Test 10: Nationalities dropdown options validation ---
  console.log('\nTest 10: Nationalities dropdown list validation');
  assert.ok(NATIONALITY_OPTIONS.length >= 35, 'Must have at least 35 nationalities');
  for (const opt of NATIONALITY_OPTIONS) {
    assert.ok(opt.nationality && opt.nationality.length >= 3, `Nationality ${opt.nationality} must be valid`);
    assert.ok(opt.flag && opt.flag.length >= 1, `Flag for ${opt.nationality} must be present`);
  }
  const british = NATIONALITY_OPTIONS.find(o => o.nationality === 'British');
  assert.equal(british.flag, '🇬🇧');
  const australian = NATIONALITY_OPTIONS.find(o => o.nationality === 'Australian');
  assert.equal(australian.flag, '🇦🇺');
  console.log(`✓ All ${NATIONALITY_OPTIONS.length} nationality & flag options verified`);

  console.log('\n🎉 ALL 10 TEST SUITES PASSED CLEANLY!\n');
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
