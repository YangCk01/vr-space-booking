import { apiClient } from './client'

export interface Game {
  id: string
  title: string
  subtitle?: string | null
  description?: string | null
  notice?: string | null
  coverImage?: string | null
  videoUrl?: string | null
  detailImages: string[]
  price: number
  duration: number
  minPlayers: number
  maxPlayers: number
  tags: string[]
  status: string
  sortOrder: number
  bookedPeopleCount?: number
  createdAt: string
  updatedAt: string
}

export async function getGames() {
  const res = await apiClient.get('/games', { params: { status: 'ACTIVE' } })
  return res.data.data as Game[]
}

export async function getGame(id: string) {
  const res = await apiClient.get(`/games/${id}`)
  return res.data.data as Game
}
