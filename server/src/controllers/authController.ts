import { Response } from 'express'
import { body, validationResult } from 'express-validator'
import { AuthenticatedRequest } from '../types'
import { success, error } from '../utils/response'
import * as authService from '../services/authService'

export const loginValidators = [
  body('phone').notEmpty().withMessage('手机号不能为空').isLength({ min: 11, max: 11 }).withMessage('手机号格式错误'),
  body('password').notEmpty().withMessage('密码不能为空').isLength({ min: 6 }).withMessage('密码至少6位'),
]

export const adminLoginValidators = [
  body('phone').custom((value, { req }) => {
    const identifier = value || req.body.username
    if (!identifier) {
      throw new Error('手机号不能为空')
    }
    if (identifier.length !== 11) {
      throw new Error('手机号格式错误')
    }
    return true
  }),
  body('password').notEmpty().withMessage('密码不能为空').isLength({ min: 6 }).withMessage('密码至少6位'),
]

export const registerValidators = [
  body('phone').notEmpty().withMessage('手机号不能为空').isLength({ min: 11, max: 11 }).withMessage('手机号格式错误'),
  body('password').notEmpty().withMessage('密码不能为空').isLength({ min: 6 }).withMessage('密码至少6位'),
  body('name').notEmpty().withMessage('姓名不能为空'),
]

export async function login(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, '参数错误', 400, errors.array()[0].msg)
  }

  try {
    const result = await authService.login({
      phone: req.body.phone,
      password: req.body.password,
    })
    // C端登录接口：仅允许 CUSTOMER 角色
    if (result.user.role !== 'CUSTOMER') {
      return error(res, '该账号无法登录客户端，请使用管理员后台入口', 403)
    }
    return success(res, result, '登录成功')
  } catch (err) {
    return error(res, (err as Error).message, 401)
  }
}

export async function adminLogin(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, '参数错误', 400, errors.array()[0].msg)
  }

  try {
    const phone = req.body.phone || req.body.username
    const result = await authService.login({
      phone,
      password: req.body.password,
    })
    // 管理后台登录接口：允许 ADMIN / SUPER_ADMIN / OPERATOR / FINANCE / MANAGER
    const adminRoles = ['ADMIN', 'SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'MANAGER']
    if (!adminRoles.includes(result.user.role)) {
      return error(res, '该账号无管理后台权限', 403)
    }
    return success(res, result, '登录成功')
  } catch (err) {
    return error(res, (err as Error).message, 401)
  }
}

export async function register(req: AuthenticatedRequest, res: Response) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return error(res, '参数错误', 400, errors.array()[0].msg)
  }

  try {
    const result = await authService.register({
      phone: req.body.phone,
      password: req.body.password,
      name: req.body.name,
      role: req.body.role,
      birthday: req.body.birthday,
    })
    return success(res, result, '注册成功')
  } catch (err) {
    return error(res, (err as Error).message, 400)
  }
}

export async function refresh(req: AuthenticatedRequest, res: Response) {
  const { refreshToken } = req.body
  if (!refreshToken) {
    return error(res, '缺少刷新令牌', 400)
  }

  try {
    const tokens = await authService.refreshToken(refreshToken)
    return success(res, tokens, '刷新成功')
  } catch (err) {
    return error(res, (err as Error).message, 401)
  }
}

export async function me(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user) {
      return error(res, '未认证', 401)
    }
    const user = await authService.getUserById(req.user.id)
    return success(res, user)
  } catch (err) {
    return error(res, (err as Error).message, 400)
  }
}

export async function logout(_req: AuthenticatedRequest, res: Response) {
  // 客户端删除 Token 即可，服务端可选加入 Token 黑名单
  return success(res, null, '登出成功')
}

export async function changePassword(req: AuthenticatedRequest, res: Response) {
  const { oldPassword, newPassword } = req.body
  if (!oldPassword || !newPassword) {
    return error(res, '原密码和新密码不能为空', 400)
  }
  if (newPassword.length < 6) {
    return error(res, '新密码至少6位', 400)
  }

  try {
    await authService.changePassword(req.user!.id, oldPassword, newPassword)
    return success(res, null, '密码修改成功')
  } catch (err) {
    return error(res, (err as Error).message, 400)
  }
}

export async function updateProfile(req: AuthenticatedRequest, res: Response) {
  try {
    const { name, avatar, email } = req.body
    const data: { name?: string; avatar?: string; email?: string } = {}
    if (name !== undefined) data.name = name
    if (avatar !== undefined) data.avatar = avatar
    if (email !== undefined) data.email = email

    const user = await authService.updateProfile(req.user!.id, data)
    return success(res, user, '资料更新成功')
  } catch (err) {
    return error(res, (err as Error).message, 400)
  }
}

export async function updatePhone(req: AuthenticatedRequest, res: Response) {
  const { newPhone, password } = req.body
  if (!newPhone || !password) {
    return error(res, '新手机号和密码不能为空', 400)
  }
  if (newPhone.length !== 11) {
    return error(res, '手机号格式错误', 400)
  }

  try {
    const user = await authService.updatePhone(req.user!.id, newPhone, password)
    return success(res, user, '手机号修改成功')
  } catch (err) {
    return error(res, (err as Error).message, 400)
  }
}
