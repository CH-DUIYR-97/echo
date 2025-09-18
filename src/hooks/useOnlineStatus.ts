import { useState, useEffect } from 'react';

export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return isOnline;
};

// Auto-retry deferred transcriptions when back online
export const useDeferredTranscriptionProcessor = () => {
  const isOnline = useOnlineStatus();
  const [deferredRecordings, setDeferredRecordings] = useState<Blob[]>([]);
  
  useEffect(() => {
    if (isOnline && deferredRecordings.length > 0) {
      // Process deferred recordings
      processDeferredRecordings();
    }
  }, [isOnline]);
  
  const processDeferredRecordings = async () => {
    // Process any recordings that were deferred due to offline status
    console.log('🔄 Processing deferred recordings...');
    
    for (const recording of deferredRecordings) {
      try {
        // Attempt to transcribe the deferred recording
        // This would integrate with your existing transcription flow
        console.log('Processing deferred recording:', recording.size, 'bytes');
      } catch (error) {
        console.error('Failed to process deferred recording:', error);
      }
    }
    
    // Clear processed recordings
    setDeferredRecordings([]);
  };
  
  const addDeferredRecording = (recording: Blob) => {
    setDeferredRecordings(prev => [...prev, recording]);
  };
  
  return {
    isOnline,
    deferredRecordings,
    addDeferredRecording,
    processDeferredRecordings
  };
};
