import * as admin from 'firebase-admin';

const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.FIREBASE_CONFIG && JSON.parse(process.env.FIREBASE_CONFIG).projectId;

const defaultBucket =
  // allow override via env for prod if you set FIREBASE_STORAGE_BUCKET
  process.env.FIREBASE_STORAGE_BUCKET ||
  (projectId ? `${projectId}.appspot.com` : undefined);

// Initialize Firebase Admin (suppress unused warning)
// @ts-ignore - app variable needed for initialization
const app = admin.apps[0] ?? admin.initializeApp({
  // explicit bucket is important; emulator will still intercept via FIREBASE_STORAGE_EMULATOR_HOST
  storageBucket: defaultBucket,
});

export const db = admin.firestore();
export const storage = admin.storage();
export const FieldValue = admin.firestore.FieldValue;
