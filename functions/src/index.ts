// functions/src/index.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db, storage, FieldValue } from './admin';

const REGION = 'australia-southeast1';

// ── STT guardrails ────────────────────────────────────────────────────────────
const MAX_STT_SECONDS = 1200;                 // 20 minutes
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;     // 25 MB

// 🎯 DEBUG TOGGLES
const DEBUG_TRANSCRIBE = process.env.ECHO_DEBUG_TRANSCRIBE === '1';
const STRICT_HALLUCINATION_BLOCK = process.env.ECHO_HALLUCINATION_STRICT === '1'; // prod: true

// ── UX messages (module scope) ────────────────────────────────────────────────
const MSG_TOO_BRIEF =
  '🎤 Recording too brief. Please speak for a longer duration for better accuracy.';
const MSG_NO_SPEECH =
  '🎤 No clear speech detected. Please try again.';

// ── STT constants (module scope) ──────────────────────────────────────────────
const MAX_TEXT_CHARS = 8000;
const ALLOWED_BASE = new Set([
  'audio/webm','audio/ogg','audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/m4a'
]);

// ── Hallucination heuristics (HOISTED) ────────────────────────────────────────
const EXACT_SHORT_PHRASES = new Set([
  'thank you','thanks','thanks for watching','hello','hi','hey',
  'bye','goodbye','ok','okay','yes','no','like and subscribe','subscribe'
]);

const TOKEN_SUSPECTS = new Set([
  'um','uh','hmm','er','ah','you','the','a','i','ok','okay','yeah','yes','no'
]);

const CREATOR_PATTERNS = [
  /\blike and subscribe\b/i,
  /\bplease subscribe\b/i,
  /\bdon'?t forget to (?:subscribe|like)\b/i,
  /\bhit the (?:like|subscribe|bell)\b/i,
  /\bthanks for (?:watching|listening)\b/i,
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitizeBase64(s: string): string {
  if (!s) return s;
  const i = s.indexOf(',');
  return s.startsWith('data:') && i > 0 ? s.slice(i + 1) : s;
}

// Conservative detector
function detectHallucination(raw: string): { matched: boolean; rule?: string } {
  if (!raw || raw.trim().length === 0) return { matched: true, rule: 'empty' };
  const normalized = raw.trim();

  if (/^[\W_]+$/.test(normalized) && normalized.length < 6) {
    return { matched: true, rule: 'nonverbal_garbage' };
  }
  if (/\b(inaudible|music|background noise)\b/i.test(normalized)) {
    return { matched: true, rule: 'placeholder_label' };
  }
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(normalized)) {
    return { matched: true, rule: 'timestamp_only' };
  }
  // Allow short valid tokens like "yep"/"ok"/"sure" — but not alpha soup
  if (/[A-Za-z]/.test(normalized) && normalized.length >= 3 && !/^[a-z]{3,}$/.test(normalized)) {
    return { matched: false };
  }
  return { matched: false };
}

// Accept only simple, sluggy IDs
const POST_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
function assertValidPostId(postId: string): void {
  if (!POST_ID_RE.test(postId)) {
    throw new HttpsError('invalid-argument', 'Invalid postId format.');
  }
}

