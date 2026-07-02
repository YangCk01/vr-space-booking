import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireAnyPermission, requirePermission } from '../middleware/rbac'
import { logOperation } from '../middleware/operationLog'
import * as controller from '../controllers/equipmentController'
import { getEquipmentOccupancy } from '../services/equipmentService'
import { success, error } from '../utils/response'

const router = Router()

router.use(authenticate)

router.get('/', requirePermission('venue:read'), controller.list)
router.post('/', requirePermission('venue:manage'), controller.createValidators, logOperation({ type: '新增设备', content: (req) => `新增设备: ${req.body.name}` }), controller.create)
router.get('/:id', requirePermission('venue:read'), controller.getById)
router.put('/:id', requireAnyPermission('venue:manage', 'venue:maintenance'), controller.updateValidators, logOperation({ type: '编辑设备', content: (req) => `编辑设备: ${req.body.name || req.params.id}` }), controller.update)
router.delete('/:id', requirePermission('venue:manage'), logOperation({ type: '删除设备', content: (req) => `删除设备ID: ${req.params.id}` }), controller.remove)
router.get('/:id/maintenance', requirePermission('venue:read'), controller.listMaintenance)
router.post('/:id/maintenance', requireAnyPermission('venue:manage', 'venue:maintenance'), logOperation({ type: '设备维护', content: (req) => `设备维护: ${req.params.id}` }), controller.createMaintenance)
router.get('/:id/occupancy', requirePermission('venue:read'), async (req, res) => {
  try {
    const occupancy = await getEquipmentOccupancy(req.params.id as string)
    return success(res, occupancy)
  } catch (err) {
    return error(res, (err as Error).message, 500)
  }
})

export default router
