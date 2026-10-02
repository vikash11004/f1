const path = require('path');
const fs = require('fs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(keyPath)) {
  console.error('\n❌ ERROR: Service account key not found!');
  console.error(`Looked at path: ${keyPath}`);
  console.error('To run safely without keeping keys in your git repository:');
  console.error('  Set FIREBASE_SERVICE_ACCOUNT_KEY environment variable to the path of your key, e.g.:');
  console.error('    $env:FIREBASE_SERVICE_ACCOUNT_KEY="C:\\path\\to\\serviceAccountKey.json"; node reset-user.js ...');
  console.error('  Or place serviceAccountKey.json in this directory (ensure it is NOT committed to git).\n');
  process.exit(1);
}

const serviceAccount = require(keyPath);

const app = initializeApp({
  credential: cert(serviceAccount)
});

const auth = getAuth(app);
const db = getFirestore(app);

// Take arguments from command line:
// Usage: node reset-user.js <UID_OR_EMAIL> <NEW_PASSWORD> [NEW_EMAIL]
const identifier = process.argv[2];
const newPassword = process.argv[3];
const newEmail = process.argv[4];

if (!identifier || !newPassword) {
  console.log('\nUsage: node reset-user.js <USER_UID_OR_EMAIL> <NEW_PASSWORD> [OPTIONAL_NEW_EMAIL]');
  console.log('Examples:');
  console.log('  node reset-user.js USER_UID_HERE NewPassword123!');
  console.log('  node reset-user.js mistyped@gmial.com NewPassword123! realuser@gmail.com\n');
  process.exit(1);
}

async function main() {
  try {
    let uid = identifier;

    // If identifier is an email address, look up user by email
    if (identifier.includes('@')) {
      const userRecord = await auth.getUserByEmail(identifier);
      uid = userRecord.uid;
      console.log(`Found user record for ${identifier} (UID: ${uid})`);
    }

    const updateParams = { password: newPassword };
    if (newEmail) {
      updateParams.email = newEmail;
    }

    await auth.updateUser(uid, updateParams);

    console.log('\n✅ SUCCESS!');
    console.log(`User (UID: ${uid}) updated:`);
    console.log(`  • New Password: ${newPassword}`);

    if (newEmail) {
      console.log(`  • New Email:    ${newEmail}`);

      // Sync updated email with Firestore users collection
      await db.collection('users').doc(uid).update({ email: newEmail }).catch(() => {});
      console.log(`  • Updated Firestore user document as well.`);
    }

    console.log('\nGive this new password to your user so they can sign in!\n');
  } catch (err) {
    console.error('\n❌ ERROR:', err.message, '\n');
  }
}

main();
