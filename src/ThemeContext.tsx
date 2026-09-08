import { createContext, useContext, useState, useEffect } from 'react'
import { THEMES, type Theme } from './themes'

type ThemeCtx = { theme: Theme; setThemeId: (id: string) => void }

const ThemeContext = createContext<ThemeCtx>({ theme: THEMES[0], setThemeId: () => {} })

function loadThemeId(): string {
  try { return localStorage.getItem('studyflow-theme') ?? 'ember' } catch { return 'ember' }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>(loadThemeId)

  const setThemeId = (id: string) => {
    setThemeIdState(id)
    try { localStorage.setItem('studyflow-theme', id) } catch {}
  }

  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0]

  // Keep document background in sync so no flash on reload
  useEffect(() => {
    document.body.style.background = theme.bg
  }, [theme.bg])

  return (
    <ThemeContext.Provider value={{ theme, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
