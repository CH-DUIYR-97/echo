import React, { useState } from 'react'
import { cn } from '../../lib/utils'
import { AuthTabs } from './AuthTabs'
import { SignInForm } from './SignInForm'
import { SignUpForm } from './SignUpForm'
import { ForgotPasswordForm } from './ForgotPasswordForm'

export type AuthMode = 'signin' | 'signup' | 'forgot-password'

export const AuthPage: React.FC = () => {
  // State to track which form to show
  const [authMode, setAuthMode] = useState<AuthMode>('signin')

  return (
    <div className="min-h-screen mesh-bg flex items-center justify-center p-4">
      {/* Main container - centered with max width for larger screens */}
      <div className="w-full max-w-md">
        
        {/* App Logo/Title Section */}
        <div className="text-center mb-8">
          <h1
            className="text-5xl tracking-tight mb-2"
            style={{
              color: '#FFFFFF',
              fontFamily: "'Lato', sans-serif",
              fontWeight: 600,
              textShadow: '0 2px 10px rgba(0,0,0,0.3), 0 0 20px rgba(255,255,255,0.2)',
            }}
          >
            Echo
          </h1>

          <p
            className="text-base"
            style={{
              color: '#FFFFFF',
              fontFamily: "'Raleway', sans-serif",
              fontWeight: 600,
              fontStyle: 'italic',
              letterSpacing: '0.2px',
              textShadow: '0 1px 4px rgba(0,0,0,0.2)',
            }}
          >
            Your private journal for moments that matter.
          </p>
        </div>

        {/* Auth Container - This will hold our tabs and forms */}
        <div className="bg-gradient-to-br from-blue-50/95 via-indigo-50/95 to-purple-50/95 backdrop-blur-md rounded-lg p-6 shadow-2xl border-2 border-white/40">
          
          {/* AuthTabs Component */}
          <AuthTabs 
            activeMode={authMode} 
            onModeChange={setAuthMode} 
          />

          {/* Forms - Show different forms based on authMode */}
          {authMode === 'signin' && (
            <SignInForm onModeChange={setAuthMode} />
          )}
          
          {authMode === 'signup' && (
            <SignUpForm onModeChange={setAuthMode} />
          )}
          
          {authMode === 'forgot-password' && (
            <ForgotPasswordForm onModeChange={setAuthMode} />
          )}

        </div>
      </div>
    </div>
  )
} 