import React, { useState, useEffect, useRef, useCallback } from 'react'
import { auth } from '../../lib/firebase'
import { collection, query, where, orderBy, limit, getDocs, startAfter, DocumentSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { PostCard } from './PostCard'

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

const POSTS_PER_PAGE = 10

export const MemoriesView: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const currentUser = auth.currentUser

  // Initial load
  useEffect(() => {
    if (currentUser) {
      loadPosts(true)
    }
  }, [currentUser])

  // Infinite scroll observer
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || loading) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadPosts(false)
        }
      },
      { threshold: 0.1 }
    )

    observerRef.current.observe(loadMoreRef.current)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [hasMore, loading, lastDoc])

  const loadPosts = async (isInitial: boolean) => {
    if (!currentUser) return

    setLoading(true)

    try {
      const postsRef = collection(db, `users/${currentUser.uid}/posts`)
      
      let q = query(
        postsRef,
        where('flags.archived', '==', false),
        orderBy('meta.createdAt', 'desc'),
        limit(POSTS_PER_PAGE)
      )

      if (!isInitial && lastDoc) {
        q = query(
          postsRef,
          where('flags.archived', '==', false),
          orderBy('meta.createdAt', 'desc'),
          startAfter(lastDoc),
          limit(POSTS_PER_PAGE)
        )
      }

      const snapshot = await getDocs(q)

      if (snapshot.empty) {
        setHasMore(false)
        setLoading(false)
        return
      }

      const newPosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Post[]

      if (isInitial) {
        setPosts(newPosts)
      } else {
        setPosts(prev => [...prev, ...newPosts])
      }

      setLastDoc(snapshot.docs[snapshot.docs.length - 1])
      setHasMore(snapshot.docs.length === POSTS_PER_PAGE)
    } catch (error) {
      console.error('Error loading posts:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!currentUser) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">Please sign in to view your memories</p>
        </div>
      </div>
    )
  }

  if (loading && posts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading your memories...</p>
        </div>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Welcome to Echo</h2>
          <p className="text-gray-400">Click "Create" to start writing your journal entry</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
        {posts.map(post => (
          <PostCard key={post.id} post={post} />
        ))}

        {/* Loading more indicator */}
        {hasMore && (
          <div ref={loadMoreRef} className="py-8 flex justify-center">
            {loading ? (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            ) : (
              <div className="h-8"></div>
            )}
          </div>
        )}

        {/* End of posts message */}
        {!hasMore && posts.length > 0 && (
          <div className="py-8 text-center text-gray-500 text-sm">
            You've reached the beginning of your journey 🌟
          </div>
        )}
      </div>
    </div>
  )
}

