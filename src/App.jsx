import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { SettingsProvider } from './context/SettingsContext'
import ProtectedRoute from './components/ProtectedRoute'
import HomePage from './pages/HomePage'
import LeaderboardPage from './pages/LeaderboardPage'
import PracticePage from './pages/PracticePage'
import LobbyPage from './pages/LobbyPage'
import AboutPage from './pages/AboutPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import ZenModePage from './pages/ZenModePage'
import TestResultsPage from './pages/TestResultsPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'

function EscapeToHome() {
  const navigate = useNavigate()
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') navigate('/')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <SettingsProvider>
      <AuthProvider>
        <EscapeToHome />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/zen" element={<ZenModePage />} />
          <Route path="/results" element={<TestResultsPage />} />
          <Route path="/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
      </SettingsProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
