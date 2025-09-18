// Audio duration calculation utilities
import * as admin from "firebase-admin";

export async function getAudioDurationInSeconds(
  audioBuffer: Buffer, 
  mimeType: string
): Promise<number> {
  try {
    // For WebM files, we can read duration from metadata
    if (mimeType.includes('webm') || mimeType.includes('opus')) {
      return await getWebMDuration(audioBuffer);
    }
    
    // For other formats, fall back to estimate based on file size and bitrate
    // This is a rough estimate - in production you might want ffmpeg probe
    const fileSizeBytes = audioBuffer.length;
    const estimatedBitrate = 128000; // 128 kbps average
    const estimatedDurationSeconds = (fileSizeBytes * 8) / estimatedBitrate;
    
    return Math.max(1, estimatedDurationSeconds); // Minimum 1 second
    
  } catch (error) {
    console.error('Failed to get audio duration:', error);
    // Fallback: estimate based on file size
    return Math.max(1, audioBuffer.length / 16000); // Very rough estimate
  }
}

async function getWebMDuration(buffer: Buffer): Promise<number> {
  // Simple WebM duration parsing
  // In production, you'd want a proper media library
  try {
    // Look for duration in EBML structure (simplified)
    const durationOffset = buffer.indexOf('Duration');
    if (durationOffset > -1) {
      // Parse duration from WebM metadata
      // This is a simplified version - real implementation would parse EBML properly
    }
    
    // Fallback to file size estimation
    return buffer.length / 16000; // ~16KB per second for WebM
  } catch {
    return buffer.length / 16000;
  }
}

// Helper function to get minutes until midnight AEST
export function getMinutesUntilMidnightAEST(): number {
  const now = new Date();
  const aestNow = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const midnight = new Date(aestNow);
  midnight.setDate(aestNow.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  const diffMs = Math.max(0, midnight.getTime() - aestNow.getTime());
  return Math.ceil(diffMs / 60000);
}

// Backward compatibility - convert minutes to hours
export function getHoursUntilMidnightAEST(): number {
  const minutes = getMinutesUntilMidnightAEST();
  return Math.ceil(minutes / 60);
}

// Daily limits configuration
export const DAILY_LIMITS = {
  free: {
    uploadBytes: 30 * 1024 * 1024,     // 30MB
    uploadBuffer: 5 * 1024 * 1024,     // 5MB grace buffer
    speechMinutes: 10,                  // 10 minutes
    speechBuffer: 0                     // No grace for speech
  },
  plus: {
    uploadBytes: 1 * 1024 * 1024 * 1024, // 1GB
    uploadBuffer: 50 * 1024 * 1024,      // 50MB grace buffer  
    speechMinutes: 180,                   // 3 hours
    speechBuffer: 0                       // No grace for speech
  }
} as const;

// ⬇️ NEW: Server-side enforcement functions (same as client)
type EnforcementState = 'ok' | 'hard_over';

export function checkUploadEnforcement2(
  usedBytes: number,
  incomingBytes: number,
  plan: 'free' | 'plus'
): {
  state: EnforcementState;
  usedAfter: number;
  hardLimit: number;
  wasInBuffer: boolean;
} {
  const visibleLimit = DAILY_LIMITS[plan].uploadBytes;
  const hardLimit = visibleLimit + DAILY_LIMITS[plan].uploadBuffer;
  const usedAfter = usedBytes + incomingBytes;

  if (usedAfter <= hardLimit) {
    return {
      state: 'ok',
      usedAfter,
      hardLimit,
      wasInBuffer: usedAfter > visibleLimit
    };
  }
  return { state: 'hard_over', usedAfter, hardLimit, wasInBuffer: false };
}

export function checkSpeechEnforcement2(
  usedSeconds: number,
  incomingSeconds: number,
  plan: 'free' | 'plus'
): {
  state: EnforcementState;
  usedAfter: number;
  hardLimitSec: number;
} {
  const visibleLimitSec = DAILY_LIMITS[plan].speechMinutes * 60;
  const hardLimitSec = visibleLimitSec + (DAILY_LIMITS[plan].speechBuffer ?? 0) * 60;
  const usedAfter = usedSeconds + incomingSeconds;

  if (usedAfter <= hardLimitSec) {
    return { state: 'ok', usedAfter, hardLimitSec };
  }
  return { state: 'hard_over', usedAfter, hardLimitSec };
}

// Check and reset daily usage if new day
export async function checkAndResetIfNewDay(userId: string): Promise<void> {
  const userRef = admin.firestore().doc(`users/${userId}`);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) {
    throw new Error('User not found');
  }
  
  const userData = userDoc.data();
  const todayAEST = getTodayInAEST();
  
  // If it's a new day in AEST, reset usage
  if (!userData?.dailyUsage || userData.dailyUsage.date !== todayAEST) {
    await userRef.update({
      'dailyUsage.date': todayAEST,
      'dailyUsage.uploadBytes': 0,
      'dailyUsage.speechMinutes': 0,
      'dailyUsage.lastReset': admin.firestore.FieldValue.serverTimestamp(),
      'dailyUsage.lastChecked': admin.firestore.FieldValue.serverTimestamp(),
      'lastActive': admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`🔄 Reset daily usage for user ${userId} - New day: ${todayAEST}`);
  } else {
    // Just update last checked
    await userRef.update({
      'dailyUsage.lastChecked': admin.firestore.FieldValue.serverTimestamp(),
      'lastActive': admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

// Get today's date in AEST timezone
function getTodayInAEST(): string {
  return new Date().toLocaleDateString('en-AU', { 
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit'
  }).split('/').reverse().join('-'); // Convert DD/MM/YYYY to YYYY-MM-DD
}
