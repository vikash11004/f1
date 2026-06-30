// ============================================
// F1 PREDICTION LEAGUE — SEED DATA
// Teams · Drivers · Calendar · First-run Seeder
// ============================================

import {
  db,
  getAllDocuments,
  createBatch,
  getDocRef
} from './firebase.js';

// --- 2026 Teams (11 teams) ---
const TEAMS_2026 = [
  { id: "mclaren",       name: "McLaren",         color: "#FF8000", engine: "Mercedes" },
  { id: "mercedes",      name: "Mercedes",         color: "#00D2BE", engine: "Mercedes" },
  { id: "red_bull",      name: "Red Bull Racing",  color: "#3671C6", engine: "Honda RBPT" },
  { id: "ferrari",       name: "Ferrari",          color: "#E8002D", engine: "Ferrari" },
  { id: "williams",      name: "Williams",         color: "#005AFF", engine: "Mercedes" },
  { id: "racing_bulls",  name: "Racing Bulls",     color: "#6692FF", engine: "Honda RBPT" },
  { id: "aston_martin",  name: "Aston Martin",     color: "#358C75", engine: "Honda" },
  { id: "haas",          name: "Haas",             color: "#B6BABD", engine: "Ferrari" },
  { id: "audi",          name: "Audi",             color: "#B0B0B0", engine: "Audi" },
  { id: "alpine",        name: "Alpine",           color: "#0093CC", engine: "Mercedes" },
  { id: "cadillac",      name: "Cadillac",         color: "#CC1E4A", engine: "Ferrari" },
];

// --- 2026 Drivers (22 drivers) ---
const DRIVERS_2026 = [
  // McLaren
  { id: "nor", name: "Lando Norris",         code: "NOR", number: 1,  team: "mclaren",      nationality: "British",        flag: "🇬🇧" },
  { id: "pia", name: "Oscar Piastri",        code: "PIA", number: 81, team: "mclaren",      nationality: "Australian",     flag: "🇦🇺" },
  // Mercedes
  { id: "rus", name: "George Russell",       code: "RUS", number: 63, team: "mercedes",     nationality: "British",        flag: "🇬🇧" },
  { id: "ant", name: "Kimi Antonelli",       code: "ANT", number: 12, team: "mercedes",     nationality: "Italian",        flag: "🇮🇹" },
  // Red Bull Racing
  { id: "ver", name: "Max Verstappen",       code: "VER", number: 3,  team: "red_bull",     nationality: "Dutch",          flag: "🇳🇱" },
  { id: "had", name: "Isack Hadjar",         code: "HAD", number: 6,  team: "red_bull",     nationality: "French",         flag: "🇫🇷" },
  // Ferrari
  { id: "lec", name: "Charles Leclerc",      code: "LEC", number: 16, team: "ferrari",      nationality: "Monégasque",     flag: "🇲🇨" },
  { id: "ham", name: "Lewis Hamilton",       code: "HAM", number: 44, team: "ferrari",      nationality: "British",        flag: "🇬🇧" },
  // Williams
  { id: "alb", name: "Alexander Albon",      code: "ALB", number: 23, team: "williams",     nationality: "Thai",           flag: "🇹🇭" },
  { id: "sai", name: "Carlos Sainz",         code: "SAI", number: 55, team: "williams",     nationality: "Spanish",        flag: "🇪🇸" },
  // Racing Bulls
  { id: "lin", name: "Arvid Lindblad",       code: "LIN", number: 41, team: "racing_bulls", nationality: "British",        flag: "🇬🇧" },
  { id: "law", name: "Liam Lawson",          code: "LAW", number: 30, team: "racing_bulls", nationality: "New Zealander",  flag: "🇳🇿" },
  // Aston Martin
  { id: "str", name: "Lance Stroll",         code: "STR", number: 18, team: "aston_martin", nationality: "Canadian",       flag: "🇨🇦" },
  { id: "alo", name: "Fernando Alonso",      code: "ALO", number: 14, team: "aston_martin", nationality: "Spanish",        flag: "🇪🇸" },
  // Haas
  { id: "oco", name: "Esteban Ocon",         code: "OCO", number: 31, team: "haas",         nationality: "French",         flag: "🇫🇷" },
  { id: "bea", name: "Oliver Bearman",       code: "BEA", number: 87, team: "haas",         nationality: "British",        flag: "🇬🇧" },
  // Audi
  { id: "hul", name: "Nico Hülkenberg",      code: "HUL", number: 27, team: "audi",         nationality: "German",         flag: "🇩🇪" },
  { id: "bor", name: "Gabriel Bortoleto",    code: "BOR", number: 5,  team: "audi",         nationality: "Brazilian",      flag: "🇧🇷" },
  // Alpine
  { id: "gas", name: "Pierre Gasly",         code: "GAS", number: 10, team: "alpine",       nationality: "French",         flag: "🇫🇷" },
  { id: "col", name: "Franco Colapinto",     code: "COL", number: 43, team: "alpine",       nationality: "Argentine",      flag: "🇦🇷" },
  // Cadillac
  { id: "per", name: "Sergio Pérez",         code: "PER", number: 11, team: "cadillac",     nationality: "Mexican",        flag: "🇲🇽" },
  { id: "bot", name: "Valtteri Bottas",      code: "BOT", number: 77, team: "cadillac",     nationality: "Finnish",        flag: "🇫🇮" },
];

