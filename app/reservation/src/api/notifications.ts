import { apiClient } from './client'

export interface NotificationItem {
  id: string
  userId: string
  type: string
  title: string
  content: string
  read: boolean
  createdAt: string
}

export async function getNotifications(params?: { page?: number; pageSize?: number; unreadOnly?: boolean }) {
  const res = await apiClient.get('/notifications', { params })
  return res.data
}

export async function getUnreadCount() {
  const res = await apiClient.get('/notifications/unread-count')
  return res.data.data.count as number
}

export async function markAllRead() {
  const res = await apiClient.patch('/notifications/all/read')
  return res.data
}

export async function markRead(id: string) {
  const res = await apiClient.patch(`/notifications/${id}/read`)
  return res.data
}

export async function clearAllNotifications() {
  const res = await apiClient.delete('/notifications/all')
  return res.data
}
