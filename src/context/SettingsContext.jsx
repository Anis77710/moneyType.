/* oxlint-disable react/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const SettingsContext = createContext(null)

const DEFAULTS = {
  fontFamily: 'JetBrains Mono',
  fontSize: 32,
  quickRestart: true,
  liveWpm: true,
  liveAcc: false,
  strictFocus: false,
  blindMode: false,
  difficulty: 'Normal',
  minSpeed: 0,
  keypressSound: false,
  soundTheme: 'Mechanical',
}

function load() {
  try {
    const raw = localStorage.getItem('typee-settings')
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

const SOUNDS = {
  Mechanical: [0.05, 0.04, 0.07, 0.03],
  Click: [0.02, 0.01],
  Pop: [0.08, 0.06],
  Retro: [0.03, 0.02, 0.01],
}

function playKeypress(theme) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const durations = SOUNDS[theme] || SOUNDS.Mechanical
    const duration = durations[Math.floor(Math.random() * durations.length)]
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 800 + Math.random() * 400
    osc.type = 'square'
    gain.gain.setValueAtTime(0.03, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  } catch {}
}

export function SettingsProvider({ children }) {
  const [settings, setSettingsState] = useState(load)

  const setSetting = useCallback((key, value) => {
    setSettingsState(prev => {
      const next = { ...prev, [key]: value }
      localStorage.setItem('typee-settings', JSON.stringify(next))
      return next
    })
  }, [])

  const playKeypressSound = useCallback(() => {
    playKeypress(settings.soundTheme)
  }, [settings.soundTheme])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--font-typing-area', settings.fontFamily)
    root.style.setProperty('--font-body-md', settings.fontFamily)
    root.style.setProperty('--font-label-sm', settings.fontFamily)
    root.style.setProperty('--font-display-lg', settings.fontFamily)
    root.style.setProperty('--font-stat-label', settings.fontFamily)
    root.style.setProperty('--font-stat-value', settings.fontFamily)
    root.style.setProperty('--text-typing-area', `${settings.fontSize}px`)
  }, [settings.fontFamily, settings.fontSize])

  return (
    <SettingsContext.Provider value={{ settings, setSetting, playKeypress: playKeypressSound }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('useSettings must be used within a SettingsProvider')
  return context
}
