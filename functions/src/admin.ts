// functions/src/admin.ts
import * as admin from 'firebase-admin';

let app: admin.app.App;

if (!admin.apps.length) {
  // Try to read FIREBASE_CONFIG (set automatically in Cloud Functions)
  const firebaseConfig = process.env.FIREBASE_CONFIG
    ? JSON.parse(process.env.FIREBASE_CONFIG)
    : undefined;

  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    firebaseConfig?.storageBucket || // <-- use the real bucket from config
    undefined;

  app = admin.initializeApp({
    storageBucket,
  });
} else {
  app = admin.app();
}

export const db = admin.firestore(app);
export const storage = admin.storage(app);
export const FieldValue = admin.firestore.FieldValue;