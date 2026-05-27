import { apiClient } from './client'

export interface SearchResult {
  venues: { id: string; name: string; theme: string; status: string }[]
  orders: { id: string; orderNo: string; venueName: string; status: string; amount: number }[]
  users: { id: string; name: string; phone: string; level: string; status: string }[]
}

export async function globalSearch(q: string): Promise<SearchResult> {
  const res = await apiClient.get('/search', { params: { q } })
  return res.data.data
}
