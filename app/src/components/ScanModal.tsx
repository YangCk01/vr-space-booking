import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ScanLine, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import jsQR from 'jsqr'

interface ScanModalProps {
  open: boolean
  onClose: () => void
  onScan: (code: string) => void
  title?: string
}

export default function ScanModal({ open, onClose, onScan, title = '扫码识别团购券' }: ScanModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      stopStream()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      setError('')
      setScanning(false)
      setManualCode('')
      return
    }

    setScanning(true)
    startCamera()

    return () => {
      stopStream()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [open])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        videoRef.current.onloadedmetadata = () => {
          tick()
        }
      }
    } catch (err: any) {
      const isInsecure = window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
      setError(isInsecure
        ? '当前为非安全环境（http），浏览器禁止访问摄像头。请使用下方「上传二维码截图」或「手动输入券码」。'
        : '无法访问摄像头，请检查权限或使用下方上传/手动输入方式。')
      setScanning(false)
    }
  }

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        })
        if (code?.data) {
          onScan(code.data.trim())
          onClose()
        } else {
          setError('未从图片中识别到二维码，请尝试手动输入')
        }
      }
      img.onerror = () => setError('图片加载失败，请重试')
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const tick = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    })

    if (code?.data) {
      onScan(code.data.trim())
      onClose()
      return
    }

    rafRef.current = requestAnimationFrame(tick)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-vrbg-card rounded-2xl overflow-hidden shadow-2xl border border-vrborder-subtle"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-vrborder-subtle">
              <div className="flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-vraccent-primary" />
                <h3 className="text-base font-bold text-vrtext-primary">{title}</h3>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-vrbg-elevated text-vrtext-muted hover:text-vrtext-primary flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Video area */}
            <div className="relative aspect-[4/3] bg-black overflow-hidden">
              <video
                ref={videoRef}
                className={cn('absolute inset-0 w-full h-full object-cover', error && 'opacity-30')}
                muted
                playsInline
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Scan frame */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-56 h-56">
                  {/* Corner markers */}
                  <div className="absolute top-0 left-0 w-6 h-6 border-l-4 border-t-4 border-vraccent-primary rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-r-4 border-t-4 border-vraccent-primary rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-l-4 border-b-4 border-vraccent-primary rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-r-4 border-b-4 border-vraccent-primary rounded-br-lg" />

                  {/* Scanning line animation */}
                  {scanning && !error && (
                    <motion.div
                      className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-vraccent-primary to-transparent shadow-[0_0_12px_rgba(59,130,246,0.8)]"
                      initial={{ top: '0%' }}
                      animate={{ top: ['0%', '100%', '0%'] }}
                      transition={{
                        duration: 2.5,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Error overlay */}
              {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
                  <ScanLine className="w-12 h-12 text-vrtext-muted mb-3" />
                  <p className="text-sm text-vrtext-primary font-medium leading-relaxed">{error}</p>
                </div>
              )}
            </div>

            {/* Manual / test input */}
            <div className="px-5 py-4 bg-vrbg-elevated border-t border-vrborder-subtle space-y-3">
              <p className="text-xs text-vrtext-secondary text-center">没有扫码设备？可截图 C 端二维码上传识别，或手动输入券码</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-9 flex items-center justify-center gap-2 rounded-lg bg-white border border-vrborder-subtle text-vr-body-sm text-vrtext-primary hover:border-vraccent-primary hover:text-vraccent-primary transition-colors"
              >
                <Upload className="w-4 h-4" />
                上传二维码截图
              </button>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="输入券码或订单号模拟识别"
                  className="flex-1 h-9 px-3 rounded-lg bg-white border border-vrborder-subtle text-vr-body-sm text-vrtext-primary outline-none focus:border-vraccent-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualCode.trim()) {
                      onScan(manualCode.trim())
                      onClose()
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const value = manualCode.trim()
                    if (value) {
                      onScan(value)
                      onClose()
                    }
                  }}
                  className="h-9 px-4 rounded-lg bg-vraccent-primary text-white text-xs font-medium hover:bg-vraccent-primary/90 transition-colors"
                >
                  模拟识别
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
