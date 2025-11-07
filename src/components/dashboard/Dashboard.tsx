import React, { useState, useEffect } from 'react'
import { signOutUser } from '../../lib/auth'
import { Home, Plus } from 'lucide-react'
import { getCurrentUser } from '../../lib/auth'
import { getUserProfile } from '../../lib/database'
import { CreateView } from './CreateView'
import { MemoriesView } from './MemoriesView'


export const Dashboard: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [userFirstName, setUserFirstName] = useState<string>('')
  const [currentView, setCurrentView] = useState<'memories' | 'create'>('memories')

  useEffect(() => {
    const fetchUserData = async () => {
      const currentUser = getCurrentUser()
      if (currentUser) {
        try {
          const { profile: userProfile } = await getUserProfile(currentUser.uid)
          if (userProfile?.firstName) {
            setUserFirstName(userProfile.firstName)
          }
        } catch (error) {
          console.error('Error fetching user profile:', error)
        }
      }
    }

    fetchUserData()
  }, [])

  const handleSignOut = async () => {
    try {
      await signOutUser()
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  const handleNavigation = (view: 'memories' | 'create') => {
    setCurrentView(view)
  }

  return (
    <div className="min-h-screen bg-stone-950 flex">
      {/* Left Sidebar */}
      <div className="w-64 bg-stone-950 border-r border-gray-800 flex flex-col">
        {/* Echo Logo */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center space-x-2">
            <h1 
              className="text-2xl tracking-tight"
              style={{
                color: '#FFFFFF',
                fontFamily: "'Lato', sans-serif",
                fontWeight: 600,
                textShadow: '0 2px 10px rgba(0,0,0,0.3), 0 0 20px rgba(255,255,255,0.2)',
              }}
            >
              Echo
            </h1>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => handleNavigation('memories')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
              currentView === 'memories' 
                ? 'text-white bg-gray-800' 
                : 'text-gray-300 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Home className={`w-5 h-5 transition-colors ${
              currentView === 'memories' 
                ? 'text-purple-400' 
                : 'group-hover:text-purple-400'
            }`} />
            <span className="text-base">Memories</span>
          </button>
          
          <button 
            onClick={() => handleNavigation('create')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
              currentView === 'create' 
                ? 'text-white bg-gray-800' 
                : 'text-gray-300 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Plus className={`w-5 h-5 transition-colors ${
              currentView === 'create' 
                ? 'text-purple-400' 
                : 'group-hover:text-purple-400'
            }`} />
            <span className="text-base">Create</span>
          </button>
        </nav>

        {/* Bottom Section - Personalized Message */}
        <div className="p-4 border-t border-gray-800">
          <p className="text-sm text-white font-bold italic">
            {userFirstName ? `${userFirstName}'s Private Log` : 'Your Private Log'}
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative">
        {/* Hamburger Menu (positioned absolutely) */}
        <div className="absolute top-4 right-4 z-50">
          <div className="relative">
            {/* Hamburger Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <div className="w-6 h-6 flex flex-col justify-center items-center">
                <div className="w-[19px] h-0.5 bg-white rounded-full mb-1"></div>
                <div className="w-[19px] h-0.5 bg-white rounded-full mb-1"></div>
                <div className="w-[19px] h-0.5 bg-white rounded-full"></div>
              </div>
            </button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div 
                className="absolute right-0 mt-2 w-32 bg-black rounded-lg shadow-lg border border-gray-700 z-[60]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="py-1">
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-3 py-1.5 text-white text-sm hover:bg-gray-800 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content Views */}
        {currentView === 'create' && (
          <div className="h-full p-6 space-y-6">
            <CreateView />
          </div>
        )}

        {currentView === 'memories' && (
          <MemoriesView />
        )}

        {/* Overlay to close menu when clicking outside */}
        {isMenuOpen && (
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsMenuOpen(false)}
          ></div>
        )}
      </div>
    </div>
  )
}