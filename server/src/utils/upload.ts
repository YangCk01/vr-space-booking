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
function createFileFilter(options: { allowVideo?: boolean; allowAudio?: boolean } = {}) {
  return (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '')
    const imageExts = ['jpeg', 'jpg', 'png', 'gif', 'webp', 'svg']
    const imageMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
    const videoExts = ['mp4', 'webm', 'mov', 'm4v']
    const audioExts = ['mp3']
    const audioMimes = ['audio/mpeg', 'audio/mp3', 'audio/x-mpeg', 'audio/x-mp3']

    const isImage = imageExts.includes(ext) && imageMimes.includes(file.mimetype)
    const isVideo = options.allowVideo && videoExts.includes(ext)
    const isAudio = options.allowAudio && audioExts.includes(ext) && audioMimes.includes(file.mimetype)

    if (isImage || isVideo || isAudio) {
      cb(null, true)
    } else if (options.allowVideo || options.allowAudio) {
      cb(new Error(`只允许上传图片、视频或 MP3 音频文件 (jpg, png, gif, webp, svg, mp4, webm, mov, m4v, mp3)，当前文件: ${file.originalname}, 类型: ${file.mimetype || '未知'}`))
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
  const allowAudio = subdir === 'pages'

  return multer({
    storage: createStorage(subdir),
    fileFilter: createFileFilter({ allowVideo, allowAudio }),
    limits: allowVideo || allowAudio ? mediaLimits : limits,
  }).single('file')
}
