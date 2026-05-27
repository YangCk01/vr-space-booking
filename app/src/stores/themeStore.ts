import { create } from 'zustand'

type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('theme') as Theme | null
  if (saved === 'light' || saved === 'dark') return saved
  return 'dark'
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('theme', next)
      const html = document.documentElement
      if (next === 'dark') html.classList.add('dark')
      else html.classList.remove('dark')
      return { theme: next }
    }),
  setTheme: (theme) => {
    localStorage.setItem('theme', theme)
    const html = document.documentElement
    if (theme === 'dark') html.classList.add('dark')
    else html.classList.remove('dark')
    set({ theme })
  },
}))
