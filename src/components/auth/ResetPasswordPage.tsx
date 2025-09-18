import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Eye, EyeOff, CheckCircle, AlertCircle, Lock, Loader2 } from 'lucide-react'

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')
  const [isValidToken, setIsValidToken] = useState(false)
  const [isValidatingToken, setIsValidatingToken] = useState(true)

  const oobCode = searchParams.get('oobCode')

  // Validate the reset token when component mounts
  useEffect(() => {
    const validateToken = async () => {
      if (!oobCode) {
        setError('Invalid reset link. Please request a new password reset.')
        setIsValidatingToken(false)
        return
      }

      try {
        await verifyPasswordResetCode(auth, oobCode)
        setIsValidToken(true)
      } catch (error: any) {
        console.error('Token validation error:', error)
        if (error.code === 'auth/invalid-action-code') {
          setError('This reset link has expired or is invalid. Please request a new password reset.')
        } else if (error.code === 'auth/expired-action-code') {
          setError('This reset link has expired. Please request a new password reset.')
        } else {
          setError('Invalid reset link. Please request a new password reset.')
        }
      } finally {
        setIsValidatingToken(false)
      }
    }

    validateToken()
  }, [oobCode])

  const validatePassword = (password: string): string => {
    if (password.length < 6) {
      return 'Password must be at least 6 characters long'
    }
    
    const hasUpperCase = /[A-Z]/.test(password)
    const hasLowerCase = /[a-z]/.test(password)
    const hasNumbers = /\d/.test(password)
    const hasSymbols = /[!@#$%^&*(),.?":{}|<>]/.test(password)
    
    if (!hasUpperCase) return 'Password must contain at least 1 uppercase letter'
    if (!hasLowerCase) return 'Password must contain at least 1 lowercase letter'
    if (!hasNumbers) return 'Password must contain at least 1 number'
    if (!hasSymbols) return 'Password must contain at least 1 symbol'
    
    return ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!oobCode) {
      setError('Invalid reset link')
      return
    }

    // Clear previous errors
    setError('')

    // Validate passwords
    const passwordError = validatePassword(newPassword)
    if (passwordError) {
      setError(passwordError)
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsLoading(true)

    try {
      await confirmPasswordReset(auth, oobCode, newPassword)
      setIsSuccess(true)
      
      // Redirect to sign-in page after 3 seconds
      setTimeout(() => {
        navigate('/')
      }, 3000)
    } catch (error: any) {
      console.error('Password reset error:', error)
      
      if (error.code === 'auth/invalid-action-code') {
        setError('This reset link has expired or is invalid. Please request a new password reset.')
      } else if (error.code === 'auth/expired-action-code') {
        setError('This reset link has expired. Please request a new password reset.')
      } else if (error.code === 'auth/weak-password') {
        setError('Password is too weak. Please choose a stronger password.')
      } else {
        setError('Failed to reset password. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (isValidatingToken) {
    return (
      <div className="min-h-screen mesh-bg flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-purple-100/95 via-pink-50/95 to-purple-50/95 backdrop-blur-md rounded-lg p-8 shadow-2xl border-2 border-white/40 max-w-md w-full">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Validating reset link...</p>
          </div>
        </div>
      </div>
    )
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen mesh-bg flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-purple-100/95 via-pink-50/95 to-purple-50/95 backdrop-blur-md rounded-lg p-8 shadow-2xl border-2 border-white/40 max-w-md w-full">
          <div className="text-center space-y-4">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-900">Password Updated!</h2>
            <p className="text-gray-600">Redirecting to sign-in...</p>
            <Button
              type="button"
              onClick={() => navigate('/')}
              className="w-full"
            >
              Go to Sign In
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!isValidToken) {
    return (
      <div className="min-h-screen mesh-bg flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-purple-100/95 via-pink-50/95 to-purple-50/95 backdrop-blur-md rounded-lg p-8 shadow-2xl border-2 border-white/40 max-w-md w-full">
          <div className="text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-red-600 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-900">Invalid Link</h2>
            <p className="text-gray-600">{error}</p>
            <Button
              type="button"
              onClick={() => navigate('/')}
              className="w-full"
            >
              Back to Sign In
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen mesh-bg flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-purple-100/95 via-pink-50/95 to-purple-50/95 backdrop-blur-md rounded-lg p-8 shadow-2xl border-2 border-white/40 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <Lock className="w-8 h-8 text-blue-600 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-900 mb-2">Reset Password</h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input
            label="New Password"
              type={showPassword ? "text" : "password"}
            placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isLoading}
              required
              rightIcon={
                showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )
              }
              onRightIconClick={() => setShowPassword(!showPassword)}
            />

          <Input
            label="Confirm Password"
            type={showConfirmPassword ? "text" : "password"}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            required
            rightIcon={
              showConfirmPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )
            }
            onRightIconClick={() => setShowConfirmPassword(!showConfirmPassword)}
          />

          {/* Error Message */}
          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <Button 
            type="submit" 
            loading={isLoading}
            className="w-full"
            disabled={isLoading}
          >
            Reset Password
          </Button>
        </form>
      </div>
    </div>
  )
}
