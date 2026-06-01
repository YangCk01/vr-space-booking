import { apiClient } from './client'

export async function uploadFile(type: 'venues' | 'logos' | 'avatars' | 'games' | 'products', file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await apiClient.post(`/upload/${type}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return res.data.data as { url: string; filename: string; size: number }
}
