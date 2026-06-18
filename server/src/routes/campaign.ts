import { Router } from 'express'
import { requirePermission } from '../middleware/rbac'
import { authenticate } from '../middleware/auth'
import * as controller from '../controllers/campaignController'

const router = Router()

router.get('/', authenticate, requirePermission('marketing:campaign'), controller.list)
router.post('/', authenticate, requirePermission('marketing:campaign'), controller.create)
router.get('/:id', authenticate, requirePermission('marketing:campaign'), controller.getById)
router.get('/:id/stats', authenticate, requirePermission('marketing:campaign'), controller.stats)
router.get('/:id/effects', authenticate, requirePermission('marketing:campaign'), controller.effects)
router.get('/:id/tracks', authenticate, requirePermission('marketing:campaign'), controller.tracks)
router.get('/:id/logs', authenticate, requirePermission('marketing:campaign'), controller.executionLogs)
router.put('/:id/pause', authenticate, requirePermission('marketing:campaign'), controller.pause)
router.put('/:id/end', authenticate, requirePermission('marketing:campaign'), controller.end)
router.put('/:id/activate', authenticate, requirePermission('marketing:campaign'), controller.activate)
router.put('/:id/clone', authenticate, requirePermission('marketing:campaign'), controller.clone)
router.post('/:id/distribute', authenticate, requirePermission('marketing:campaign'), controller.distribute)
router.delete('/:id', authenticate, requirePermission('marketing:campaign'), controller.remove)
router.put('/:id', authenticate, requirePermission('marketing:campaign'), controller.update)

export default router
