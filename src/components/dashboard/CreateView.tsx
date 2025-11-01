import React, { useState, useEffect, useRef } from 'react'
import { Plus, X, Mic, ArrowUp } from 'lucide-react'
import RecordingBar from '../ui/RecordingBar'
import { auth, functions } from '../../lib/firebase'
import { httpsCallable } from 'firebase/functions'
import { compressBatch, type CompressedImage } from '../../lib/imageCompression'
import { UploadManager } from '../../lib/uploader'

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
  // Send/Submit (with compression + upload)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!currentUser) return
    
    const trimmed = content.trim()
    if (!trimmed && selectedFiles.length === 0) {
      return // Silently ignore empty submissions
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
    } catch (err: any) {
      console.error('[CreateView] handleSend failed', err)
      const message = err?.message || 'Failed to send'
      alert(`Error: ${message}`)
    } finally {
      setIsPosting(false)
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
    <div className="h-full flex flex-col justify-end p-4">
      <div className="w-full max-w-3xl mx-auto mb-4">
        {/* Transcribing state - shows above the input box */}
        {isTranscribing && (
          <div className="mb-4 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <span className="text-blue-500 font-medium">Transcribing...</span>
          </div>
        )}

        {/* Main input box - same style when recording */}
        <div className="relative bg-zinc-800 border border-zinc-700/30 rounded-2xl p-4 shadow-xl transition-all duration-300">
          {/* Recording mode - show RecordingBar */}
          {isRecording ? (
            <RecordingBar
              timeLabel={formatTime(recordingTime)}
              bars={audioLevels}
              onCancel={cancelRecording}
              onConfirm={stopRecording}
            />
          ) : (
            <>
              {/* Selected images preview - inside the box */}
              {selectedFiles.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {selectedFiles.map((file, idx) => {
                    const url = URL.createObjectURL(file)
                    fileUrlsRef.current.add(url)
                    
                    return (
                      <div key={idx} className="relative group">
                        <img
                          src={url}
                          alt={file.name}
                          className="w-full h-20 object-cover rounded-lg"
                        />
                        <button
                          onClick={() => removeFile(idx)}
                          className="absolute top-1 right-1 bg-black/70 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          disabled={isPosting}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Text input with reduced height */}
              <textarea
                className="w-full h-15 bg-transparent border-none resize-none focus:outline-none text-white placeholder-zinc-50 text-[15px]"
                placeholder="What's on your mind?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={isTranscribing || isPosting}
              />

              {/* Bottom bar with buttons inside the box - no separator line */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  {/* Mic button */}
                  <button
                    onClick={startRecording}
                    disabled={isTranscribing || isPosting}
                    className="p-2 rounded-full hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Record voice"
                  >
                    <Mic className="w-5 h-5 text-zinc-400" />
                  </button>

                  {/* Image attach button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isButtonDisabled || selectedFiles.length >= MAX_IMAGES}
                    className="p-2 rounded-full hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Attach images"
                  >
                    <Plus className="w-5 h-5 text-zinc-400" />
                  </button>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                {/* Arrow-up send button on the right */}
                <button
                  onClick={handleSend}
                  disabled={isButtonDisabled || (!content.trim() && selectedFiles.length === 0)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white hover:bg-zinc-100 text-black border border-white/10 shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Send"
                >
                  <ArrowUp className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CreateView
