import { Router } from 'express'
import {
  list,
  calendar,
  getById,
  create,
  update,
  remove,
  checkConflict,
  checkIn,
  status,
  reschedule,
  createValidators,
} from '../controllers/bookingController'
import { getAssignedEquipment } from '../services/equipmentService'
import { authenticate, optionalAuthenticate } from '../middleware/auth'
import { requireAnyPermissionOrRole, requirePermission } from '../middleware/rbac'
import { logOperation } from '../middleware/operationLog'
import { prisma } from '../utils/prisma'

const router = Router()

router.get('/', authenticate, requireAnyPermissionOrRole(['booking:read', 'order:read'], ['CUSTOMER']), list)
router.get('/calendar', authenticate, requireAnyPermissionOrRole(['booking:read', 'order:read'], ['CUSTOMER']), calendar)
router.get('/check-conflict', authenticate, requireAnyPermissionOrRole(['booking:read', 'order:read'], ['CUSTOMER']), checkConflict)
router.get('/:id', authenticate, getById)
router.get('/:id/status', authenticate, status)
router.get('/:id/equipment', authenticate, requirePermission('booking:read'), async (req, res) => {
  try {
    const assigned = await getAssignedEquipment(req.params.id as string)
    return res.json({ success: true, data: assigned.map((a) => ({
      id: a.equipment.id,
      name: a.equipment.name,
      code: a.equipment.code,
      type: a.equipment.type,
      assignedAt: a.assignedAt,
    })) })
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message })
  }
})
router.put('/:id/equipment', authenticate, requirePermission('booking:manage'), async (req, res) => {
  try {
    const { equipmentIds } = req.body
    const bookingId = req.params.id as string
    // 释放原有设备
    const { releaseEquipment } = await import('../services/equipmentService')
    await releaseEquipment(bookingId)
    // 重新分配
    await prisma.bookingEquipment.createMany({
      data: equipmentIds.map((eid: string) => ({ bookingId, equipmentId: eid })),
    })
    return res.json({ success: true, message: '设备分配已更新' })
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message })
  }
})
router.post('/', optionalAuthenticate, createValidators, logOperation({ type: '新增预约', content: (req) => `新增预约: ${req.body.title || req.body.venueId}` }), create)
router.put('/:id', authenticate, requireAnyPermissionOrRole(['booking:manage', 'order:reschedule'], ['CUSTOMER']), logOperation({ type: '编辑预约', content: (req) => `编辑预约ID: ${req.params.id}` }), update)
router.delete('/:id', authenticate, requireAnyPermissionOrRole(['booking:manage', 'order:reschedule'], ['CUSTOMER']), logOperation({ type: '取消预约', content: (req) => `取消预约ID: ${req.params.id}` }), remove)
router.post('/:id/check-in', authenticate, requirePermission('order:verify'), logOperation({ type: '顾客签到', content: (req) => `预约签到: ${req.params.id}` }), checkIn)
router.post('/:id/reschedule', authenticate, requireAnyPermissionOrRole(['order:reschedule'], ['CUSTOMER']), logOperation({ type: '预约改签', content: (req) => `预约改签: ${req.params.id}` }), reschedule)

export default router
