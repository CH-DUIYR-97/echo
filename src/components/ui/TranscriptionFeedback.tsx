import React, { useState } from 'react'
import { ThumbsUp, ThumbsDown, Edit3, Check, X } from 'lucide-react'
import { Button } from './Button'

interface TranscriptionFeedbackProps {
  originalText: string
  onFeedback: (feedback: {
    rating: 'good' | 'poor'
    correctedText?: string
    isHelpful: boolean
  }) => void
  onClose: () => void
}

export const TranscriptionFeedback: React.FC<TranscriptionFeedbackProps> = ({
  originalText,
  onFeedback,
  onClose,
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [correctedText, setCorrectedText] = useState(originalText)
  const [showFeedback, setShowFeedback] = useState(true)

  const handleGoodFeedback = () => {
    onFeedback({
      rating: 'good',
      isHelpful: true
    })
    setShowFeedback(false)
    setTimeout(onClose, 1000) // Auto-close after showing thanks
  }

  const handlePoorFeedback = () => {
    onFeedback({
      rating: 'poor',
      correctedText: isEditing ? correctedText : undefined,
      isHelpful: false
    })
    setShowFeedback(false)
    setTimeout(onClose, 1000)
  }

  const handleStartEdit = () => {
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    setIsEditing(false)
    handlePoorFeedback()
  }

  const handleCancelEdit = () => {
    setCorrectedText(originalText)
    setIsEditing(false)
  }

  if (!showFeedback) {
    return (
      <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50">
        Thank you for your feedback! 🎯
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-sm bg-black/95 backdrop-blur-sm border border-gray-600 rounded-xl shadow-lg p-4 z-50">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-white mb-2">
          How was this transcription?
        </h3>
        
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              value={correctedText}
              onChange={(e) => setCorrectedText(e.target.value)}
              className="w-full p-2 border border-gray-600 rounded-md text-sm resize-none bg-gray-800 text-white placeholder-gray-400"
              rows={3}
              placeholder="Enter the correct text..."
            />
            <div className="flex justify-end space-x-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCancelEdit}
                className="flex items-center space-x-1"
              >
                <X className="w-3 h-3" />
                <span>Cancel</span>
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                className="flex items-center space-x-1"
              >
                <Check className="w-3 h-3" />
                <span>Save</span>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="text-xs text-gray-300 bg-gray-800 p-2 rounded border border-gray-600 mb-3 max-h-20 overflow-y-auto">
              "{originalText}"
            </div>
            
            <div className="flex justify-between items-center">
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleGoodFeedback}
                  className="flex items-center space-x-1 text-green-400 hover:bg-green-900/30 border-gray-600"
                >
                  <ThumbsUp className="w-3 h-3" />
                  <span>Good</span>
                </Button>
                
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleStartEdit}
                  className="flex items-center space-x-1 text-blue-400 hover:bg-blue-900/30 border-gray-600"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit</span>
                </Button>
                
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handlePoorFeedback}
                  className="flex items-center space-x-1 text-red-400 hover:bg-red-900/30 border-gray-600"
                >
                  <ThumbsDown className="w-3 h-3" />
                  <span>Poor</span>
                </Button>
              </div>
              
              <Button
                size="sm"
                variant="ghost"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-200"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
