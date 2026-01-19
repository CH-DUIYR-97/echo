import React, { useState } from 'react'
import { Button, Input } from '../ui'
import type { AuthMode } from './AuthPage'
import { Eye, EyeOff, Info } from 'lucide-react'
import { signInWithEmail, getAuthErrorMessage } from '../../lib/auth'
import { GoogleSignInButton } from './GoogleSignInButton'

interface SignInFormProps {
  onModeChange: (mode: AuthMode) => void
}

export const SignInForm: React.FC<SignInFormProps> = ({ onModeChange }) => {
  // Form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  
  // Validation state
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  // Password validation function
  const validatePassword = (password: string): string => {
    if (password.length < 6) {
      return 'Password must be at least 6 characters'
    }
    
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least 1 uppercase letter'
    }
    
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least 1 lowercase letter'
    }
    
    if (!/\d/.test(password)) {
      return 'Password must contain at least 1 number'
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return 'Password must contain at least 1 symbol (!@#$%^&*(),.?":{}|&gt;)'
    }
    
    return ''
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('🔵 [SignInForm] Submit button clicked! Email:', email); 

    // Reset errors
    setEmailError('')
    setPasswordError('')
    
    // Basic validation
    if (!email.trim()) {
      console.log('❌ [SignInForm] Email validation failed');
      setEmailError('Email is required')
      return
    }
    
    if (!password.trim()) {
      console.log('❌ [SignInForm] Password validation failed');
      setPasswordError('Password is required')
      return
    }
    
    // Advanced password validation
    const passwordValidationError = validatePassword(password)
    if (passwordValidationError) {
      console.log('❌ [SignInForm] Password validation failed:', passwordValidationError);
      setPasswordError(passwordValidationError)
      return
    }

    console.log('✅ [SignInForm] All validation passed, calling signInWithEmail...');
    
    // Firebase authentication
    setIsLoading(true)
    
    try {
      const { user, error } = await signInWithEmail(email, password)
      
      if (error) {
        console.error('Sign in error:', error)
        // Set appropriate error message
        if (error.code === 'auth/user-not-found') {
          setEmailError('No account found with this email address')
        } else if (error.code === 'auth/wrong-password') {
          setPasswordError('Incorrect password')
        } else {
          setEmailError(getAuthErrorMessage(error))
        }
      } else if (user) {
        console.log('Sign in successful:', user)
        // You can add success handling here later
        // For now, just log the success
        alert('Sign in successful!')
      }
    } catch (error) {
      console.error('Unexpected error during sign in:', error)
      setEmailError('An unexpected error occurred during sign in')
    } finally {
      setIsLoading(false)
    }
  }

  // Toggle password visibility
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  return (
    <div>
      {/* Google Sign In Button */}
      <GoogleSignInButton disabled={isLoading} />
      
      {/* Divider */}
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-600"></div>
        </div>
      </div>
      
      {/* Email/Password Form */}
      <form onSubmit={handleSubmit} className="space-y-4" style={{ marginTop: '3rem' }}>
        {/* Email Input */}
        <Input
          label="Email"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
          disabled={isLoading}
          required
        />
        
        {/* Password Input with Eye Icon and Requirements Tooltip */}
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <label className="block text-sm font-medium text-black">
              Password
            </label>
            <div className="group relative">
              <Info className="h-4 w-4 text-gray-400 cursor-help" />
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                <div className="space-y-1">
                  <p className="font-medium">Password requirements:</p>
                  <ul className="space-y-0.5">
                    <li>• At least 6 characters</li>
                    <li>• At least 1 uppercase letter (A-Z)</li>
                    <li>• At least 1 lowercase letter (a-z)</li>
                    <li>• At least 1 number (0-9)</li>
                    <li>• At least 1 symbol (!@#$%^&*(),.?":{}|&gt;)</li>
                  </ul>
                </div>
                {/* Tooltip arrow */}
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
              </div>
            </div>
          </div>
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError}
            disabled={isLoading}
            required
            rightIcon={
              showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )
            }
            onRightIconClick={togglePasswordVisibility}
          />
        </div>
        
        {/* Submit Button */}
        <Button 
          type="submit" 
          loading={isLoading}
          className="w-full"
          disabled={isLoading}
        >
          Sign In
        </Button>
        
        {/* Forgot Password Link */}
        <div className="text-center">
          <Button 
            type="button" 
            variant="outline"
            onClick={() => onModeChange('forgot-password')}
            className="w-full"
            disabled={isLoading}
          >
            Forgot your password?
          </Button>
        </div>
      </form>
    </div>
  )
} 