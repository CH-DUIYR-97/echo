import React, { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ref, getDownloadURL } from 'firebase/storage'
import { storage } from '../../lib/firebase'

interface Post {
  id: string
  userId: string
  meta: {
    createdAt: any
    updatedAt: any
  }
  content: {
    text: string
  }
  media: Array<{
    id: string
    kind: 'image'
    path: string
    size: number
    contentType: string
  }>
  usage: {
    uploadedBytes: number
  }
  flags: {
    archived: boolean
  }
}

interface PostCardProps {
  post: Post
}

export const PostCard: React.FC<PostCardProps> = ({ post }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [loadingImages, setLoadingImages] = useState(true)

  // Format timestamp to: Monday, November 4 2025, 3:45pm
  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return ''
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
    const month = date.toLocaleDateString('en-US', { month: 'long' })
    const day = date.getDate()
    const year = date.getFullYear()
    
    let hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? 'pm' : 'am'
    hours = hours % 12
    hours = hours ? hours : 12 // 0 should be 12
    const minutesStr = minutes < 10 ? '0' + minutes : minutes
    
    return `${dayName}, ${month} ${day} ${year}, ${hours}:${minutesStr}${ampm}`
  }

  // Load image URLs
  useEffect(() => {
    const loadImages = async () => {
      if (post.media.length === 0) {
        setLoadingImages(false)
        return
      }

      try {
        const urls = await Promise.all(
          post.media.map(async (media) => {
            const storageRef = ref(storage, media.path)
            return await getDownloadURL(storageRef)
          })
        )
        setImageUrls(urls)
      } catch (error) {
        console.error('Error loading images:', error)
      } finally {
        setLoadingImages(false)
      }
    }

    loadImages()
  }, [post.media])

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) => 
      prev === 0 ? imageUrls.length - 1 : prev - 1
    )
  }

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => 
      prev === imageUrls.length - 1 ? 0 : prev + 1
    )
  }

  return (
    <div className="bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800">
      {/* Timestamp */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <p className="text-gray-400 text-sm font-medium">
          {formatTimestamp(post.meta.createdAt)}
        </p>
      </div>

      {/* Image Carousel */}
      {post.media.length > 0 && (
        <div className="relative bg-black">
          {loadingImages ? (
            <div className="w-full h-96 flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <>
              {/* Main Image */}
              <img
                src={imageUrls[currentImageIndex]}
                alt={`Memory ${currentImageIndex + 1}`}
                className="w-full h-auto max-h-[600px] object-contain"
              />

              {/* Navigation Arrows (only show if more than 1 image) */}
              {imageUrls.length > 1 && (
                <>
                  {/* Left Arrow */}
                  <button
                    onClick={handlePrevImage}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-all"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>

                  {/* Right Arrow */}
                  <button
                    onClick={handleNextImage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-all"
                    aria-label="Next image"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>

                  {/* Dots Indicator */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {imageUrls.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`w-2 h-2 rounded-full transition-all ${
                          index === currentImageIndex
                            ? 'bg-white w-6'
                            : 'bg-white/50 hover:bg-white/70'
                        }`}
                        aria-label={`Go to image ${index + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Journal Text */}
      {post.content.text && (
        <div className="px-4 py-4">
          <p className="text-gray-200 whitespace-pre-wrap break-words">
            {post.content.text}
          </p>
        </div>
      )}
    </div>
  )
}