function scoreTranscript(text: string, durSec: number) {
  const t = text.trim();
  const chars = t.length;
  const wordsArr = t.toLowerCase().split(/\s+/).filter(Boolean);
  const unique = new Set(wordsArr);
  const cps = durSec > 0 ? chars / durSec : chars;
  const wpm = durSec > 0 ? (wordsArr.length / durSec) * 60 : wordsArr.length;
  const uniqueRatio = wordsArr.length ? unique.size / wordsArr.length : 0;

  const freq: Record<string, number> = {};
  for (const c of t) freq[c] = (freq[c] || 0) + 1;
  const H = Object.values(freq).reduce((acc, n) => {
    const p = n / Math.max(1, chars);
    return acc - p * Math.log2(p);
  }, 0);

  const onlyPunct = /^[\s\.,!?;:'"()\-\u2013\u2014]*$/.test(t);
  const veryShort = chars < 8 && wordsArr.length < 2;
  const repeatedChunk = /(.{3,})\1{2,}/.test(t);
  const repeatedWords = (() => {
    const counts: Record<string, number> = {};
    for (const w of wordsArr) counts[w] = (counts[w] || 0) + 1;
    return Object.values(counts).some(c => c > Math.max(3, wordsArr.length * 0.6));
  })();

  let score = 0;
  if (onlyPunct) score += 4;
  if (veryShort) score += 2;
  if (repeatedChunk) score += 3;
  if (repeatedWords) score += 2;
  if (cps < 1.2 && durSec >= 5) score += 2;
  if (cps > 28) score += 2;
  if (wpm < 40 && durSec >= 8) score += 1;
  if (uniqueRatio < 0.3 && wordsArr.length >= 10) score += 2;
  if (H < 2.2 && chars >= 30) score += 2;

  return {
    score,
    cps: +cps.toFixed(1),
    wpm: +wpm.toFixed(0),
    uniqueRatio: +uniqueRatio.toFixed(2),
    H: +H.toFixed(2)
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface CreateMemoryPostInput { postId: string; contentText: string; }
interface CreateMemoryPostResult { postId: string; uploadedBytesForThisPost: number; }
interface DeletePostInput { postId: string; }
interface DeletePostResult { ok: boolean; deletedFiles: number; }
interface TranscribeAudioInput { audioBase64: string; durationSec: number; mimeType?: string; }
interface TranscribeAudioResult { text: string; durationSec: number; }

// ═══════════════════════════════════════════════════════════════════════════════
// createMemoryPost — finalize callable (SIMPLIFIED - NO USAGE TRACKING)
// ═══════════════════════════════════════════════════════════════════════════════
export const createMemoryPost = onCall(
  { region: REGION },
  async (request): Promise<CreateMemoryPostResult> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

    const { postId, contentText } = (request.data ?? {}) as Partial<CreateMemoryPostInput>;
    if (!postId || typeof postId !== 'string') {
      throw new HttpsError('invalid-argument', 'postId (string) is required');
    }
    assertValidPostId(postId);

    if (typeof contentText !== 'string') {
      throw new HttpsError('invalid-argument', 'contentText (string) is required');
    }

    // 1) List storage objects under the post
    const bucket = storage.bucket();
    const base = `users/${uid}/posts/${postId}`;
    let files: Array<import('@google-cloud/storage').File> = [];
    try {
      const [images] = await bucket.getFiles({ prefix: `${base}/images/` });
      files = images; // Only images now
    } catch (e) {
      logger.error('Storage list failed', { uid, postId, err: String(e) });
      throw new HttpsError('internal', 'STORAGE_LIST_FAILED');
    }

    // 2) Build media[] with sizes from metadata
    const media = await Promise.all(
      files.map(async (f) => {
        const [meta] = await f.getMetadata();
        const size = Number(meta.size ?? 0);
        const contentType = String(meta.contentType ?? '');
        if (!contentType.startsWith('image/')) {
          throw new HttpsError('failed-precondition', 'Only images allowed.');
        }
        return {
          id: f.name.split('/').pop() ?? f.name,
          kind: 'image' as const,
          path: f.name,
          size,
          contentType,
        };
      })
    );

    const totalBytes = media.reduce((sum, m) => sum + (m.size || 0), 0);

    // 3) Validate: max 3 images
    if (media.length > 3) {
      throw new HttpsError('failed-precondition', 'Max 3 images allowed.');
    }

    const content = (contentText ?? '').trim();

    // 4) Guard: empty post
    if (totalBytes === 0 && content === '') {
      throw new HttpsError('invalid-argument', 'EMPTY_POST');
    }

    // 5) Write post (no usage tracking, no limits)
    await db.runTransaction(async (tx) => {
      const postRef = db.collection('users').doc(uid).collection('posts').doc(postId);

      // Idempotency: if post exists, don't double-count
      const postSnap = await tx.get(postRef);
      if (postSnap.exists) {
        throw new HttpsError('already-exists', 'Post already exists');
      }

      tx.set(postRef, {
        userId: uid,
        meta: {
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        content: { text: content },
        media,
        usage: { uploadedBytes: totalBytes }, // analytics only
        flags: { archived: false },
      });
    });

    logger.info('createMemoryPost: success', { uid, postId, mediaCount: media.length, bytes: totalBytes });
    return { postId, uploadedBytesForThisPost: totalBytes };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// deletePost — delete callable
// ═══════════════════════════════════════════════════════════════════════════════
export const deletePost = onCall(
  { region: REGION, timeoutSeconds: 120, memory: '512MiB' },
  async (request): Promise<DeletePostResult> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

    const { postId } = (request.data ?? {}) as Partial<DeletePostInput>;
    if (typeof postId !== 'string' || !postId) {
      throw new HttpsError('invalid-argument', 'postId (string) is required');
    }
    assertValidPostId(postId);

    // Verify ownership
    const postRef = db.collection('users').doc(uid).collection('posts').doc(postId);
    const postSnap = await postRef.get();

    if (!postSnap.exists) {
      throw new HttpsError('not-found', 'Post not found');
    }
    const postUserId = postSnap.get('userId');
    if (postUserId !== uid) {
      throw new HttpsError('permission-denied', 'Not your post');
    }

    // Delete Storage folder
    const bucket = storage.bucket();
    const prefix = `users/${uid}/posts/${postId}/`;
    let deletedFiles = 0;
    const MAX_CONCURRENT = 20;

    try {
      const [allFiles] = await bucket.getFiles({ prefix });
      logger.info('deletePost: found files', { uid, postId, count: allFiles.length });

      for (let i = 0; i < allFiles.length; i += MAX_CONCURRENT) {
        const batch = allFiles.slice(i, i + MAX_CONCURRENT);
        const results = await Promise.allSettled(batch.map(f => f.delete({ ignoreNotFound: true })));
        results.forEach((r, idx) => {
          if (r.status === 'fulfilled') {
            deletedFiles++;
          } else if (r.reason?.code !== 404) {
            logger.warn('deletePost: file delete failed', {
              uid, postId, file: batch[idx].name, err: String(r.reason)
            });
            throw new HttpsError('internal', 'STORAGE_DELETE_FAILED');
          }
        });
      }
    } catch (e: any) {
      if (e.code) throw e;
      logger.error('deletePost: storage error', { uid, postId, err: String(e) });
      throw new HttpsError('internal', 'STORAGE_DELETE_FAILED');
    }

    await postRef.delete();

    logger.info('deletePost: success', { uid, postId, deletedFiles });
    return { ok: true, deletedFiles };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
export const transcribeAudio = onCall(
  { region: REGION, timeoutSeconds: 60, memory: '512MiB' },
  async (request): Promise<TranscribeAudioResult> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

    // 1) Validate inputs
    const { audioBase64, durationSec, mimeType } = (request.data ?? {}) as Partial<TranscribeAudioInput>;

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      throw new HttpsError('invalid-argument', 'audioBase64 (string) required');
    }

    const dur = Number(durationSec);
    if (!Number.isFinite(dur) || dur <= 0 || dur > MAX_STT_SECONDS) {
      throw new HttpsError('invalid-argument', `durationSec must be 0 < d <= ${MAX_STT_SECONDS}`);
    }

    // 2) Decode base64 and validate size (max 25MB)
    let buf: Buffer;
    try {
      const clean = sanitizeBase64(audioBase64);
      buf = Buffer.from(clean, 'base64');
    } catch (e) {
      logger.error('transcribeAudio: base64 decode failed', { uid, err: String(e) });
      throw new HttpsError('invalid-argument', 'Invalid base64 audio data');
    }

    if (buf.length === 0) {
      throw new HttpsError('invalid-argument', 'Empty audio payload');
    }
    if (buf.length > MAX_AUDIO_BYTES) {
      throw new HttpsError('invalid-argument', `Audio too large (max ${MAX_AUDIO_BYTES} bytes)`);
    }

    // 3) MIME normalization + filename
    const typeRaw = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';
    const typeBase = typeRaw.split(';')[0].trim(); // strip parameters like ;codecs=opus
    if (!ALLOWED_BASE.has(typeBase)) {
      throw new HttpsError('invalid-argument', `Unsupported audio mimeType: ${mimeType ?? 'unknown'}`);
    }

    const filename =
      (typeBase.includes('m4a') ? 'audio.m4a' :
       typeBase.includes('wav') ? 'audio.wav' :
       typeBase.includes('mpeg') ? 'audio.mp3' :
       typeBase.includes('mp4') ? 'audio.mp4' :
       'audio.webm');

    // 3b) Plausibility check: bytes <-> duration
    const bitrateKbps = Math.round((buf.length * 8) / Math.max(1, dur) / 1000);
    if (bitrateKbps < 8 || bitrateKbps > 512) {
      logger.warn('transcribeAudio: implausible bitrate', { uid, bitrateKbps, bytes: buf.length, dur });
    }

    // 4) Call Whisper
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error('transcribeAudio: OPENAI_API_KEY not configured');
      throw new HttpsError('internal', 'STT service not configured');
    }

    let text = '';
    const blob = new Blob([buf as any], { type: typeBase });
    logger.info('transcribeAudio: calling Whisper', {
      uid, durationSec: dur, mimeType: typeBase, bytes: buf.length, filename
    });

    const form = new FormData();
    form.append('file', blob, filename);
    form.append('model', 'whisper-1');
    form.append('language', 'en');
    form.append('response_format', 'json');
    form.append('temperature', '0');

    const ctrl = new AbortController();
    const FETCH_TIMEOUT_MS = 30_000;
    const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

    try {
      const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => 'Unknown error');
        logger.error('transcribeAudio: Whisper API failed', {
          uid, status: resp.status, statusText: resp.statusText, error: errorText.slice(0, 200)
        });
        if (resp.status >= 500) throw new HttpsError('unavailable', 'STT_NETWORK_ERROR');
        throw new HttpsError('internal', 'STT_API_FAILED');
      }

      const result = await resp.json().catch(() => ({} as any));
      text = typeof result.text === 'string' ? result.text : '';
      if (text.length > MAX_TEXT_CHARS) {
        logger.warn('transcribeAudio: text too long, truncating', { uid, len: text.length });
        text = text.slice(0, MAX_TEXT_CHARS);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        logger.error('transcribeAudio: fetch timeout', { uid });
        throw new HttpsError('unavailable', 'STT_NETWORK_ERROR');
      }
      if (e.code) throw e;
      logger.error('transcribeAudio: network error', { uid, err: String(e) });
      throw new HttpsError('unavailable', 'STT_NETWORK_ERROR');
    } finally {
      clearTimeout(timeoutId);
    }

    // 5) Early return for very short recordings
    const BRIEF_SEC_HARD = 1.5;  // always too short
    const BRIEF_SEC_SOFT = 3.0;  // short + few words
    const trimmed = (text ?? '').trim();
    const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;

    if (dur < BRIEF_SEC_HARD || (dur < BRIEF_SEC_SOFT && wordCount < 3)) {
      return { text: MSG_TOO_BRIEF, durationSec: dur };
    }

    // 6) Hallucination detection
    const hallu = detectHallucination(text);
    if (DEBUG_TRANSCRIBE) logger.info('hallu.conservative', hallu);

    const IS_PROD = process.env.NODE_ENV === 'production' || STRICT_HALLUCINATION_BLOCK;

    if (IS_PROD && hallu.matched) {
      logger.warn('blocked.conservative', { uid, rule: hallu.rule });
      return { text: MSG_NO_SPEECH, durationSec: dur };
    }

    const cleanText = text.toLowerCase().trim();
    const normalizedTight = cleanText.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const tokens = normalizedTight ? normalizedTight.split(' ') : [];

    const triggersShortExact =
      normalizedTight.length > 0 &&
      normalizedTight.length <= 24 &&
      EXACT_SHORT_PHRASES.has(normalizedTight);

    const suspectCount = tokens.filter(t => TOKEN_SUSPECTS.has(t)).length;
    const tokenSuspicionRatio = tokens.length ? suspectCount / tokens.length : 0;
    const triggersTokenDominance = tokens.length > 0 && tokens.length <= 4 && tokenSuspicionRatio >= 0.66;

    const triggersCreator =
      tokens.length > 0 && tokens.length <= 10 && CREATOR_PATTERNS.some(rx => rx.test(normalizedTight));

    const phraseSuspicious = triggersShortExact || triggersTokenDominance || triggersCreator;

    const s = scoreTranscript(cleanText, dur);
    const SUSPICIOUS = phraseSuspicious || s.score >= 4;

    if (SUSPICIOUS && IS_PROD) {
      logger.warn('blocked.scored', { uid, ...s, phraseSuspicious, tokens: tokens.length });
      return { text: MSG_NO_SPEECH, durationSec: dur };
    }
    if (SUSPICIOUS && !IS_PROD) {
      logger.warn('dev-flag.scored', { uid, ...s, phraseSuspicious, tokens: tokens.length });
    }

    // 7) Post-process text for better readability
    let cleanedText = text.replace(/\s+/g, ' ').trim();

    if (/^[a-z]/.test(cleanedText)) {
      cleanedText = cleanedText[0].toUpperCase() + cleanedText.slice(1);
    }
    if (/[A-Za-z]/.test(cleanedText) && !/[.!?]\s*$/.test(cleanedText)) {
      cleanedText += '.';
    }

    logger.info('transcribeAudio: success', { uid, durationSec: dur, textLength: cleanedText.length });
    return { text: cleanedText, durationSec: dur };
  }
);