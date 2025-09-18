import React, { useState, useEffect, useRef } from 'react'
import { Plus, X, Mic, ThumbsUp, ThumbsDown } from 'lucide-react'
import RecordingBar from '../ui/RecordingBar'
import { uploadAndTranscribe } from '../../lib/firebase'
import { auth } from '../../lib/firebase'
import { QuotaEstimator } from '../../lib/quotaEstimator'
import { UsageManager } from '../../lib/usageManager'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { QuotaReachedMessage, DeferredMessage } from '../QuotaReachedMessage'

const formatTime = (ms: number) => {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
};

export const CreateView: React.FC = () => {
  const [content, setContent] = useState('')
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  
  // 🎯 FIX 4C: Track created URLs for proper cleanup
  const fileUrlsRef = useRef<string[]>([])
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioLevels, setAudioLevels] = useState<number[]>([])
  const [isTranscribing, setIsTranscribing] = useState(false)
  
  // Enhanced recording state for quota system
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'recorded' | 'transcribing' | 'deferred'>('idle')
  const [deferredReason, setDeferredReason] = useState<'offline' | 'quota' | null>(null)
  // Note: remainingTime removed since auto-stop warnings are hidden from users
  const [quotaError, setQuotaError] = useState<string>('')

  // Recording refs - these hold the actual recording objects
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const animationRef = useRef<number | null>(null)
  const isVisualizationActiveRef = useRef<boolean>(false)  // 🎯 Control animation loop
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null)  // Auto-stop timer for quota
  const HISTORY_LEN = 180; // ~180 columns visible
  const historyRef = useRef<number[]>(Array(HISTORY_LEN).fill(0));
  const prevRmsRef = useRef(0);

  const lastPushRef = useRef(0);

  // Transcription feedback state (simplified)
  const [lastTranscription, setLastTranscription] = useState<string>('')
  const [currentTranscriptId, setCurrentTranscriptId] = useState<string>('')
  const [hasVoted, setHasVoted] = useState<boolean>(false)
  const [isSubmittingVote, setIsSubmittingVote] = useState<boolean>(false)
  
  // Online status hook
  const isOnline = useOnlineStatus()

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    // TODO: Implement auto-save functionality
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    // TODO: Add file validation and preview generation
    setSelectedFiles(prev => [...prev, ...files])
    
    // 🎯 FIX 4C: Track URLs for proper cleanup
    const newUrls = files.map(file => URL.createObjectURL(file))
    fileUrlsRef.current.push(...newUrls)
    
    setIsUploadMenuOpen(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    setSelectedFiles(prev => [...prev, ...files])
    
    // 🎯 FIX 4C: Track URLs for proper cleanup
    const newUrls = files.map(file => URL.createObjectURL(file))
    fileUrlsRef.current.push(...newUrls)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const removeFile = (index: number) => {
    // 🎯 FIX 4C: Revoke URL before removing file
    const urlToRevoke = fileUrlsRef.current[index]
    if (urlToRevoke) {
      URL.revokeObjectURL(urlToRevoke)
      fileUrlsRef.current.splice(index, 1)
    }
    
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  // 🎯 REAL RECORDING IMPLEMENTATION
  const startRecording = async () => {
    try {
      // Clear any previous errors
      setQuotaError('')
      
      // 1. Pre-flight quota check
      const currentUser = auth.currentUser
      if (!currentUser) {
        setQuotaError('Please sign in to record')
        return
      }
      
      // Request full available recording time (up to 10 minutes = 600 seconds)
      const quotaCheck = await QuotaEstimator.preflightSpeechCheck(currentUser.uid, 600)
      
      if (!quotaCheck.canRecord) {
        const minutesToReset = UsageManager.getMinutesUntilMidnightAEST()
        const hoursToReset = Math.ceil(minutesToReset / 60)
        setQuotaError(`Daily limit reached. Resets in ${hoursToReset} hours.`)
        return
      }
      
      // 2. Set up auto-stop timer if needed (internal tracking only - hidden from users)
      
      // 🎯 FIX 2: Clean remaining time calculation using enforcement data
      const remaining = quotaCheck.enforcement.hardLimitSec - quotaCheck.enforcement.usedAfter;
      if (remaining < 120) {
        console.log(`📊 ${currentUser.uid} ~${remaining}s remaining`);
      }
      
      // Set auto-stop timer based on recommended stop time (only if less than full quota)
      if (quotaCheck.recommendedStopSeconds > 0 && quotaCheck.recommendedStopSeconds < 600) {
        const autoStopMs = quotaCheck.recommendedStopSeconds * 1000
        console.log(`🕐 Setting auto-stop timer for ${quotaCheck.recommendedStopSeconds}s (${quotaCheck.recommendedStopSeconds/60} minutes)`)
        autoStopTimerRef.current = setTimeout(() => {
          stopRecording('quota')
        }, autoStopMs)
      } else {
        console.log(`✅ Full quota available: ${quotaCheck.recommendedStopSeconds}s (${quotaCheck.recommendedStopSeconds/60} minutes)`)
      }
      
      // 🎯 STEP 1 FIX: Clear previous recording state before starting new recording
      historyRef.current = Array(HISTORY_LEN).fill(0)  // Reset history buffer to all zeros
      prevRmsRef.current = 0                           // Reset smoothing reference
      lastPushRef.current = 0                          // Reset timing reference
      setAudioLevels([])                               // Clear visual state
    
      // 1. Get user's microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // 🎯 CORE FEATURES - Universal mobile/desktop support
          echoCancellation: true,           // Removes echo feedback (works everywhere)
          noiseSuppression: true,           // Reduces background noise (works everywhere)  
          autoGainControl: true,            // Normalizes volume levels (works everywhere)
          sampleRate: { ideal: 16000 },     // Optimal for speech recognition (works everywhere)
          channelCount: { ideal: 1 },       // Mono audio for speech (works everywhere)
          
          // 🚀 ADVANCED FEATURES - Enhanced quality where supported (graceful degradation)
          // Note: Google-specific properties are applied via constraints but not in TypeScript definitions
        } as any
      })
      
      mediaStreamRef.current = stream
      
      // 2. Set up MediaRecorder for recording
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm'
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 64000, // Good quality for speech
      })
      
      mediaRecorderRef.current = mediaRecorder
      recordingChunksRef.current = []
      
      // 3. Handle recording data
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data)
        }
      }
      
      // 4. Set up audio visualization
      const audioContext = new AudioContext()
      
      // 🎯 FIX 4A: Resume AudioContext if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)

      // 🔧 RELAXED AUDIO PROCESSING: Less aggressive filtering for better speech detection
      // Wider band-pass: ~80Hz–8000Hz (more permissive than 120Hz-3800Hz)
      const highpass = audioContext.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = 80  // Lower cutoff to preserve more voice

      const lowpass = audioContext.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = 8000 // Higher cutoff for wider frequency range

      // 🔧 GENTLER COMPRESSION: Less aggressive compression
      const compressor = audioContext.createDynamicsCompressor()
      compressor.threshold.value = -30  // Higher threshold (less compression)
      compressor.knee.value = 30
      compressor.ratio.value = 3        // Lower ratio (gentler compression)
      compressor.attack.value = 0.005
      compressor.release.value = 0.1

      // source → HP → LP → Compressor → Analyser
      source.connect(highpass)
      highpass.connect(lowpass)
      lowpass.connect(compressor)
      compressor.connect(analyser)
      
      // 🎯 VOICE-FOCUSED CONFIGURATION
      analyser.fftSize = 1024             // Higher resolution for better voice detection
      analyser.smoothingTimeConstant = 0 // Minimal smoothing for real-time response
      analyser.minDecibels = -85         // Filter out very quiet sounds (background)
      analyser.maxDecibels = -5          // Focus on speech volume range

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      
      // 5. Start recording and timers
      // 🎯 CRITICAL FIX: Start with timeslice to force chunk emission during recording
      mediaRecorder.start(100) // Emit chunks every 100ms
      setIsRecording(true)
      setRecordingTime(0)
      startTimeRef.current = Date.now()
      
      // Start the timer and visualization
      startTimer()
      startVisualization()
      
      console.log('🎤 Recording started with audio processing')
      
    } catch (error) {
      console.error('Failed to start recording:', error)
      alert('Could not access microphone. Please check permissions.')
    }
  }

  const stopRecording = async (reason: 'user' | 'quota' = 'user') => {
    try {
      // clear any auto-stop timer
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }

      stopTimer();
      stopVisualization();

      // 👉 Wait for MediaRecorder to fully finish and deliver final chunk
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          const mr = mediaRecorderRef.current!;
          const onStop = () => {
            mr.removeEventListener('stop', onStop);
            resolve();
          };
          mr.addEventListener('stop', onStop, { once: true });

          // Force final data emission
          try { mr.requestData(); } catch {}
          mr.stop();
        });
      }

      // Now it's safe to stop tracks / close context
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        await audioContextRef.current.close();
      }

      setIsRecording(false);

      if (reason === 'quota') {
        setRecordingState('deferred');
        setDeferredReason('quota');
        return;
      }

      // Only now, after we KNOW chunks are complete, process
      setRecordingState('recorded');
      setIsTranscribing(true);
      await processRecording();

    } catch (err) {
      console.error('Error stopping recording:', err);
      setIsRecording(false);
      setIsTranscribing(false);
    }
  };

  const cancelRecording = () => {
    stopTimer()
    stopVisualization()
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }
    
    setIsRecording(false)
    setRecordingTime(0)
    setAudioLevels([])
    recordingChunksRef.current = []
    
    console.log('🚫 Recording cancelled')
  }

  // 🎯 HELPER FUNCTIONS FOR RECORDING
  
  // Timer function - updates recording time every 100ms
  const startTimer = () => {
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      setRecordingTime(elapsed)
    }, 100)
  }
  
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }
  // Visualization — Gradual fill-in with smooth voice peaks
  const startVisualization = () => {
  isVisualizationActiveRef.current = true
  
  // 🎯 GRADUAL FILL-IN ANIMATION SETTINGS
  // Note: fillProgress, FILL_SPEED, MAX_BARS are now handled inline for better performance
  
  // 🎯 SMOOTH VOICE SETTINGS
  const BASELINE = 0.08      // Gentle baseline height
  const VOICE_SENSITIVITY = 20  // Gentle voice response (not aggressive)
  const SMOOTHING = 0.15     // Medium smoothing for gentle peaks
  const NOISE_GATE = 0.004   // Filter very quiet sounds
  
  // 🎯 FLOW SPEED CONTROL
  let frameSkip = 0          // Counter for frame skipping
  const FLOW_SPEED = 2       // 1 = normal speed, 2 = half speed, 3 = third speed, etc.

  const tick = () => {
    const analyser = analyserRef.current
    if (!analyser) return

    // 🎤 Get current voice level
    const time = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(time)

    // Calculate voice level with gentle processing
    let sum = 0
    const recentSamples = 512  // Slightly larger window for smoothness
    const start = Math.max(0, time.length - recentSamples)
    
    for (let i = start; i < time.length; i++) {
      sum += time[i] * time[i]
    }
    
    let rms = Math.sqrt(sum / (time.length - start))
    
    // 🎯 GENTLE voice processing (not aggressive)
    rms = Math.max(0, rms - NOISE_GATE)
    let voiceLevel = Math.min(1, rms * VOICE_SENSITIVITY)
    
    // 🎯 SMOOTH temporal blending for gentle peaks
    voiceLevel = prevRmsRef.current * (1 - SMOOTHING) + voiceLevel * SMOOTHING
    prevRmsRef.current = voiceLevel
    
    // 🎯 Combine baseline + voice for final display value
    const displayVal = Math.max(BASELINE, voiceLevel)

    // 🌊 GRADUAL FILL-IN LOGIC
    const hist = historyRef.current
    
    // 🎯 DIRECT TO FLOWING PHASE: Skip fill-in, go straight to persistent flowing waveform
    frameSkip++
    if (frameSkip >= FLOW_SPEED) {
      frameSkip = 0
      hist.push(displayVal)
      if (hist.length > HISTORY_LEN) hist.shift()
    }

    // 🎯 GENTLE spatial smoothing for flowing appearance
    const smoothed = [...hist]
    for (let i = 1; i < smoothed.length - 1; i++) {
      if (hist[i] > 0) {  // Only smooth non-empty bars
        smoothed[i] = (hist[i-1] + 2 * hist[i] + hist[i+1]) / 4
      }
    }

    setAudioLevels(smoothed)

    // Continue animation
    if (isVisualizationActiveRef.current) {
      animationRef.current = requestAnimationFrame(tick)
    }
  }

  tick()
}
  
  const stopVisualization = () => {
    // 🎯 FIX: Stop animation loop by clearing control ref
    isVisualizationActiveRef.current = false
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    setAudioLevels([])
  }
  
  // Process the recorded audio and transcribe it
  const processRecording = async () => {
    try {
      if (recordingChunksRef.current.length === 0) {
        throw new Error('No recording data available')
      }
      
      // 1. Check if online
      if (!isOnline) {
        setRecordingState('deferred')
        setDeferredReason('offline')
        return
      }
      
      // Create audio file from recorded chunks
      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
      const audioBlob = new Blob(recordingChunksRef.current, { type: mimeType })
      
      // 🔍 DIAGNOSTIC: Check if MediaRecorder timing fix worked
      console.log(`🔍 POST-FIX DIAGNOSTIC: Chunks=${recordingChunksRef.current.length}, BlobSize=${audioBlob.size}, MimeType=${mimeType}`);
      
      // 2. Client-side duration estimate
      const estimatedDurationMs = Date.now() - startTimeRef.current
      
      // 3. Pre-flight quota check with client estimate using new enforcement system
      const currentUser = auth.currentUser
      if (!currentUser) {
        setQuotaError('Please sign in to transcribe')
        return
      }
      
      // 🆕 Use new enforcement system with precise estimated duration
      const quotaCheck = await QuotaEstimator.preflightSpeechCheck(currentUser.uid, estimatedDurationMs / 1000)
      
      if (!quotaCheck.canRecord) {
        setRecordingState('deferred')
        setDeferredReason('quota')
        return
      }
      
      // 🆕 Log analytics for buffer usage
      if (quotaCheck.enforcement.state === 'ok' && quotaCheck.enforcement.usedAfter > (quotaCheck.enforcement.hardLimitSec * 0.9)) {
        console.log(`📊 User ${currentUser.uid} in buffer zone: ${quotaCheck.enforcement.usedAfter}s / ${quotaCheck.enforcement.hardLimitSec}s`)
      }
      
      // 🎯 FIX: Check recording duration first
      const recordingDuration = Date.now() - startTimeRef.current;
      const MIN_RECORDING_DURATION = 2000; // 2 seconds minimum for quality transcription
      
      if (recordingDuration < MIN_RECORDING_DURATION) {
        setContent("⏱️ Recording too short. Please speak for at least 2 seconds for better transcription accuracy.");
        setRecordingState('idle')
        setIsTranscribing(false)
        return;
      }
      
      // 🎯 ENHANCED: Audio quality analysis to prevent sending poor audio to Whisper
      const audioQualityCheck = await analyzeAudioQuality(recordingChunksRef.current);
      console.log('🔍 Audio Quality Check Results:', audioQualityCheck);
      
      // Temporarily relaxed for debugging - only block if absolutely no audio
      if (!audioQualityCheck.hasAudio) {
        setContent("🔇 No audio detected. Please check your microphone and try speaking louder.");
        setRecordingState('idle')
        setIsTranscribing(false)
        return;
      }
      
      // Log speech detection but don't block (for debugging)
      if (!audioQualityCheck.hasSpeech) {
        console.log('⚠️ Speech detection warning: Low speech-like energy detected, but proceeding with transcription');
      }
      
      // Validate audio file
      if (audioBlob.size === 0) {
        throw new Error('Recording is empty')
      }
      
      if (audioBlob.size < 1000) { // Less than 1KB is probably empty
        throw new Error('Recording too short')
      }
      
      console.log(`📁 Audio recorded: ${(audioBlob.size / 1024).toFixed(1)}KB, MIME: ${mimeType}`);
      console.log(`⏱️ Recording duration: ${estimatedDurationMs}ms (${(estimatedDurationMs/1000).toFixed(1)}s)`);
      
      // Convert to File for upload
      const audioFile = new File([audioBlob], `recording-${Date.now()}.webm`, {
        type: mimeType
      })
      
      // Use current user (already declared earlier in function)
      if (!currentUser) {
        throw new Error('User not authenticated')
      }
      
      // Upload and transcribe using existing service
      console.log('🚀 Uploading and transcribing...')
      const { text } = await uploadAndTranscribe(audioFile, currentUser.uid)
      
      // Update the content with transcribed text
      setContent(text)
      setLastTranscription(text)
      
      // 🎯 FIX 1: Record usage after successful transcription (prefer server-reported duration if available later)
      const minutes = (Date.now() - startTimeRef.current) / 60000;
      await UsageManager.recordSpeechUsage(currentUser.uid, minutes);
      
      // THEN invalidate cache so next reads are fresh
      QuotaEstimator.invalidateCache(currentUser.uid)
      
      // 🎯 GUARD RAIL 1: Generate unique transcript ID for this session
      const transcriptId = `transcript_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      setCurrentTranscriptId(transcriptId)
      setHasVoted(false) // Reset voting state for new transcript
      
      // 🎯 FIX 3: Don't log user content in production
      if (import.meta.env.DEV) {
        console.log('✅ Transcription completed:', text.slice(0, 50) + '...')
      } else {
        console.log('✅ Transcription completed successfully')
      }
      
    } catch (error) {
      console.error('Error processing recording:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      if (errorMessage.includes('daily limit')) {
        setRecordingState('deferred')
        setDeferredReason('quota')
      } else {
        setQuotaError(`Transcription failed: ${errorMessage}`)
        setRecordingState('idle')
      }
    } finally {
      setIsTranscribing(false)
      recordingChunksRef.current = []
    }
  }

  // 🎯 ENHANCED: Analyze audio quality to prevent hallucinations
  const analyzeAudioQuality = async (audioChunks: Blob[]): Promise<{hasAudio: boolean, hasSpeech: boolean}> => {
    try {
      if (audioChunks.length === 0) {
        return { hasAudio: false, hasSpeech: false };
      }
      
      // Create a temporary audio context for analysis
      const audioContext = new AudioContext();
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Analyze audio data
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      
      // 1. Check if there's any audio signal
      let maxAmplitude = 0;
      let rmsSum = 0;
      
      for (let i = 0; i < channelData.length; i++) {
        const sample = Math.abs(channelData[i]);
        maxAmplitude = Math.max(maxAmplitude, sample);
        rmsSum += sample * sample;
      }
      
      const rmsLevel = Math.sqrt(rmsSum / channelData.length);
      
      // 🎯 FIX 5: Keep relaxed thresholds dev-only
      const isDevMode = import.meta.env.DEV;
      const hasAudio = isDevMode 
        ? (maxAmplitude > 0.0001 && rmsLevel > 0.00001) // Relaxed for debugging
        : (maxAmplitude > 0.001 && rmsLevel > 0.0001);  // Stricter for production
      
      // 2. Simple speech detection (look for speech-like patterns)
      let speechSegments = 0;
      const windowSize = Math.floor(sampleRate * 0.1); // 100ms windows
      
      for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
        let windowEnergy = 0;
        for (let j = i; j < i + windowSize; j++) {
          windowEnergy += channelData[j] * channelData[j];
        }
        windowEnergy = windowEnergy / windowSize;
        
        // Speech typically has energy above certain threshold
        const energyThreshold = isDevMode ? 0.00001 : 0.0001; // Dev vs prod thresholds
        if (windowEnergy > energyThreshold) {
          speechSegments++;
        }
      }
      
      const totalWindows = Math.floor(channelData.length / windowSize);
      const speechRatio = speechSegments / totalWindows;
      
      // 🎯 FIX 5: Dev vs prod speech detection
      const hasSpeech = isDevMode
        ? (speechRatio > 0.03 || maxAmplitude > 0.01)   // Relaxed for debugging  
        : (speechRatio > 0.1 || maxAmplitude > 0.02);   // Stricter for production
      
      await audioContext.close();
      
      // 🔍 COMPREHENSIVE DEBUG LOGGING
      console.log('=== AUDIO QUALITY ANALYSIS ===');
      console.log(`🎧 Audio file size: ${audioBlob.size} bytes`);
      console.log(`🔊 Sample rate: ${sampleRate}Hz, Duration: ${audioBuffer.duration.toFixed(2)}s`);
      console.log(`📊 Max amplitude: ${maxAmplitude.toFixed(6)} (threshold: 0.0001)`);
      console.log(`🎤 RMS level: ${rmsLevel.toFixed(6)} (threshold: 0.00001)`);
      console.log(`🗣️ Speech segments: ${speechSegments}/${totalWindows} (${speechRatio.toFixed(3)} ratio, threshold: 0.03)`);
      console.log(`✅ Final results: hasAudio=${hasAudio}, hasSpeech=${hasSpeech}`);
      console.log('================================');
      
      return { hasAudio, hasSpeech };
      
    } catch (error) {
      console.error('⚠️ Audio quality analysis failed:', error);
      console.log('🚪 Fallback: Assuming audio is valid to avoid false positives');
      // If analysis fails, assume audio is okay to avoid false positives
      return { hasAudio: true, hasSpeech: true };
    }
  };

  // 🎯 PHASE 1: Handle feedback with guard rails
  const handleSimpleFeedback = async (rating: 'good' | 'poor') => {
    // 🛡️ GUARD RAIL 2: Prevent double-clicks and multiple submissions
    if (isSubmittingVote || hasVoted) {
      console.log('🚫 Vote already submitted or in progress')
      return
    }

    // 🛡️ GUARD RAIL 4: Client-side validation
    if (!rating || !['good', 'poor'].includes(rating)) {
      console.error('❌ Invalid rating:', rating)
      return
    }

    if (!currentTranscriptId || !lastTranscription) {
      console.error('❌ No transcript to vote on')
      return
    }

    const currentUser = auth.currentUser
    if (!currentUser) {
      console.error('❌ User not authenticated')
      return
    }

    try {
      // 🛡️ GUARD RAIL 2: Set loading state to disable buttons
      setIsSubmittingVote(true)
      
      console.log('👍👎 Submitting feedback:', rating, 'for transcript:', currentTranscriptId)

      // Import the logging function
      const { logTranscriptionFeedback } = await import('../../lib/firebase')
      
      const result = await logTranscriptionFeedback(
        currentUser.uid,
        currentTranscriptId,
        rating
      )

      if (result.success) {
        console.log('✅ Feedback submitted successfully')
        setHasVoted(true) // Mark as voted to prevent re-voting
        
        // 🛡️ GUARD RAIL 2: Clear UI state after successful vote
        setTimeout(() => {
          setLastTranscription('')
          setCurrentTranscriptId('')
          setHasVoted(false)
          setIsSubmittingVote(false)
        }, 1000) // Short delay to show feedback was received
      } else if (result.alreadyVoted) {
        console.log('ℹ️ Already voted on this transcript')
        setHasVoted(true)
      }

    } catch (error) {
      console.error('❌ Failed to submit feedback:', error)
      setIsSubmittingVote(false) // Re-enable buttons on error
    }
  }



  useEffect(() => {
    // 🎯 FIX 4C: Cleanup tracked URLs when component unmounts
    return () => {
      fileUrlsRef.current.forEach(url => {
        URL.revokeObjectURL(url)
      })
      fileUrlsRef.current = []
    }
  }, [])

  // Cleanup recording resources on unmount
  useEffect(() => {
    return () => {
      // Clean up all recording resources
      stopTimer()
      stopVisualization()
      
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  return (
    <div className="h-full bg-stone-950 flex flex-col">
      {/* Main Content Area - Empty space for future content */}
      <div className="flex-1"></div>

      {/* Bottom Input Area - Fixed at bottom */}
      <div className="p-6">
        <div className="max-w-3xl mx-auto">
          <div 
            className={`relative rounded-2xl border border-gray-800 min-h-[100px] transition-colors duration-200 ${
              isDragOver ? 'bg-gray-700/80 border-blue-400' : 'bg-black border-gray-800'
            } ${isRecording ? 'overflow-hidden' : ''}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Drag Over Message */}
            {isDragOver && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <div className="text-white text-base leading-relaxed">
                  Drop files here
                </div>
              </div>
            )}

            {/* File Previews */}
            {selectedFiles.length > 0 && (
              <div className="p-4 border-b border-gray-800">
                <div className="flex items-center justify-between mb-3">
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="relative">
                      {file.type.startsWith('image/') ? (
                        <img 
                          src={fileUrlsRef.current[index] || URL.createObjectURL(file)}
                          alt={`Preview ${index}`}
                          className="w-24 h-24 rounded-lg object-cover"
                        />
                      ) : (
                        <video 
                          src={fileUrlsRef.current[index] || URL.createObjectURL(file)}
                          className="w-24 h-24 rounded-lg object-cover"
                          preload="metadata"
                        />
                      )}
                      <button
                        onClick={() => removeFile(index)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-gray-700 text-white rounded-full flex items-center justify-center hover:bg-gray-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Textarea with Upload Button */}
            <div className="relative">
              <textarea
                value={content}
                onChange={handleContentChange}
                placeholder={isDragOver ? "" : "What do you want to remember today?"}
                className="w-full p-6 pr-32 bg-transparent border-0 text-white placeholder-white focus:outline-none resize-none text-base leading-relaxed"
              />
              
              {/* Recording Interface */}
              {isRecording && (
                  <div className="absolute inset-0 bg-black rounded-2xl p-6 flex items-center z-50">
                    <div className="w-full">
                      {/* Auto-stop warning - HIDDEN from users per requirements */}
                      
                      <RecordingBar
                        timeLabel={formatTime(recordingTime)}
                        bars={audioLevels}
                        onCancel={cancelRecording}
                        onConfirm={() => stopRecording('user')}
                      />
                    </div>
                  </div>
                )}

              {/* Transcription Loading Interface */}
              {isTranscribing && (
                  <div className="absolute inset-0 bg-black/80 rounded-2xl flex items-center justify-center z-50">
                    <div className="text-center">
                      <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-white text-sm">Transcribing your recording...</p>
                    </div>
                  </div>
                )}

              {/* Deferred Messages */}
              {recordingState === 'deferred' && deferredReason && (
                <div className="absolute inset-0 bg-black/80 rounded-2xl flex items-center justify-center z-50">
                  <div className="text-center p-6">
                    <DeferredMessage reason={deferredReason} />
                    <button
                      onClick={() => {
                        setRecordingState('idle')
                        setDeferredReason(null)
                      }}
                      className="mt-4 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                    >
                      OK
                    </button>
                  </div>
                </div>
              )}

              {/* Quota Error Messages */}
              {quotaError && (
                <div className="absolute bottom-20 left-4 right-4 z-50">
                  <QuotaReachedMessage 
                    type="speech" 
                    hoursToReset={Math.ceil(UsageManager.getMinutesUntilMidnightAEST() / 60)}
                    onUpgrade={() => {
                      // TODO: Open upgrade modal
                      console.log('Open upgrade modal')
                    }}
                  />
                  <button
                    onClick={() => setQuotaError('')}
                    className="mt-2 w-full px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Voice and Upload Buttons */}
              <div className={`absolute bottom-4 right-4 flex items-center space-x-2 ${isRecording ? 'opacity-0 pointer-events-none' : ''}`}>
                {/* 🎯 PHASE 1: Feedback Buttons with Guard Rails */}
                {lastTranscription && !hasVoted && (
                  <>
                    <button
                      onClick={() => handleSimpleFeedback('good')}
                      disabled={isSubmittingVote}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                        isSubmittingVote 
                          ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                          : 'bg-gray-700 hover:bg-gray-600 text-white'
                      }`}
                      title={isSubmittingVote ? "Submitting..." : "Good transcription"}
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleSimpleFeedback('poor')}
                      disabled={isSubmittingVote}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                        isSubmittingVote 
                          ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                          : 'bg-gray-700 hover:bg-gray-600 text-white'
                      }`}
                      title={isSubmittingVote ? "Submitting..." : "Poor transcription"}
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </button>
                  </>
                )}

                {/* Show feedback confirmation */}
                {hasVoted && (
                  <div className="text-green-400 text-xs px-2 py-1 bg-gray-800 rounded-full">
                    Thanks! ✓
                  </div>
                )}

                {/* Voice Recording Button */}
                <button
                  onClick={startRecording}
                  disabled={isRecording || isTranscribing}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isRecording || isTranscribing
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                  title={isRecording ? "Recording..." : isTranscribing ? "Transcribing..." : "Start recording"}
                >
                  <Mic className="w-4 h-4" />
                </button>

                {/* Upload Button */}
                <div className="relative">
                  <button
                    onClick={() => setIsUploadMenuOpen(!isUploadMenuOpen)}
                    className="w-8 h-8 bg-gray-700 hover:bg-gray-600 text-white rounded-full flex items-center justify-center transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  {/* Upload Dropdown Menu */}
                  {isUploadMenuOpen && (
                    <div className="absolute bottom-full right-0 mb-2 w-48 bg-gray-800 rounded-lg shadow-lg border border-gray-700 z-[60]">
                      <div className="py-1">
                        <label className="block w-full text-left px-4 py-2 text-white hover:bg-gray-700 transition-colors cursor-pointer text-sm">
                          <input
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                            multiple
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                          Upload Photos
                        </label>
                        <label className="block w-full text-left px-4 py-2 text-white hover:bg-gray-700 transition-colors cursor-pointer text-sm">
                          <input
                            type="file"
                            accept="video/mp4,video/mov"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                          Upload Video
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay to close menu when clicking outside */}
      {isUploadMenuOpen && (
        <div 
          className="fixed inset-0 z-[55]" 
          onClick={() => setIsUploadMenuOpen(false)}
        ></div>
      )}


    </div>
  )
} 