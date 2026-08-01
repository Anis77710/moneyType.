/* oxlint-disable react/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import THEMES from '../config/themes'

const ThemeContext = createContext(null)

const DEFAULT_THEME = THEMES[0]

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem('MoneyType-theme')
    return saved || DEFAULT_THEME.name
  })

  const setTheme = (name) => {
    setThemeState(name)
    localStorage.setItem('MoneyType-theme', name)
  }

  const currentTheme = THEMES.find(t => t.name === theme) || DEFAULT_THEME

  useEffect(() => {
    const root = document.documentElement
    Object.entries(currentTheme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value)
    })
  }, [currentTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, currentTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
