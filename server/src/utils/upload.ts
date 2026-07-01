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
function createFileFilter(options: { allowVideo?: boolean } = {}) {
  return (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '')
    const imageExts = ['jpeg', 'jpg', 'png', 'gif', 'webp', 'svg']
    const imageMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    const videoExts = ['mp4', 'webm', 'mov', 'm4v']

    const isImage = imageExts.includes(ext) && imageMimes.includes(file.mimetype)
    const isVideo = options.allowVideo && videoExts.includes(ext)

    if (isImage || isVideo) {
      cb(null, true)
    } else if (options.allowVideo) {
      cb(new Error(`只允许上传图片或视频文件 (jpg, png, gif, webp, svg, mp4, webm, mov, m4v)，当前文件: ${file.originalname}, 类型: ${file.mimetype || '未知'}`))
    } else {
      cb(new Error(`只允许上传图片文件 (jpg, png, gif, webp, svg)，当前文件: ${file.originalname}, 类型: ${file.mimetype || '未知'}`))
    }
  }
}

// 限制配置
const limits = {
  fileSize: 5 * 1024 * 1024, // 5MB
}

const mediaLimits = {
  fileSize: 300 * 1024 * 1024, // 300MB
}

// 各类型上传器
export const uploadVenueImage = multer({
  storage: createStorage('venues'),
  fileFilter: createFileFilter(),
  limits,
}).single('image')

export const uploadLogo = multer({
  storage: createStorage('logos'),
  fileFilter: createFileFilter(),
  limits,
}).single('logo')

export const uploadAvatar = multer({
  storage: createStorage('avatars'),
  fileFilter: createFileFilter(),
  limits,
}).single('avatar')

export const uploadGameImage = multer({
  storage: createStorage('games'),
  fileFilter: createFileFilter(),
  limits,
}).single('image')

// 通用单文件上传器
export function createUploader(subdir: string) {
  const allowVideo = subdir === 'pages' || subdir === 'games'

  return multer({
    storage: createStorage(subdir),
    fileFilter: createFileFilter({ allowVideo }),
    limits: allowVideo ? mediaLimits : limits,
  }).single('file')
}
