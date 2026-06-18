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
  createdAt: string
  updatedAt: string
}

export interface GameInput {
  title: string
  subtitle?: string
  description?: string
  notice?: string
  coverImage?: string
  videoUrl?: string
  detailImages?: string[]
  price?: number
  duration?: number
  minPlayers?: number
  maxPlayers?: number
  tags?: string[]
  status?: string
  sortOrder?: number
}

export async function getGames(params?: { status?: string }) {
  const res = await apiClient.get('/games', { params })
  return res.data.data as Game[]
}

export async function getGame(id: string) {
  const res = await apiClient.get(`/games/${id}`)
  return res.data.data as Game
}

export async function createGame(input: GameInput) {
  const res = await apiClient.post('/games', input)
  return res.data.data as Game
}

export async function updateGame(id: string, input: Partial<GameInput>) {
  const res = await apiClient.put(`/games/${id}`, input)
  return res.data.data as Game
}

export async function deleteGame(id: string) {
  const res = await apiClient.delete(`/games/${id}`)
  return res.data.data
}

export async function batchDeleteGames(ids: string[]) {
  const res = await apiClient.post('/games/batch-delete', { ids })
  return res.data
}

export async function batchUpdateGameStatus(ids: string[], status: string) {
  const res = await apiClient.post('/games/batch-status', { ids, status })
  return res.data
}

export async function batchUpdateGamePrice(ids: string[], price: number) {
  const res = await apiClient.post('/games/batch-price', { ids, price })
  return res.data
}
