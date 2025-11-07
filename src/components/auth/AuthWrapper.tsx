import React, { useState, useEffect } from 'react'
import { onAuthStateChanged } from '../../lib/auth'
import type { User } from 'firebase/auth'
import { AuthPage } from './AuthPage'
import { Dashboard } from '../dashboard/Dashboard'

export const AuthWrapper: React.FC = () => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Set up auth state listener
    const unsubscribe = onAuthStateChanged((user) => {
      setUser(user)
      setIsLoading(false)
    })

    // Cleanup subscription on unmount
    return () => unsubscribe()
  }, [])

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen mesh-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-white">Loading...</p>
        </div>
      </div>
    )
  }

  // Show dashboard if user is logged in, auth page if not
  return user ? <Dashboard /> : <AuthPage />
} 