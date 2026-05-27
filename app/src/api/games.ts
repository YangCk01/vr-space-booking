import { apiClient } from './client'

export interface Game {
  id: string
  title: string
  subtitle?: string | null
  description?: string | null
  notice?: string | null
  coverImage?: string | null
  detailImages: string[]
  price: number
  duration: number
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
  detailImages?: string[]
  price?: number
  duration?: number
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

export async function updateGame(id: string, input: GameInput) {
  const res = await apiClient.put(`/games/${id}`, input)
  return res.data.data as Game
}

export async function deleteGame(id: string) {
  const res = await apiClient.delete(`/games/${id}`)
  return res.data.data
}