// --- 2026 Race Calendar (22 rounds) ---
const CALENDAR_2026 = [
  { round: 1,  name: "Australian Grand Prix",         circuit: "Albert Park",                    country: "Australia",    flag: "🇦🇺", sprint: false, dates: { weekend: "6–8 Mar 2026",       race: "2026-03-08" } },
  { round: 2,  name: "Chinese Grand Prix",            circuit: "Shanghai International",         country: "China",        flag: "🇨🇳", sprint: true,  dates: { weekend: "13–15 Mar 2026",      race: "2026-03-15" } },
  { round: 3,  name: "Japanese Grand Prix",           circuit: "Suzuka",                         country: "Japan",        flag: "🇯🇵", sprint: false, dates: { weekend: "27–29 Mar 2026",      race: "2026-03-29" } },
  { round: 4,  name: "Miami Grand Prix",              circuit: "Miami International",            country: "USA",          flag: "🇺🇸", sprint: true,  dates: { weekend: "1–3 May 2026",        race: "2026-05-03" } },
  { round: 5,  name: "Canadian Grand Prix",           circuit: "Circuit Gilles Villeneuve",      country: "Canada",       flag: "🇨🇦", sprint: true,  dates: { weekend: "22–24 May 2026",      race: "2026-05-24" } },
  { round: 6,  name: "Monaco Grand Prix",             circuit: "Circuit de Monaco",              country: "Monaco",       flag: "🇲🇨", sprint: false, dates: { weekend: "5–7 Jun 2026",        race: "2026-06-07" } },
  { round: 7,  name: "Barcelona-Catalunya Grand Prix", circuit: "Circuit de Barcelona-Catalunya", country: "Spain",       flag: "🇪🇸", sprint: false, dates: { weekend: "12–14 Jun 2026",      race: "2026-06-14" } },
  { round: 8,  name: "Austrian Grand Prix",           circuit: "Red Bull Ring",                  country: "Austria",      flag: "🇦🇹", sprint: false, dates: { weekend: "26–28 Jun 2026",      race: "2026-06-28" } },
  { round: 9,  name: "British Grand Prix",            circuit: "Silverstone",                    country: "UK",           flag: "🇬🇧", sprint: true,  dates: { weekend: "3–5 Jul 2026",        race: "2026-07-05" } },
  { round: 10, name: "Belgian Grand Prix",            circuit: "Spa-Francorchamps",              country: "Belgium",      flag: "🇧🇪", sprint: false, dates: { weekend: "17–19 Jul 2026",      race: "2026-07-19" } },
  { round: 11, name: "Hungarian Grand Prix",          circuit: "Hungaroring",                    country: "Hungary",      flag: "🇭🇺", sprint: false, dates: { weekend: "24–26 Jul 2026",      race: "2026-07-26" } },
  { round: 12, name: "Dutch Grand Prix",              circuit: "Zandvoort",                      country: "Netherlands",  flag: "🇳🇱", sprint: true,  dates: { weekend: "21–23 Aug 2026",      race: "2026-08-23" } },
  { round: 13, name: "Italian Grand Prix",            circuit: "Monza",                          country: "Italy",        flag: "🇮🇹", sprint: false, dates: { weekend: "4–6 Sep 2026",        race: "2026-09-06" } },
  { round: 14, name: "Madrid Grand Prix",             circuit: "Circuito Urbano de Madrid",      country: "Spain",        flag: "🇪🇸", sprint: false, dates: { weekend: "11–13 Sep 2026",      race: "2026-09-13" } },
  { round: 15, name: "Azerbaijan Grand Prix",         circuit: "Baku City Circuit",              country: "Azerbaijan",   flag: "🇦🇿", sprint: false, dates: { weekend: "24–26 Sep 2026",      race: "2026-09-26" } },
  { round: 16, name: "Singapore Grand Prix",          circuit: "Marina Bay Street Circuit",      country: "Singapore",    flag: "🇸🇬", sprint: true,  dates: { weekend: "9–11 Oct 2026",       race: "2026-10-11" } },
  { round: 17, name: "United States Grand Prix",      circuit: "Circuit of the Americas",        country: "USA",          flag: "🇺🇸", sprint: false, dates: { weekend: "23–25 Oct 2026",      race: "2026-10-25" } },
  { round: 18, name: "Mexico City Grand Prix",        circuit: "Autódromo Hermanos Rodríguez",   country: "Mexico",       flag: "🇲🇽", sprint: false, dates: { weekend: "30 Oct–1 Nov 2026",   race: "2026-11-01" } },
  { round: 19, name: "São Paulo Grand Prix",          circuit: "Autódromo José Carlos Pace",     country: "Brazil",       flag: "🇧🇷", sprint: false, dates: { weekend: "6–8 Nov 2026",        race: "2026-11-08" } },
  { round: 20, name: "Las Vegas Grand Prix",          circuit: "Las Vegas Strip Circuit",        country: "USA",          flag: "🇺🇸", sprint: false, dates: { weekend: "19–21 Nov 2026",      race: "2026-11-21" } },
  { round: 21, name: "Qatar Grand Prix",              circuit: "Lusail International",           country: "Qatar",        flag: "🇶🇦", sprint: false, dates: { weekend: "27–29 Nov 2026",      race: "2026-11-29" } },
  { round: 22, name: "Abu Dhabi Grand Prix",          circuit: "Yas Marina",                     country: "UAE",          flag: "🇦🇪", sprint: false, dates: { weekend: "4–6 Dec 2026",        race: "2026-12-06" } },
];

