import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { getBenefits } from '../controllers/userBenefitController'

const router = Router()

router.get('/', authenticate, getBenefits)

export default router
