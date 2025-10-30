import React, { useState, useEffect, useRef } from 'react'
import { Plus, X, Mic } from 'lucide-react'
import RecordingBar from '../ui/RecordingBar'
import { auth, functions } from '../../lib/firebase'
import { httpsCallable } from 'firebase/functions'
import { compressBatch, type CompressedImage } from '../../lib/imageCompression'
import { UploadManager } from '../../lib/uploader'
import { buildDraftData, saveDraft, getDraft, deleteDraft, dataURLToBlob, type Draft } from '../../lib/drafts'
import DraftNotification from '../modals/DraftNotification'

const MAX_IMAGES = 5;

const formatTime = (ms: number) => {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
};

function showToast(message: string) {
  // Simple toast implementation - you can replace with your toast library
  console.log(`[TOAST] ${message}`);
  // TODO: Replace with proper toast notification
}

export const CreateView: React.FC = () => {
  const [content, setContent] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [isPosting, setIsPosting] = useState(false)
  const [showDraftNotification, setShowDraftNotification] = useState(false)
  const [draftToRestore, setDraftToRestore] = useState<Draft | null>(null)
  const [audioLevels, setAudioLevels] = useState<number[]>([])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const recordingIntervalRef = useRef<number | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileUrlsRef = useRef<Set<string>>(new Set())
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const isVisualizationActiveRef = useRef<boolean>(false)

  // Audio visualization constants
  const HISTORY_LEN = 180
  const historyRef = useRef<number[]>(Array(HISTORY_LEN).fill(0))
  const prevRmsRef = useRef(0)
  const lastPushRef = useRef(0)

  const currentUser = auth.currentUser

  // ─────────────────────────────────────────────────────────────────────────────
  // Draft restoration on mount
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    getDraft('current').then(draft => {
      if (draft) {
        setDraftToRestore(draft)
        setShowDraftNotification(true)
      }
    }).catch(err => console.warn('[CreateView] Failed to load draft', err))
  }, [])

  const handleResumeDraft = async () => {
    if (!draftToRestore) return
    setContent(draftToRestore.contentText)
    
    // Convert stored images back to Files
    const files: File[] = []
    for (const img of draftToRestore.images) {
      const blob = dataURLToBlob(img.dataURL)
      files.push(new File([blob], img.name, { type: img.type }))
    }
    setSelectedFiles(files)
    
    setShowDraftNotification(false)
    setDraftToRestore(null)
    await deleteDraft('current')
  }

  const handleDismissDraft = async () => {
    setShowDraftNotification(false)
    setDraftToRestore(null)
    await deleteDraft('current')
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Image selection with 5-image limit
  // ─────────────────────────────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    
    // Filter to images only
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    
    if (imageFiles.length !== files.length) {
      showToast('Only image files are supported')
    }
    
    if (imageFiles.length > MAX_IMAGES) {
      showToast(`You can attach up to ${MAX_IMAGES} images. Using the first ${MAX_IMAGES}.`)
    }
    
    const limited = imageFiles.slice(0, MAX_IMAGES)
    setSelectedFiles(limited)
    
    // Reset input
    if (e.target) e.target.value = ''
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Recording (STT) with original audio visualization
  // ─────────────────────────────────────────────────────────────────────────────
  const startRecording = async () => {
    if (!currentUser) return
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      
      audioChunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }
      
      // Setup audio visualization (original implementation)
      const audioContext = new AudioContext()
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)
      
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      isVisualizationActiveRef.current = true
      
      // Start visualization loop with RMS calculation
      const bufferLength = analyser.fftSize
      const dataArray = new Float32Array(bufferLength)
      
      const updateVolume = () => {
        if (!isVisualizationActiveRef.current || !analyserRef.current) return
        
        analyser.getFloatTimeDomainData(dataArray)
        
        // Calculate RMS
        let sumSquares = 0
        for (let i = 0; i < bufferLength; i++) {
          sumSquares += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sumSquares / bufferLength)
        
        // Smooth with previous value
        const smoothed = prevRmsRef.current * 0.7 + rms * 0.3
        prevRmsRef.current = smoothed
        
        // Push to history (throttled)
        const now = Date.now()
        if (now - lastPushRef.current > 50) {
          historyRef.current.push(smoothed)
          if (historyRef.current.length > HISTORY_LEN) {
            historyRef.current.shift()
          }
          setAudioLevels([...historyRef.current])
          lastPushRef.current = now
        }
        
        animationFrameRef.current = requestAnimationFrame(updateVolume)
      }
      updateVolume()
      
      mr.start()
      mediaRecorderRef.current = mr
      setIsRecording(true)
      startTimeRef.current = Date.now()
      
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime(Date.now() - startTimeRef.current)
      }, 100)
    } catch (err) {
      console.error('[CreateView] startRecording failed', err)
      alert('Could not start recording. Please check microphone permissions.')
    }
  }

  const stopRecording = () => {
    const mr = mediaRecorderRef.current
    if (!mr || mr.state === 'inactive') return

    return new Promise<void>((resolve) => {
      mr.onstop = async () => {
        const elapsed = Date.now() - startTimeRef.current
        setIsRecording(false)
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current)
        }
        
        // Stop visualization
        isVisualizationActiveRef.current = false
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        if (audioContextRef.current) {
          audioContextRef.current.close()
          audioContextRef.current = null
        }
        analyserRef.current = null
        setAudioLevels([])
        historyRef.current = Array(HISTORY_LEN).fill(0)
        prevRmsRef.current = 0
        
        // Stop all tracks
        mr.stream.getTracks().forEach(t => t.stop())
        
        // Create audio blob
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        audioChunksRef.current = []
        
        // Transcribe
        await transcribeAudio(audioBlob, elapsed)
        resolve()
      }
      
      mr.requestData()
      mr.stop()
    })
  }

  const cancelRecording = () => {
    const mr = mediaRecorderRef.current
    if (!mr) return
    
    setIsRecording(false)
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
    }
    
    // Stop visualization
    isVisualizationActiveRef.current = false
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
    setAudioLevels([])
    historyRef.current = Array(HISTORY_LEN).fill(0)
    prevRmsRef.current = 0
    setRecordingTime(0)
    
    // Stop recording
    mr.stream.getTracks().forEach(t => t.stop())
    if (mr.state !== 'inactive') {
      mr.stop()
    }
    audioChunksRef.current = []
  }

  const transcribeAudio = async (audioBlob: Blob, durationMs: number) => {
    if (!currentUser) return
    
    setIsTranscribing(true)
    
    try {
      const durationSec = Math.ceil(durationMs / 1000)
      const arrayBuffer = await audioBlob.arrayBuffer()
      const audioBase64 = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      )
      
      const transcribeFn = httpsCallable<{ audioBase64: string; durationSec: number; mimeType: string }, { text: string }>(
        functions,
        'transcribeAudio'
      )
      
      const result = await transcribeFn({
        audioBase64,
        durationSec,
        mimeType: 'audio/webm'
      })
      
      if (result.data.text) {
        setContent(prev => prev ? `${prev}\n${result.data.text}` : result.data.text)
      }
    } catch (err: any) {
      console.error('[CreateView] transcribeAudio failed', err)
      const message = err?.message || 'Transcription failed'
      alert(`Transcription error: ${message}`)
    } finally {
      setIsTranscribing(false)
      setRecordingTime(0)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Post submission (with compression + upload)
  // ─────────────────────────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!currentUser) return
    
    const trimmed = content.trim()
    if (!trimmed && selectedFiles.length === 0) {
      alert('Please add some content or images')
      return
    }
    
    setIsPosting(true)
    
    try {
      // 1) Compress images
      let compressed: CompressedImage[] = []
      if (selectedFiles.length > 0) {
        console.log('[CreateView] Compressing images...')
        compressed = await compressBatch(selectedFiles, undefined, {
          maxDim: 1920,
          targetSizeMin: 500_000,
          targetSizeMax: 1_500_000
        })
      }
      
      // 2) Upload to Storage
      const postId = `p${Date.now()}`
      const uploader = new UploadManager(3)
      
      const uploadItems = compressed.map((c, idx) => {
        const ext = c.contentType === 'image/webp' ? 'webp' : 'jpg'
        return {
          blob: c.blob,
          options: {
            storagePath: `users/${currentUser.uid}/posts/${postId}/images/${idx}_img.${ext}`,
            contentType: c.contentType,
          }
        }
      })
      
      console.log('[CreateView] Uploading images...')
      const uploadResults = await uploader.uploadBatch(uploadItems)
      
      const failed = uploadResults.filter(r => r.status !== 'completed')
      if (failed.length > 0) {
        throw new Error(`${failed.length} upload(s) failed`)
      }
      
      // 3) Finalize post via Cloud Function
      console.log('[CreateView] Finalizing post...')
      const finalizeFn = httpsCallable<{ postId: string; contentText: string }, { postId: string }>(
        functions,
        'createMemoryPost'
      )
      
      await finalizeFn({ postId, contentText: trimmed })
      
      // 4) Success! Clear state
      setContent('')
      setSelectedFiles([])
      
      alert('Post created successfully!')
    } catch (err: any) {
      console.error('[CreateView] handlePost failed', err)
      const message = err?.message || 'Failed to create post'
      alert(`Error: ${message}`)
    } finally {
      setIsPosting(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!content.trim() && selectedFiles.length === 0) {
      alert('Nothing to save')
      return
    }
    
    try {
      const draftData = await buildDraftData({
        contentText: content,
        imagesCompressed: selectedFiles.map(f => ({
          blob: f,
          name: f.name,
          type: f.type,
          size: f.size
        }))
      })
      await saveDraft(draftData)
      alert('Draft saved!')
    } catch (err) {
      console.error('[CreateView] saveDraft failed', err)
      alert('Failed to save draft')
    }
  }

  // Cleanup URLs on unmount
  useEffect(() => {
    return () => {
      fileUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      fileUrlsRef.current.clear()
    }
  }, [])

  const isButtonDisabled = isRecording || isTranscribing || isPosting

  // ═══════════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="h-full flex flex-col">
      {/* Draft notification */}
      {showDraftNotification && draftToRestore && (
        <DraftNotification
          draftUpdatedAt={draftToRestore.updatedAt}
          onResume={handleResumeDraft}
          onDismiss={handleDismissDraft}
        />
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Text input */}
          <textarea
            className="w-full min-h-[200px] p-4 bg-zinc-900 border border-zinc-800 rounded-lg resize-none focus:outline-none focus:border-blue-500"
            placeholder="What's on your mind?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isTranscribing || isPosting}
          />

          {/* Recording UI with waveform visualization */}
          {isRecording && (
            <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg p-4 shadow-lg">
              <RecordingBar
                timeLabel={formatTime(recordingTime)}
                bars={audioLevels}
                onCancel={cancelRecording}
                onConfirm={stopRecording}
              />
            </div>
          )}

          {isTranscribing && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <span className="text-blue-500 font-medium">Transcribing...</span>
            </div>
          )}

          {/* Selected images preview */}
          {selectedFiles.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {selectedFiles.map((file, idx) => {
                const url = URL.createObjectURL(file)
                fileUrlsRef.current.add(url)
                
                return (
                  <div key={idx} className="relative group">
                    <img
                      src={url}
                      alt={file.name}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => removeFile(idx)}
                      className="absolute top-1 right-1 bg-black/50 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      disabled={isPosting}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Mic button - only show when not recording (RecordingBar handles controls when recording) */}
            {!isRecording && (
              <button
                onClick={startRecording}
                disabled={isTranscribing || isPosting}
                className="p-3 rounded-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}

            {/* Image attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isButtonDisabled || selectedFiles.length >= MAX_IMAGES}
              className="p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-5 h-5" />
            </button>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Save draft button */}
            <button
              onClick={handleSaveDraft}
              disabled={isButtonDisabled}
              className="ml-auto px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Draft
            </button>
          </div>
        </div>
      </div>

      {/* Fixed Post button */}
      <div className="fixed bottom-4 right-4">
        <button
          onClick={handlePost}
          disabled={isButtonDisabled || (!content.trim() && selectedFiles.length === 0)}
          className="px-8 py-3 bg-blue-500 hover:bg-blue-600 rounded-full font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPosting ? 'Posting...' : 'Post'}
        </button>
      </div>
    </div>
  )
}

export default CreateView
