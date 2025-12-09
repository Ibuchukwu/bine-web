import admin from "firebase-admin";

// Ensure only one initialization happens
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (err) {
    console.error("🔥 Firebase Admin failed to initialize:", err);
    throw err; // ⛔ CRITICAL: Don't silently fail
  }
}

// ✅ Export only if admin is safely initialized
const auth = admin.auth();
const db = admin.firestore();

export { admin, auth, db };
