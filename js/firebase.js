// ============================================
// F1 PREDICTION LEAGUE — FIREBASE
// Init · Auth · Firestore Helpers · Admin Check
// ============================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  writeBatch,
  onSnapshot,
  serverTimestamp,
  increment
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyC2ZzcN0DlM10jmUZSK6z_TW-CT1jrY7ZI",
  authDomain: "f1-prediction-e3cbd.firebaseapp.com",
  projectId: "f1-prediction-e3cbd",
  storageBucket: "f1-prediction-e3cbd.firebasestorage.app",
  messagingSenderId: "1021978957222",
  appId: "1:1021978957222:web:b9714b5fcb5b39415eab67",
  measurementId: "G-EJBYMG49ZX"
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Admin Configuration ---
// REPLACE with the Firebase UID of your admin account
const ADMIN_UID = "HI5xCVYecISuzRVSdJAb6aHcuHe2";

/**
 * Check if the currently logged-in user is the admin
 */
function isAdmin() {
  return auth.currentUser?.uid === ADMIN_UID;
}

// --- Firestore Helper Functions ---

/**
 * Get a single document by path
 * @param {string} collectionName 
 * @param {string} docId 
 * @returns {Promise<Object|null>}
 */
async function getDocument(collectionName, docId) {
  const docRef = doc(db, collectionName, docId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return null;
}

/**
 * Set a document (create or overwrite)
 * @param {string} collectionName 
 * @param {string} docId 
 * @param {Object} data 
 * @param {boolean} merge - if true, merge with existing
 */
async function setDocument(collectionName, docId, data, merge = false) {
  const docRef = doc(db, collectionName, docId);
  await setDoc(docRef, data, { merge });
}

/**
 * Update specific fields on a document
 * @param {string} collectionName 
 * @param {string} docId 
 * @param {Object} data 
 */
async function updateDocument(collectionName, docId, data) {
  const docRef = doc(db, collectionName, docId);
  await updateDoc(docRef, data);
}

/**
 * Delete a document
 * @param {string} collectionName 
 * @param {string} docId 
 */
async function deleteDocument(collectionName, docId) {
  const docRef = doc(db, collectionName, docId);
  await deleteDoc(docRef);
}

/**
 * Query a collection with optional filters
 * @param {string} collectionName 
 * @param {Array} filters - array of [field, operator, value]
 * @param {Object} options - { orderByField, orderDirection, limitCount }
 * @returns {Promise<Array>}
 */
async function queryCollection(collectionName, filters = [], options = {}) {
  let q = collection(db, collectionName);
  const constraints = [];

  for (const [field, operator, value] of filters) {
    constraints.push(where(field, operator, value));
  }

  if (options.orderByField) {
    constraints.push(orderBy(options.orderByField, options.orderDirection || 'asc'));
  }

  if (options.limitCount) {
    constraints.push(limit(options.limitCount));
  }

  q = query(q, ...constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Get all documents from a collection
 * @param {string} collectionName 
 * @returns {Promise<Array>}
 */
async function getAllDocuments(collectionName) {
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Listen to a collection in real-time
 * @param {string} collectionName 
 * @param {Function} callback 
 * @param {Array} filters 
 * @param {Object} options
 * @returns {Function} unsubscribe function
 */
function listenToCollection(collectionName, callback, filters = [], options = {}) {
  let q = collection(db, collectionName);
  const constraints = [];

  for (const [field, operator, value] of filters) {
    constraints.push(where(field, operator, value));
  }

  if (options.orderByField) {
    constraints.push(orderBy(options.orderByField, options.orderDirection || 'asc'));
  }

  if (options.limitCount) {
    constraints.push(limit(options.limitCount));
  }

  q = query(q, ...constraints);
  return onSnapshot(q, (snapshot) => {
    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(docs);
  });
}

/**
 * Listen to a single document in real-time
 * @param {string} collectionName 
 * @param {string} docId 
 * @param {Function} callback 
 * @returns {Function} unsubscribe function
 */
function listenToDocument(collectionName, docId, callback) {
  const docRef = doc(db, collectionName, docId);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback({ id: docSnap.id, ...docSnap.data() });
    } else {
      callback(null);
    }
  });
}

/**
 * Create a write batch
 * @returns {WriteBatch}
 */
function createBatch() {
  return writeBatch(db);
}

/**
 * Get a document reference (for batch operations)
 * @param {string} collectionName 
 * @param {string} docId 
 */
function getDocRef(collectionName, docId) {
  return doc(db, collectionName, docId);
}

// --- Exports ---
export {
  app,
  auth,
  db,
  ADMIN_UID,
  isAdmin,
  // Auth functions
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  // Firestore helpers
  getDocument,
  setDocument,
  updateDocument,
  deleteDocument,
  queryCollection,
  getAllDocuments,
  listenToCollection,
  listenToDocument,
  createBatch,
  getDocRef,
  // Firestore utilities
  serverTimestamp,
  increment,
  doc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  writeBatch,
  onSnapshot,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc
};
