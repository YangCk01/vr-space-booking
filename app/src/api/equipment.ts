import { apiClient } from './client'

export interface Equipment {
  id: string
  name: string
  code: string
  model: string | null
  type: string
  status: string
  venueId: string | null
  venue?: { id: string; name: string } | null
  buyDate: string | null
  warranty: string | null
  lastMaint: string | null
  createdAt: string
  updatedAt: string
}

export interface EquipmentInput {
  name: string
  code: string
  type: string
  model?: string
  status?: string
  venueId?: string
  buyDate?: string
  warranty?: string
}

export interface MaintenanceRecord {
  id: string
  equipmentId: string
  date: string
  type: string
  description: string
  operator: string | null
  createdAt: string
}

export async function getEquipment(params?: {
  status?: string
  type?: string
  venueId?: string
  search?: string
  page?: number
  pageSize?: number
}) {
  const res = await apiClient.get('/equipment', { params })
  return res.data
}

export async function getEquipmentById(id: string) {
  const res = await apiClient.get(`/equipment/${id}`)
  return res.data.data
}

export async function createEquipment(input: EquipmentInput) {
  const res = await apiClient.post('/equipment', input)
  return res.data.data
}

export async function updateEquipment(id: string, input: Partial<EquipmentInput>) {
  const res = await apiClient.put(`/equipment/${id}`, input)
  return res.data.data
}

export async function deleteEquipment(id: string) {
  const res = await apiClient.delete(`/equipment/${id}`)
  return res.data.data
}

export async function getMaintenanceRecords(equipmentId: string) {
  const res = await apiClient.get(`/equipment/${equipmentId}/maintenance`)
  return res.data.data
}

export async function createMaintenanceRecord(equipmentId: string, data: {
  date?: string
  type: string
  description: string
  operator?: string
}) {
  const res = await apiClient.post(`/equipment/${equipmentId}/maintenance`, data)
  return res.data.data
}
