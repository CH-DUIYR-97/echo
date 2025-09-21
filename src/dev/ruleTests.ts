// src/dev/ruleTests.ts
import { auth, db, storage } from '../lib/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  doc, setDoc, updateDoc, serverTimestamp, getDoc, // already added
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

// ---------- helpers ----------

// Sign in if the user exists; otherwise create then sign in.
// Keeps emulator data stable across repeated runs.
async function ensureUser(email: string, password = 'passw0rd!') {
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e: any) {
    if (e?.code === 'auth/user-not-found') {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      throw e;
    }
  }
  return auth.currentUser!.uid;
}

// ✨ ADDED: handy console helper so you can sign in on demand
export async function signInDev(email = 'alice@test.dev', password = 'passw0rd!') {
  return ensureUser(email, password);
}

// Clear PASS/FAIL semantics for the console output
function expectAllow(name: string, p: Promise<unknown>) {                  // ✨ CHANGED: typed Promise<unknown>
  return p
    .then(() => console.log(`✅ ${name}`))
    .catch(err => console.log(`❌ ${name}:`, err?.code || err?.message || err));
}
function expectDeny(name: string, p: Promise<unknown>) {                    // ✨ CHANGED: typed Promise<unknown>
  return p
    .then(() => console.log(`❌ ${name}: unexpectedly allowed`))
    .catch(err => console.log(`✅ ${name} (denied as expected):`, err?.code || err?.message || err));
}

// Only the server should create STT docs (rules block client). For the harness,
// we check if the doc exists and skip feedback tests if it doesn't.
async function sttDocExists(uid: string, postId: string, sttId: string) {
  const sttRef = doc(db, `users/${uid}/posts/${postId}/stt/${sttId}`);     // ✨ CHANGED: rename local var to sttRef (avoid shadowing storage.ref)
  const snap = await getDoc(sttRef);
  return snap.exists();
}

// ---------- main test runner ----------

export async function runAll() {
  const aliceUid = await ensureUser('alice@test.dev');
  const bobUid   = await ensureUser('bob@test.dev');

  // Make sure subsequent ops run as Alice
  await ensureUser('alice@test.dev');

  const postId = 'p1';
  const sttId  = 't1';

  // 1) Owner can create their post
  await expectAllow('alice can create own post', setDoc(
    doc(db, `users/${aliceUid}/posts/${postId}`),
    {
      userId: aliceUid,
      meta:    { createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      content: { text: 'hi' },
      media:   [],
      usage:   { uploadedBytes: 0 },
      flags:   { archived: false }
    }
  ));

  // 2) Cross-user write is blocked
  await expectDeny('alice cannot write bob post', setDoc(
    doc(db, `users/${bobUid}/posts/x`),
    { userId: bobUid }
  ));

  // 3) Update allowed if userId unchanged
  await expectAllow('alice can update own post (no userId change)', updateDoc(
    doc(db, `users/${aliceUid}/posts/${postId}`),
    { 'content.text': 'updated' }
  ));

  // 4) Changing userId is denied
  await expectDeny('alice cannot change userId', updateDoc(
    doc(db, `users/${aliceUid}/posts/${postId}`),
    { userId: 'hacker' }
  ));

  // 5) Client cannot write usage doc
  const day = '2025-09-19'; // any id is fine; rule denies client writes
  await expectDeny('client cannot write usage doc', setDoc(
    doc(db, `users/${aliceUid}/usage/${day}`),
    { uploadedBytes: 10, sttSeconds: 0 }
  ));

  // 6) Feedback: create once allowed, duplicate denied (ONLY if STT exists)
  if (await sttDocExists(aliceUid, postId, sttId)) {
    await expectAllow('feedback create once', setDoc(
      doc(db, `users/${aliceUid}/posts/${postId}/stt/${sttId}/feedback/${aliceUid}`),
      { rating: 'up', createdAt: serverTimestamp() }
    ));
    await expectDeny('feedback duplicate denied', setDoc(
      doc(db, `users/${aliceUid}/posts/${postId}/stt/${sttId}/feedback/${aliceUid}`),
      { rating: 'down', createdAt: serverTimestamp() }
    ));
  } else {
    console.warn(
      'ℹ️ STT doc missing; seed once in Emulator UI at',
      `users/${aliceUid}/posts/${postId}/stt/${sttId}`,
      'to run feedback tests.'
    );
  }

  // 7) Storage: JPEG allowed, text/plain denied
  const okBlob  = new Blob(['a'],    { type: 'image/jpeg' });
  const badBlob = new Blob(['text'], { type: 'text/plain' });

  await expectAllow('upload jpeg allowed', uploadBytes(
    ref(storage, `users/${aliceUid}/posts/${postId}/ok.jpg`),
    okBlob, { contentType: 'image/jpeg' }
  ));
  await expectDeny('upload text denied', uploadBytes(
    ref(storage, `users/${aliceUid}/posts/${postId}/bad.txt`),
    badBlob, { contentType: 'text/plain' }
  ));
}

/** ---------- Optional: audio-specific tests (call from console) ---------- **/

// ✅ Allowed only if you've added the audio-under-stt rule in storage.rules
export async function testAudioAllowed() {
  const uid = auth.currentUser?.uid ?? await ensureUser('alice@test.dev');  // ✨ CHANGED: auto-ensure sign-in
  const blob = new Blob(['a'], { type: 'audio/webm' });
  await uploadBytes(
    ref(storage, `users/${uid}/stt/t1/test.webm`),
    blob,
    { contentType: 'audio/webm' }
  );
  return 'audio under stt allowed';
}

// ❌ Denied: audio outside stt/** (with audio rule enabled)
export async function testAudioDeniedWrongPath() {
  const uid = auth.currentUser?.uid ?? await ensureUser('alice@test.dev');  // ✨ CHANGED: auto-ensure sign-in
  const blob = new Blob(['a'], { type: 'audio/webm' });
  try {
    await uploadBytes(
      ref(storage, `users/${uid}/posts/p1/clip.webm`),
      blob,
      { contentType: 'audio/webm' }
    );
    return '❌ unexpectedly allowed';
  } catch (e: any) {
    return `✅ denied as expected: ${e.code || e.message}`;
  }
}

// ❌ Denied: missing contentType
export async function testAudioDeniedNoMime() {
  const uid = auth.currentUser?.uid ?? await ensureUser('alice@test.dev');  // ✨ CHANGED: auto-ensure sign-in
  try {
    await uploadBytes(
      ref(storage, `users/${uid}/stt/t1/bad`),
      new Blob(['a']) // no MIME; should be denied by rules
    );
    return '❌ unexpectedly allowed';
  } catch (e: any) {
    return `✅ denied as expected: ${e.code || e.message}`;
  }
}