// --- Session keys per weekend type ---
const SESSION_KEYS = {
  standard: ['quali', 'race'],
  sprint: ['sprint_quali', 'sprint', 'quali', 'race']
};

const SESSION_LABELS = {
  sprint_quali: 'SQ',
  sprint: 'SPRINT',
  quali: 'QUALI',
  race: 'RACE'
};

const SESSION_FULL_LABELS = {
  sprint_quali: 'Sprint Qualifying',
  sprint: 'Sprint',
  quali: 'Qualifying',
  race: 'Race'
};

/**
 * Get the team color map for quick lookups
 * @returns {Object} teamId -> color hex
 */
function getTeamColorMap() {
  const map = {};
  for (const team of TEAMS_2026) {
    map[team.id] = team.color;
  }
  return map;
}

/**
 * Get team data by ID
 * @param {string} teamId 
 * @returns {Object|undefined}
 */
function getTeamById(teamId) {
  return TEAMS_2026.find(t => t.id === teamId);
}

/**
 * Get driver data by ID
 * @param {string} driverId 
 * @returns {Object|undefined}
 */
function getDriverById(driverId) {
  return DRIVERS_2026.find(d => d.id === driverId);
}

/**
 * Seed all 2026 data into Firestore on first run.
 * Checks if data already exists before writing.
 */
