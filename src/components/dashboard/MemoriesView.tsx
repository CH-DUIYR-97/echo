import React, { useState, useEffect, useRef } from 'react'
import { auth } from '../../lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
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
  const [uid, setUid] = useState<string | null>(null)

// subscribe to auth and set uid 
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      console.log('[auth] uid =', user?.uid ?? '(none)')      // ⬅️ WHO AM I?
      setUid(user?.uid ?? null)
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!uid) return
    const path = `users/${uid}/posts`
    console.log('[debug] path =', path)                       // ⬅️ WHICH LOCKER?
  
    // tiny read to prove rules/path/auth are correct
    getDocs(collection(db, 'users', uid, 'posts'))
      .then(snap => console.log('[debug] docs count =', snap.size))
      .catch((e: any) => console.error('[debug] simple read failed', e.code, e.message))
  }, [uid])


// 2) 🔒 Reset list whenever uid changes (put this immediately after #1)
useEffect(() => {
  setPosts([])
  setHasMore(true)
  setLastDoc(null)
  setLoading(false) // optional: clears spinners on sign-out
}, [uid])


  // Initial load when we actually know the uid
  useEffect(() => {
    if (uid) loadPosts(true)
  }, [uid])

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
    if (!uid) return
  
    setLoading(true)
    try {
      const postsRef = collection(db, 'users', uid, 'posts') // safer path building
  
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

  if (!uid) {
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

  const handleDeletePost = (postId: string) => {
    // Remove post from UI immediately
    setPosts(prev => prev.filter(post => post.id !== postId))
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
        {posts.map(post => (
          <PostCard key={post.id} post={post} onDelete={handleDeletePost} />
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

