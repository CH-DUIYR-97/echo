// /src/components/modals/DraftNotification.tsx
import { useEffect, useRef, useState } from 'react';

export interface DraftNotificationProps {
  draftUpdatedAt: number;
  onResume: () => void;
  onDismiss: () => void;
  autoDismissMs?: number;
}

function formatDraftAge(updatedAt: number): string {
  const mins = Math.floor((Date.now() - updatedAt) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs === 1) return '1 hour ago';
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export default function DraftNotification(p: DraftNotificationProps) {
    const { onResume, onDismiss } = p;
    
    const handleDismiss = () => {
      onDismiss?.();
    };
    
    const handleResume = () => {
      onResume?.();
    };

    const [isVisible, setIsVisible] = useState(true);
    const timerRef = useRef<number | null>(null);
    const closedRef = useRef(false);
  
    const safeAutoDismiss = Math.max(1000, p.autoDismissMs ?? 10000);
  
    useEffect(() => {
        if (!isVisible) return;
      
        closedRef.current = false;
      
        // start timer
        timerRef.current = window.setTimeout(() => {
          if (closedRef.current) return;
          closedRef.current = true;
          setIsVisible(false);
          onDismiss();
        }, safeAutoDismiss);
      
        // add keyboard handler (gated)
        const hasKeyboard =
          typeof window !== 'undefined' &&
          !!window.matchMedia &&
          window.matchMedia('(any-hover: hover) and (pointer: fine)').matches;
      
        const onKey = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            if (closedRef.current) return;
            closedRef.current = true;
            if (timerRef.current !== null) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
            }
            setIsVisible(false);
            onDismiss();
          }
        };
      
        if (hasKeyboard) window.addEventListener('keydown', onKey);
      
        // cleanup
        return () => {
          if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          if (hasKeyboard) window.removeEventListener('keydown', onKey);
        };
      }, [isVisible, safeAutoDismiss, onDismiss]);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
      <div className="bg-white rounded-lg shadow-2xl border border-gray-200 p-4 min-w-[320px] max-w-md">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
            <span className="text-xl">📝</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 mb-1">
              You have a saved draft
            </p>
            <p className="text-xs text-gray-600">
              Last edited {formatDraftAge(p.draftUpdatedAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
        <button
            type="button"
            onClick={handleDismiss}
            className="flex-1 px-3 py-2 text-sm border ..."
            aria-label="Dismiss draft notification"
            data-testid="dismiss-toast"
            >
            Dismiss
            </button>
            <button
            type="button"
            onClick={handleResume}
            className="flex-1 px-3 py-2 text-sm bg-gradient-to-r ..."
            aria-label="Resume editing from draft"
            data-testid="resume-toast"
            >
            Resume Editing
            </button>
        </div>
      </div>
    </div>
  );
}

