import { createContext, useContext, useState } from 'react'
import { THEMES, type Theme } from './themes'

type ThemeCtx = { theme: Theme; setThemeId: (id: string) => void }

const ThemeContext = createContext<ThemeCtx>({ theme: THEMES[0], setThemeId: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState('ember')
  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0]
  return (
    <ThemeContext.Provider value={{ theme, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
