// /src/dev/uploaderTests.ts
/**
 * Dev-only utilities for testing UploadManager with simulated network flakiness
 * 
 * Usage in browser console:
 * 
 * 1. Basic upload test:
 *    await window.uploadTests.testBasicUpload()
 * 
 * 2. Simulate network flakiness:
 *    window.uploadTests.simulateFlakiness(manager)
 * 
 * 3. Test batch upload:
 *    await window.uploadTests.testBatchUpload()
 * 
 * 4. Stop flakiness simulation:
 *    window.uploadTests.stopFlakiness()
 */

import { UploadManager } from '../lib/uploader';
import { auth } from '../lib/firebase';
import { makeFile, makeFakeFile } from './fileUtils';

let flakinessInterval: number | null = null;

/**
 * Creates a test blob (fake image)
 */
function createTestBlob(sizeMB: number, type = 'image/jpeg'): Blob {
    const size = Math.max(1, Math.round(sizeMB * 1024 * 1024)); // avoid fractional lengths
    const arr = new Uint8Array(size);
    // Light randomization for realism, but cheap: fill the first 64KB
    const head = Math.min(size, 64 * 1024);
    if (head > 0) {
    crypto.getRandomValues(arr.subarray(0, head));
    }
       return new Blob([arr], { type });
    }

/**
 * Test basic single image upload
 */
export async function testBasicUpload() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    console.error('❌ Not authenticated. Sign in first.');
    return;
  }

  console.log('🧪 Testing basic image upload...');
  
  const manager = new UploadManager();
  const blob = createTestBlob(0.5); // 500KB test image
  const postId = `test-${Date.now()}`;
  
  const jobId = manager.uploadImage(blob, {
    storagePath: `users/${uid}/posts/${postId}/images/test.jpg`,
    contentType: 'image/jpeg',
    metadata: {
      userId: uid,
      postId,
      originalName: 'test.jpg',
      originalSize: blob.size.toString(),
      compressedSize: blob.size.toString(),
      uploadedAt: Date.now().toString(),
    },
    onProgress: (percent, transferred, total) => {
      console.log(`📊 Progress: ${Math.round(percent * 100)}% (${transferred}/${total} bytes)`);
    },
    onStateChange: (status) => {
      console.log(`🔄 State: ${status}`);
    },
    onComplete: (url) => {
      console.log(`✅ Upload complete! URL: ${url}`);
    },
    onError: (err) => {
      console.error(`❌ Upload failed:`, err);
    },
  });

  console.log(`📤 Started upload with job ID: ${jobId}`);
  
  // Return job ID so user can control it
  return { manager, jobId };
}

/**
 * Test batch upload with mixed images and videos
 */
export async function testBatchUpload() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    console.error('❌ Not authenticated. Sign in first.');
    return;
  }

  console.log('🧪 Testing batch upload (3 images + 1 video)...');
  
  const manager = new UploadManager();
  const postId = `batch-${Date.now()}`;
  
  const items = [
    {
      // File is fine here—File extends Blob
      blob: makeFakeFile(0.3, 'img1.jpg', 'image/jpeg'),
      type: 'image' as const,
      options: {
        storagePath: `users/${uid}/posts/${postId}/images/img1.jpg`,
        contentType: 'image/jpeg',
        metadata: { userId: uid, postId, originalName: 'img1.jpg', uploadedAt: Date.now().toString() },
        onProgress: (p: number) => console.log(`📷 img1: ${Math.round(p * 100)}%`),
      },
    },
    {
      blob: makeFakeFile(0.4, 'img2.jpg', 'image/jpeg'),
      type: 'image' as const,
      options: {
        storagePath: `users/${uid}/posts/${postId}/images/img2.jpg`,
        contentType: 'image/jpeg',
        metadata: { userId: uid, postId, originalName: 'img2.jpg', uploadedAt: Date.now().toString() },
        onProgress: (p: number) => console.log(`📷 img2: ${Math.round(p * 100)}%`),
      },
    },
    {
      blob: makeFakeFile(0.2, 'img3.webp', 'image/webp'),
      type: 'image' as const,
      options: {
        storagePath: `users/${uid}/posts/${postId}/images/img3.webp`,
        contentType: 'image/webp',
        metadata: { userId: uid, postId, originalName: 'img3.webp', uploadedAt: Date.now().toString() },
        onProgress: (p: number) => console.log(`📷 img3: ${Math.round(p * 100)}%`),
      },
    },
    {
      // ✅ Use the helper instead of constructing File manually
      blob: makeFile(createTestBlob(2, 'video/mp4'), 'video1.mp4', 'video/mp4'),
      type: 'video' as const,
      options: {
        storagePath: `users/${uid}/posts/${postId}/videos/video1.mp4`,
        contentType: 'video/mp4',
        metadata: {
          userId: uid,
          postId,
          originalName: 'video1.mp4',
          uploadedAt: new Date().toISOString(),
        },
        onProgress: (p: number) => console.log(`🎥 video1: ${Math.round(p * 100)}%`),
      },
    },
  ];

  console.log('📤 Starting batch upload...');
  const results = await manager.uploadBatch(items);
  
  console.log('📊 Batch upload results:');
  
  const table = results.map((r, i) => ({
    item: i + 1,
    status: r.status,
    url: r.downloadURL ?? '',
    error: r.error?.message ?? '',
    bytes: `${r.bytesTransferred}/${r.totalBytes}`,
}));
    console.table(table);

  return { manager, results };
}