async function seedData() {
  try {
    // Check if data already exists
    const existingDrivers = await getAllDocuments('drivers');
    if (existingDrivers.length > 0) {
      console.log('[Seed] Data already exists — skipping seed.');
      return false;
    }

    console.log('[Seed] First run detected — seeding 2026 data...');

    // Firestore batch has a limit of 500 operations
    // We have 11 teams + 22 drivers + 22 races = 55 operations — well within limit
    const batch = createBatch();

    // Seed teams
    for (const team of TEAMS_2026) {
      const ref = getDocRef('teams', team.id);
      batch.set(ref, {
        name: team.name,
        color: team.color,
        engine: team.engine
      });
    }
    console.log(`[Seed] Queued ${TEAMS_2026.length} teams`);

    // Seed drivers
    for (const driver of DRIVERS_2026) {
      const ref = getDocRef('drivers', driver.id);
      batch.set(ref, {
        name: driver.name,
        code: driver.code,
        number: driver.number,
        team: driver.team,
        nationality: driver.nationality,
        flag: driver.flag,
        photoUrl: '' // fallback to initials
      });
    }
    console.log(`[Seed] Queued ${DRIVERS_2026.length} drivers`);

    // Seed races
    for (const race of CALENDAR_2026) {
      const raceId = `r${String(race.round).padStart(2, '0')}`;
      const ref = getDocRef('races', raceId);
      batch.set(ref, {
        name: race.name,
        circuit: race.circuit,
        country: race.country,
        countryFlag: race.flag,
        round: race.round,
        weekendType: race.sprint ? 'sprint' : 'standard',
        startDate: race.dates.weekend,
        raceDate: race.dates.race,
        status: 'upcoming'
      });
    }
    console.log(`[Seed] Queued ${CALENDAR_2026.length} races`);

    // Commit batch
    await batch.commit();
    console.log('[Seed] ✓ All 2026 data seeded successfully!');
    return true;

  } catch (error) {
    console.error('[Seed] Error seeding data:', error);
    throw error;
  }
}

// --- Exports ---
export {
  TEAMS_2026,
  DRIVERS_2026,
  CALENDAR_2026,
  SESSION_KEYS,
  SESSION_LABELS,
  SESSION_FULL_LABELS,
  getTeamColorMap,
  getTeamById,
  getDriverById,
  seedData
};

// --- TEMP ADMIN RESET ---
export async function adminReset() {
  const { getAllDocuments, deleteDocument, updateDocument, ADMIN_UID } = await import('./firebase.js');
  console.log('Starting full database reset...');
  
  const results = await getAllDocuments('results');
  for (const r of results) await deleteDocument('results', r.id);
  console.log(`Deleted ${results.length} results.`);

  const scores = await getAllDocuments('scores');
  for (const s of scores) await deleteDocument('scores', s.id);
  console.log(`Deleted ${scores.length} scores.`);

  const predictions = await getAllDocuments('predictions');
  for (const p of predictions) await deleteDocument('predictions', p.id);
  console.log(`Deleted ${predictions.length} predictions.`);

  const users = await getAllDocuments('users');
  for (const u of users) {
    if (u.id !== ADMIN_UID) {
      await deleteDocument('users', u.id);
    } else {
      await updateDocument('users', u.id, { seasonPoints: 0, lastEventScore: 0 });
    }
  }
  console.log(`Deleted non-admin users and reset Admin points.`);

  const races = await getAllDocuments('races');
  for (const r of races) {
    await updateDocument('races', r.id, { status: 'upcoming' });
  }
  console.log(`Reset ${races.length} races to upcoming.`);

  console.log('Reset complete! Please refresh the page.');
}
window.adminReset = adminReset;
