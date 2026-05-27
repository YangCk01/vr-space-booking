import { create } from 'zustand'

export interface User {
  id: string
  phone: string
  name: string
  email: string | null
  avatar: string | null
  role: string
  level: string
  managedVenueIds?: string[]
  permissions?: string[]
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  setUser: (user: User | null) => void
  setAuthenticated: (value: boolean) => void
  setLoading: (value: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setAuthenticated: (value) => set({ isAuthenticated: value }),
  setLoading: (value) => set({ isLoading: value }),
  logout: () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    set({ user: null, isAuthenticated: false })
  },
}))