/**
 * Simulate network flakiness by randomly pausing/resuming uploads
 * This tests Firebase's resumable upload resilience
 */
export function simulateFlakiness(manager: UploadManager) {
  if (flakinessInterval) {
    console.warn('⚠️ Flakiness simulation already running. Call stopFlakiness() first.');
    return;
  }

  console.log('🌊 Starting network flakiness simulation...');
  console.log('   Will randomly pause/resume uploads every 2-5 seconds');
  
  const chaos = () => {
    const active = manager.getActiveJobs();
    if (active.length === 0) {
      console.log('💤 No active uploads to disrupt');
      return;
    }

    const shouldPause = Math.random() > 0.5;
    
    if (shouldPause) {
      console.log('🛑 CHAOS: Pausing all uploads...');
      manager.pauseAll();
      
      // Auto-resume after 1-3 seconds
      const resumeDelay = Math.random() * 2000 + 1000;
      setTimeout(() => {
        console.log('▶️ CHAOS: Resuming uploads...');
        manager.resumeAll();
      }, resumeDelay);
    } else {
      // Just log that we're checking
      console.log(`👀 CHAOS: Monitoring ${active.length} active upload(s)`);
    }
  };

  // Run chaos every 2-5 seconds
  const scheduleNext = () => {
    const delay = Math.random() * 3000 + 2000;
    flakinessInterval = window.setTimeout(() => {
        if (flakinessInterval === null) return;
        chaos();
        scheduleNext();
             }, delay);
           };

  scheduleNext();
  
  console.log('✅ Flakiness simulation started. Call stopFlakiness() to stop.');
}

/**
 * Stop the flakiness simulation
 */
export function stopFlakiness() {
  if (flakinessInterval) {
    clearTimeout(flakinessInterval);
    flakinessInterval = null;
    console.log('✅ Flakiness simulation stopped.');
  } else {
    console.log('ℹ️ No flakiness simulation running.');
  }
}

/**
 * Test pause/resume/cancel controls
 */
export async function testControls() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    console.error('❌ Not authenticated. Sign in first.');
    return;
  }

  console.log('🧪 Testing upload controls (pause/resume/cancel)...');
  
  const manager = new UploadManager();
  const blob = createTestBlob(5); // 5MB so we have time to interact
  const postId = `control-test-${Date.now()}`;
  
  const jobId = manager.uploadImage(blob, {
    storagePath: `users/${uid}/posts/${postId}/images/large.jpg`,
    contentType: 'image/jpeg',
    metadata: { userId: uid, postId, uploadedAt: Date.now().toString() },
    onProgress: (p) => console.log(`📊 ${Math.round(p * 100)}%`),
    onStateChange: (s) => console.log(`🔄 State: ${s}`),
    onComplete: (url) => console.log(`✅ Complete: ${url}`),
    onError: (err) => console.error(`❌ Error:`, err),
  });

//   Expose to the console so the commands actually work
(window as any).__uMgr = manager;
(window as any).__uJob = jobId;

console.log(`\nTry these commands in console:`);
console.log(`  __uMgr.pause(__uJob)    // Pause upload`);
console.log(`  __uMgr.resume(__uJob)   // Resume upload`);
console.log(`  __uMgr.cancel(__uJob)   // Cancel upload`);
console.log(`  __uMgr.retry(__uJob)    // Retry after cancel/error`);

 return { manager, jobId };
}

// Export for browser console
if (typeof window !== 'undefined') {
  (window as any).uploadTests = {
    testBasicUpload,
    testBatchUpload,
    testControls,
    simulateFlakiness,
    stopFlakiness,
    UploadManager, // Export class so users can create custom instances
  };
  
  console.log('📦 Upload tests loaded. Available commands:');
  console.log('   window.uploadTests.testBasicUpload()');
  console.log('   window.uploadTests.testBatchUpload()');
  console.log('   window.uploadTests.testControls()');
  console.log('   window.uploadTests.simulateFlakiness(manager)');
  console.log('   window.uploadTests.stopFlakiness()');
}

