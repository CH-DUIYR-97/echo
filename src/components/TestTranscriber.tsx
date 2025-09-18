import { useState } from 'react'
import { auth, uploadAndTranscribe } from '../lib/firebase'

export default function TestTranscriber() {
  const [transcript, setTranscript] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const user = auth.currentUser
    if (!user) {
      alert("Please sign in first")
      return
    }

    try {
      const { text, storagePath } = await uploadAndTranscribe(file, user.uid)
      console.log("Transcript:", text, "stored at:", storagePath)
      setTranscript(text)
    } catch (err) {
      console.error("Error uploading or transcribing:", err)
    }
  }

  return (
    <div>
      <input type="file" accept="audio/*" onChange={handleFileChange} />
      {transcript && (
        <div>
          <h3>Transcript:</h3>
          <p>{transcript}</p>
        </div>
      )}
    </div>
  )
}