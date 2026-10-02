// Browser-only Firebase substitute. This file is never imported by the application.
const users = [
  {
    id: 'u1',
    displayName: 'Alex Morgan',
    email: 'alex@example.test',
    seasonPoints: 348,
    lastEventScore: 46,
    wins: 3,
  },
  {
    id: 'u2',
    displayName: 'Jordan Lee',
    email: 'jordan@example.test',
    seasonPoints: 312,
    lastEventScore: 38,
    wins: 2,
  },
  {
    id: 'u3',
    displayName: 'Sam Rivera',
    email: 'sam@example.test',
    seasonPoints: 298,
    lastEventScore: 41,
    wins: 1,
  },
  {
    id: 'u4',
    displayName: 'Jamie Chen',
    email: 'jamie@example.test',
    seasonPoints: 274,
    lastEventScore: 32,
    wins: 1,
  },
];
const races = [
  {
    id: 'r1',
    round: 1,
    name: 'Australian Grand Prix',
    circuit: 'Albert Park Circuit',
    country: 'Australia',
    countryFlag: '🇦🇺',
    startDate: '06 – 08 MAR',
    raceDate: '2026-03-08T05:00:00Z',
    weekendType: 'standard',
    status: 'completed',
  },
  {
    id: 'r2',
    round: 2,
    name: 'Chinese Grand Prix',
    circuit: 'Shanghai International Circuit',
    country: 'China',
    countryFlag: '🇨🇳',
    startDate: '13 – 15 MAR',
    raceDate: '2026-03-15T07:00:00Z',
    weekendType: 'sprint',
    status: 'completed',
  },
  {
    id: 'r3',
    round: 3,
    name: 'Japanese Grand Prix',
    circuit: 'Suzuka International Racing Course',
    country: 'Japan',
    countryFlag: '🇯🇵',
    startDate: '27 – 29 MAR',
    raceDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    weekendType: 'standard',
    status: 'active',
  },
  {
    id: 'r4',
    round: 4,
    name: 'Bahrain Grand Prix',
    circuit: 'Bahrain International Circuit',
    country: 'Bahrain',
    countryFlag: '🇧🇭',
    startDate: '10 – 12 APR',
    raceDate: '2027-04-12T15:00:00Z',
    weekendType: 'standard',
    status: 'upcoming',
  },
  {
    id: 'r5',
    round: 5,
    name: 'Saudi Arabian Grand Prix',
    circuit: 'Jeddah Corniche Circuit',
    country: 'Saudi Arabia',
    countryFlag: '🇸🇦',
    startDate: '17 – 19 APR',
    raceDate: '2027-04-19T15:00:00Z',
    weekendType: 'standard',
    status: 'upcoming',
  },
];
const data = {
  users,
  races,
  drivers: [{ id: 'existing' }],
  predictions: [],
  results: [],
  scores: [],
};
export const app = {},
  db = {},
  ADMIN_UID = 'admin',
  auth = {
    currentUser: window.__signedIn
      ? { uid: 'u1', email: 'alex@example.test', displayName: 'Alex Morgan' }
      : null,
  };
let authListener;
export const isAdmin = () => false;
export const onAuthStateChanged = (a, fn) => {
  authListener = fn;
  queueMicrotask(() => fn(auth.currentUser));
  return () => {};
};
export const signInWithEmailAndPassword = async () => {
  auth.currentUser = {
    uid: 'u1',
    email: 'alex@example.test',
    displayName: 'Alex Morgan',
  };
  await authListener(auth.currentUser);
  return { user: auth.currentUser };
};
export const createUserWithEmailAndPassword = signInWithEmailAndPassword;
export const signOut = async () => {
  auth.currentUser = null;
  await authListener(null);
};
export const updateProfile = async (u, d) => Object.assign(u, d);
export const getAllDocuments = async (c) => data[c] || [];
export const getDocument = async (c, id) =>
  (data[c] || []).find((d) => d.id === id) || null;
export const queryCollection = async (c, filters = []) =>
  (data[c] || []).filter((d) => filters.every(([k, op, v]) => d[k] === v));
export const setDocument = async (c, id, d) => {
  window.__writes.push({ c, id, d });
  data[c] ??= [];
  const current = data[c].find((x) => x.id === id);
  if (current) Object.assign(current, d);
  else data[c].push({ id, ...d });
};
export const updateDocument = setDocument;
export const deleteDocument = async () => {};
export const listenToCollection = (c, fn) => {
  queueMicrotask(() => fn(data[c] || []));
  return () => {};
};
export const listenToDocument = () => () => {};
export const createBatch = () => ({ set() {}, commit: async () => {} });
export const getDocRef = () => ({});
export const serverTimestamp = () => Date.now();
export const increment = (n) => n;
export const doc = () => ({}),
  collection = () => ({}),
  query = () => ({}),
  where = () => ({}),
  orderBy = () => ({}),
  limit = () => ({});
export const getDocs = async () => ({ docs: [] }),
  writeBatch = createBatch;
export const onSnapshot = (q, fn) => {
  queueMicrotask(() => fn({ docs: [], docChanges: () => [] }));
  return () => {};
};
export const getDoc = async () => ({ exists: () => false }),
  setDoc = async () => {},
  addDoc = async () => {},
  updateDoc = async () => {},
  deleteDoc = async () => {};
