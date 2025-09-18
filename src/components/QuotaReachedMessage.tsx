import React from 'react';

interface QuotaReachedMessageProps {
  type: 'upload' | 'speech';
  hoursToReset: number;
  onUpgrade?: () => void;
}

export const QuotaReachedMessage: React.FC<QuotaReachedMessageProps> = ({ 
  type, 
  hoursToReset,
  onUpgrade
}) => {
  return (
    <div className="quota-message bg-orange-50 border border-orange-200 rounded-lg p-4">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <span className="text-orange-500">⏰</span>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-orange-800">
            Daily Limit Reached
          </h3>
          <div className="mt-2 text-sm text-orange-700">
            <p>
              You've hit today's free limit. It resets in {hoursToReset} hours at 12:00 AM AEST.
            </p>
            {onUpgrade && (
              <button 
                className="mt-2 text-sm font-medium text-orange-800 underline hover:text-orange-900"
                onClick={onUpgrade}
              >
                Upgrade to Echo Plus ($7/month) for higher limits
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface DeferredMessageProps {
  reason: 'offline' | 'quota';
  hoursToReset?: number;
}

export const DeferredMessage: React.FC<DeferredMessageProps> = ({ 
  reason, 
  hoursToReset 
}) => {
  if (reason === 'offline') {
    return (
      <div className="deferred-message bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-center">
          <span className="text-blue-500 mr-2">📡</span>
          <span className="text-blue-700">Recorded ✓ — offline now. We'll transcribe when you're back online.</span>
        </div>
      </div>
    );
  }
  
  if (reason === 'quota') {
    return (
      <div className="deferred-message bg-orange-50 border border-orange-200 rounded-lg p-3">
        <div className="flex items-center">
          <span className="text-orange-500 mr-2">⏰</span>
          <span className="text-orange-700">Recorded ✓ — we'll transcribe after your daily limit resets at 12:00 AM AEST.</span>
        </div>
      </div>
    );
  }
  
  return null;
};
