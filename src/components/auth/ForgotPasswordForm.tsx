import React, { useState } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { ArrowLeft, Mail, CheckCircle } from 'lucide-react'
import { resetPassword } from '../../lib/auth'
import type { AuthMode } from './AuthPage'

interface ForgotPasswordFormProps {
  onModeChange: (mode: AuthMode) => void
}

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({ onModeChange }) => {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const validateEmail = (email: string): string => {
    if (!email.trim()) {
      return 'Email is required'
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      return 'Please enter a valid email address'
    }
    
    return ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Clear previous errors
    setEmailError('')
    
    // Validate email
    const emailValidationError = validateEmail(email)
    if (emailValidationError) {
      setEmailError(emailValidationError)
      return
    }

    setIsLoading(true)

    try {
      const { error } = await resetPassword(email.trim())
      if (error) {
        throw error
      }
      setIsSuccess(true)
    } catch (error: any) {
      console.error('Password reset error:', error)
      
      if (error.code === 'auth/user-not-found') {
        setEmailError('No account found with this email address')
      } else if (error.code === 'auth/too-many-requests') {
        setEmailError('Too many attempts. Please try again later.')
      } else {
        setEmailError('Failed to send reset email. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="text-center space-y-4">
        <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
        <h3 className="text-xl font-semibold text-gray-900">Check your email</h3>
        <p className="text-gray-600">
          We've sent a reset link to <span className="font-semibold">{email}</span>
        </p>
        
        <div className="space-y-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onModeChange('signin')}
            className="w-full"
          >
            Back to Sign In
          </Button>
          
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setIsSuccess(false)
              setEmail('')
            }}
            className="w-full text-gray-600 hover:text-gray-800"
          >
            Send another email
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Back Button */}
      <div className="mb-6">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onModeChange('signin')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 p-0 h-auto"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sign In
        </Button>
      </div>

      {/* Header */}
      <div className="text-center mb-6">
        <Mail className="w-8 h-8 text-blue-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-gray-900 mb-1">Reset Password</h2>
        <p className="text-sm text-gray-700 font-medium">Enter your email to receive a reset link</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="Enter your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
          disabled={isLoading}
          required
        />
        
        <Button 
          type="submit" 
          loading={isLoading}
          className="w-full"
          disabled={isLoading}
        >
          Send Reset Link
        </Button>
      </form>
    </div>
  )
} 