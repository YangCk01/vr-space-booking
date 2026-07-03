import { Router, Request, Response } from 'express'
import { authenticate } from '../middleware/auth'
import { createUploader } from '../utils/upload'
import { success, error } from '../utils/response'
import { getRequiredUploadPermissions } from '../domain/adminPermissions'

const router = Router()

// 通用上传接口
router.post('/:type', authenticate, (req: Request, res: Response) => {
  const type = req.params.type as string
  const allowedTypes = ['venues', 'logos', 'avatars', 'games', 'products', 'pages', 'group-buys']

  if (!allowedTypes.includes(type)) {
    return error(res, '不支持的上传类型', 400)
  }

  const requiredPermissions = getRequiredUploadPermissions(type)
  const user = (req as any).user
  const userPermissions: string[] = user?.permissions || []
  const permitted =
    user?.role === 'SUPER_ADMIN' ||
    requiredPermissions.length === 0 ||
    requiredPermissions.some((permission) => userPermissions.includes(permission))

  if (!permitted) {
    return error(res, '权限不足', 403)
  }

  const uploader = createUploader(type)

  uploader(req, res, (err: any) => {
    if (err) {
      return error(res, err.message, 400)
    }

    if (!req.file) {
      return error(res, '未上传文件', 400)
    }

    const fileUrl = `/uploads/${type}/${req.file.filename}`

    return success(res, {
      url: fileUrl,
      filename: req.file.filename,
      size: req.file.size,
    }, '上传成功')
  })
})

export default router
