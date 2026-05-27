import multer from 'multer'
import path from 'path'
import fs from 'fs'

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads')

// 确保目录存在
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// 生成唯一文件名
function generateFilename(originalname: string) {
  const ext = path.extname(originalname)
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${timestamp}-${random}${ext}`
}

// 创建 multer 存储配置
function createStorage(subdir: string) {
  const dest = path.join(UPLOAD_ROOT, subdir)
  ensureDir(dest)

  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, dest)
    },
    filename: (_req, file, cb) => {
      cb(null, generateFilename(file.originalname))
    },
  })
}

// 文件过滤器
function fileFilter(_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const allowedTypes = /jpeg|jpg|png|gif|webp|svg/
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
  const mimetype = allowedTypes.test(file.mimetype)

  if (extname && mimetype) {
    cb(null, true)
  } else {
    cb(new Error('只允许上传图片文件 (jpg, png, gif, webp, svg)'))
  }
}

// 限制配置
const limits = {
  fileSize: 5 * 1024 * 1024, // 5MB
}

// 各类型上传器
export const uploadVenueImage = multer({
  storage: createStorage('venues'),
  fileFilter,
  limits,
}).single('image')

export const uploadLogo = multer({
  storage: createStorage('logos'),
  fileFilter,
  limits,
}).single('logo')

export const uploadAvatar = multer({
  storage: createStorage('avatars'),
  fileFilter,
  limits,
}).single('avatar')

export const uploadGameImage = multer({
  storage: createStorage('games'),
  fileFilter,
  limits,
}).single('image')

// 通用单文件上传器
export function createUploader(subdir: string) {
  return multer({
    storage: createStorage(subdir),
    fileFilter,
    limits,
  }).single('file')
}
