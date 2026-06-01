import { Router, Request, Response } from 'express'
import { authenticate } from '../middleware/auth'
import { createUploader } from '../utils/upload'

const router = Router()

// 通用上传接口
router.post('/:type', authenticate, (req: Request, res: Response) => {
  const type = req.params.type as string
  const allowedTypes = ['venues', 'logos', 'avatars', 'games', 'products']

  if (!allowedTypes.includes(type)) {
    return res.status(400).json({ success: false, message: '不支持的上传类型' })
  }

  const uploader = createUploader(type)

  uploader(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message })
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: '未上传文件' })
    }

    const host = req.get('host') || 'localhost:4000'
    const protocol = req.protocol || 'http'
    const fileUrl = `${protocol}://${host}/uploads/${type}/${req.file.filename}`

    return res.status(200).json({
      success: true,
      data: {
        url: fileUrl,
        filename: req.file.filename,
        size: req.file.size,
      },
      message: '上传成功',
    })
  })
})

export default router
