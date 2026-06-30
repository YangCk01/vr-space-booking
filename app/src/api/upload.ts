import { API_BASE_URL } from '@/lib/apiBase'
import { ADMIN_ACCESS_TOKEN_KEY } from './client'

export async function uploadFile(type: 'venues' | 'logos' | 'avatars' | 'games' | 'products' | 'pages' | 'group-buys', file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const token = localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY)
  const res = await fetch(`${API_BASE_URL}/upload/${type}`, {
    method: 'POST',
    headers: token ? { Authorization: 'Bearer ' + token } : {},
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: '上传失败' }))
    throw new Error(err.message || '上传失败')
  }

  return (await res.json()).data as { url: string; filename: string; size: number }
}
