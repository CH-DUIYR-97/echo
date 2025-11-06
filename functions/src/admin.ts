// functions/src/admin.ts
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const projectId =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  (process.env.FIREBASE_CONFIG &&
    JSON.parse(process.env.FIREBASE_CONFIG).projectId);

const defaultBucket =
  process.env.FIREBASE_STORAGE_BUCKET ||
  (projectId ? `${projectId}.appspot.com` : undefined);

// Ensure we only init once (emulator reload safety)
const app = getApps().length
  ? getApp()
  : initializeApp({
      storageBucket: defaultBucket,
    });

export const db = getFirestore(app);
export const storage = getStorage(app);
export { FieldValue };