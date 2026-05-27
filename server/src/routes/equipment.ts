import { Router } from 'express'
import { authenticate, requireRole } from '../middleware/auth'
import { logOperation } from '../middleware/operationLog'
import * as controller from '../controllers/equipmentController'

const router = Router()

router.use(authenticate, requireRole('SUPER_ADMIN','ADMIN','OPERATOR','MANAGER'))

router.get('/', controller.list)
router.post('/', controller.createValidators, logOperation({ type: '新增设备', content: (req) => `新增设备: ${req.body.name}` }), controller.create)
router.get('/:id', controller.getById)
router.put('/:id', controller.updateValidators, logOperation({ type: '编辑设备', content: (req) => `编辑设备: ${req.body.name || req.params.id}` }), controller.update)
router.delete('/:id', logOperation({ type: '删除设备', content: (req) => `删除设备ID: ${req.params.id}` }), controller.remove)
router.get('/:id/maintenance', controller.listMaintenance)
router.post('/:id/maintenance', logOperation({ type: '设备维护', content: (req) => `设备维护: ${req.params.id}` }), controller.createMaintenance)

export default router
