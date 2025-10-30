// functions/src/admin.ts
import * as admin from 'firebase-admin';

export const app = admin.apps.length ? admin.app() : admin.initializeApp();

export const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

export const auth = admin.auth();
export const storage = admin.storage();

// Export commonly used helpers
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;
