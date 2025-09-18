import React from 'react'
import { cn } from '../../lib/utils'
import type { AuthMode } from './AuthPage'

interface AuthTabsProps {
  activeMode: AuthMode
  onModeChange: (mode: AuthMode) => void
}

export const AuthTabs: React.FC<AuthTabsProps> = ({ activeMode, onModeChange }) => {
  return (
    <div className="flex space-x-1 mb-6">
      {/* Sign In Tab */}
      <button
        type="button"
        className={cn(
          "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 border",
          activeMode === 'signin'
            ? "bg-purple-200/95 text-black shadow-sm border-purple-400/80"
            : "text-black hover:text-purple-800 hover:bg-purple-200/95 hover:border-purple-400/80 border-gray-400"
        )}
        onClick={() => onModeChange('signin')}
      >
        Sign In
      </button>

      {/* Sign Up Tab */}
      <button
        type="button"
        className={cn(
          "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 border",
          activeMode === 'signup'
            ? "bg-purple-200/95 text-black shadow-sm border-purple-400/80"
            : "text-black hover:text-pink-800 hover:bg-pink-200/95 hover:border-pink-400/80 border-gray-400"
        )}
        onClick={() => onModeChange('signup')}
      >
        Sign Up
      </button>
    </div>
  )
} 