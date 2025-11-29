import React, { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, completeRedirectIfAny } from '../../lib/auth';
import { AuthPage } from './AuthPage';
import { Dashboard } from '../dashboard/Dashboard';

export const AuthWrapper: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 1) Finish any pending Google redirect (needed on iOS/Android via Capacitor)
  useEffect(() => {
    completeRedirectIfAny().catch((err: unknown) => {
      console.error('[auth] completeRedirectIfAny failed', err);
    });
  }, []);

  // 2) Safety timeout so the UI never hangs forever
  useEffect(() => {
    const t = setTimeout(() => {
      if (isLoading) {
        console.warn('[auth] timeout hit, showing AuthPage');
        setIsLoading(false);
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [isLoading]);

  // 3) Subscribe to auth state
  useEffect(() => {
    console.log('[auth] AuthWrapper mounted v2.1.0. href=', location.href)
    const unsub = onAuthStateChanged((u) => {
      console.log('[auth] state changed →', u ? `uid=${u.uid}` : 'null');
      setUser(u);
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen mesh-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }

  return user ? <Dashboard /> : <AuthPage />;
};