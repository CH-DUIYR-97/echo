import React, { useState } from 'react'
import { Button, Input } from '../ui'
import { cn } from '../../lib/utils'
import type { AuthMode } from './AuthPage'
import { Eye, EyeOff, Info } from 'lucide-react'
import { signUpWithEmail, getAuthErrorMessage } from '../../lib/auth'
import { GoogleSignInButton } from './GoogleSignInButton'

interface SignUpFormProps {
  onModeChange: (mode: AuthMode) => void
}

export const SignUpForm: React.FC<SignUpFormProps> = ({ onModeChange }) => {
  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  // Validation state
  const [firstNameError, setFirstNameError] = useState('')
  const [lastNameError, setLastNameError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [confirmPasswordError, setConfirmPasswordError] = useState('')

  // Password validation function (same as SignInForm)
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
    
    // Reset errors
    setFirstNameError('')
    setLastNameError('')
    setEmailError('')
    setPasswordError('')
    setConfirmPasswordError('')
    
    // Basic validation
    if (!firstName.trim()) {
      setFirstNameError('First name is required')
      return
    }
    
    if (!lastName.trim()) {
      setLastNameError('Last name is required')
      return
    }
    
    if (!email.trim()) {
      setEmailError('Email is required')
      return
    }
    
    if (!password.trim()) {
      setPasswordError('Password is required')
      return
    }
    
    if (!confirmPassword.trim()) {
      setConfirmPasswordError('Please confirm your password')
      return
    }
    
    // Advanced password validation
    const passwordValidationError = validatePassword(password)
    if (passwordValidationError) {
      setPasswordError(passwordValidationError)
      return
    }
    
    // Password matching validation
    if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match')
      return
    }
    
    // Firebase authentication
    setIsLoading(true)
    
    try {
      const { user, error } = await signUpWithEmail(email, password, {
        firstName: firstName,
        lastName: lastName
      })
      
      if (error) {
        console.error('Sign up error:', error)
        // Set appropriate error message
        if (error.code === 'auth/email-already-in-use') {
          setEmailError('An account with this email already exists')
        } else if (error.code === 'auth/weak-password') {
          setPasswordError('Password is too weak')
        } else {
          setEmailError(getAuthErrorMessage(error))
        }
      } else if (user) {
        console.log('Sign up successful:', user)
        // You can add success handling here later
        // For now, just log the success
        alert('Sign up successful! Welcome to Echo!')
      }
    } catch (error) {
      console.error('Unexpected error during sign up:', error)
      setEmailError('An unexpected error occurred during sign up')
    } finally {
      setIsLoading(false)
    }
  }

  // Toggle password visibility
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword)
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
        {/* Name Fields - Side by Side */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="First Name"
            type="text"
            placeholder="Enter your first name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={firstNameError}
            disabled={isLoading}
            required
          />
          
          <Input
            label="Last Name"
            type="text"
            placeholder="Enter your last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            error={lastNameError}
            disabled={isLoading}
            required
          />
        </div>
        
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
        
        {/* Confirm Password Input with Eye Icon */}
        <Input
          label="Confirm Password"
          type={showConfirmPassword ? "text" : "password"}
          placeholder="Confirm your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={confirmPasswordError}
          disabled={isLoading}
          required
          rightIcon={
            showConfirmPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )
          }
          onRightIconClick={toggleConfirmPasswordVisibility}
        />
        
        {/* Submit Button */}
        <Button 
          type="submit" 
          loading={isLoading}
          className="w-full"
          disabled={isLoading}
        >
          Sign Up
        </Button>
        
        {/* Sign In Link */}
        <div className="w-full">
          <Button 
            type="button" 
            variant="outline"
            onClick={() => onModeChange('signin')}
            className="w-full"
            disabled={isLoading}
          >
            <div className="flex flex-col items-center justify-center">
              <p>Already have an account?</p>
            </div>
          </Button>
        </div>
      </form>
    </div>
  )
} 