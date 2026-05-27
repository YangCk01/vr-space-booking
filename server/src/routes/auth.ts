import { Router } from 'express'
import {
  login,
  adminLogin,
  register,
  refresh,
  me,
  logout,
  changePassword,
  updateProfile,
  updatePhone,
  loginValidators,
  adminLoginValidators,
  registerValidators,
} from '../controllers/authController'
import { authenticate } from '../middleware/auth'

const router = Router()

router.post('/login', loginValidators, login)
router.post('/admin-login', adminLoginValidators, adminLogin)
router.post('/register', registerValidators, register)
router.post('/refresh', refresh)
router.post('/logout', logout)
router.get('/me', authenticate, me)
router.post('/change-password', authenticate, changePassword)
router.put('/profile', authenticate, updateProfile)
router.put('/phone', authenticate, updatePhone)

export default router
