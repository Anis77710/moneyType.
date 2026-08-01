import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const links = [
  { to: '/', label: 'Test' },
  { to: '/practice', label: 'Practice' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/lobby', label: 'Lobby' },
  { to: '/about', label: 'About' },
]

export default function Navbar() {
  const { pathname } = useLocation()
  const { user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSignOut = async () => {
    setMenuOpen(false)
    await signOut()
  }

  const userAvatar = user?.user_metadata?.avatar_url
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md">
      <nav className="flex justify-between items-center max-w-[1200px] mx-auto px-[10vw] py-8">
        <Link to="/" className="font-display-lg text-[32px] text-primary tracking-tighter">
          Typee
        </Link>
        <div className="hidden md:flex items-center gap-8">
          {links.map((link) => {
            const isActive = pathname === link.to
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`font-body-md text-body-md transition-all duration-200 ${
                  isActive
                    ? 'text-primary font-bold border-b-2 border-primary pb-1'
                    : 'text-secondary opacity-50 hover:text-primary hover:opacity-100'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 cursor-pointer group"
              >
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt={userName}
                    className="w-8 h-8 rounded-full border border-primary/30 object-cover group-hover:border-primary transition-colors"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full border border-primary/30 bg-surface-container flex items-center justify-center group-hover:border-primary transition-colors">
                    <span className="text-primary text-xs font-bold">{userName.split(' ').map(s => s[0]).join('').toUpperCase().slice(0, 2)}</span>
                  </div>
                )}
                <span className="hidden sm:block font-label-sm text-label-sm text-secondary opacity-70 group-hover:opacity-100 transition-opacity max-w-[120px] truncate">
                  {userName}
                </span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-12 w-56 bg-surface-container border border-outline-variant/30 rounded-xl shadow-2xl py-2 animate-fadeIn">
                  <div className="px-4 py-3 border-b border-outline-variant/20">
                    <p className="font-label-sm text-label-sm text-on-background font-bold truncate">{userName}</p>
                    <p className="font-label-sm text-label-sm text-secondary opacity-50 truncate">{user.email}</p>
                  </div>
                  <Link
                    to="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 font-label-sm text-label-sm text-secondary hover:text-on-background hover:bg-surface-container-high transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">person</span>
                    Profile
                  </Link>
                  <Link
                    to="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 font-label-sm text-label-sm text-secondary hover:text-on-background hover:bg-surface-container-high transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">settings</span>
                    Settings
                  </Link>
                  <div className="border-t border-outline-variant/20 mt-1 pt-1">
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3 px-4 py-2.5 font-label-sm text-label-sm text-error hover:bg-error/5 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">logout</span>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="font-label-sm text-label-sm text-secondary opacity-50 hover:text-primary hover:opacity-100 transition-all"
              >
                Sign In
              </Link>
              <Link
                to="/signup"
                className="px-4 py-2 bg-primary text-background font-label-sm text-label-sm font-bold rounded-lg hover:brightness-110 transition-all"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}
