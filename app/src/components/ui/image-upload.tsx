import { useRef, useState, useEffect, type ChangeEvent, type DragEvent } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ImagePlus, Upload, Trash2 } from 'lucide-react'

export interface ImageUploadProps {
  value?: string | null
  onUpload: (file: File) => void
  onRemove?: () => void
  accept?: string
  compact?: boolean
  multiple?: boolean
  className?: string
  disabled?: boolean
}

export function ImageUpload({
  value,
  onUpload,
  onRemove,
  accept = 'image/*',
  compact = false,
  multiple = false,
  className,
  disabled = false,
}: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)

  const displayUrl = pendingUrl || value

  useEffect(() => {
    if (pendingUrl && value !== pendingUrl) {
      URL.revokeObjectURL(pendingUrl)
      setPendingUrl(null)
    }
  }, [value, pendingUrl])

  const handleThumbnailClick = () => {
    if (disabled) return
    fileInputRef.current?.click()
  }

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (pendingUrl) URL.revokeObjectURL(pendingUrl)
    const url = URL.createObjectURL(file)
    setPendingUrl(url)
    onUpload(file)
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of files) processFile(file)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (disabled) return
    const files = e.dataTransfer.files
    if (files) for (const file of files) processFile(file)
  }

  const handleRemove = () => {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl)
    setPendingUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onRemove?.()
  }

  const containerClasses = compact
    ? 'w-20 h-20 rounded-lg'
    : 'h-64 rounded-xl'

  return (
    <div className={cn('space-y-2', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
        multiple={multiple}
      />

      {!displayUrl ? (
        <div
          onClick={handleThumbnailClick}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-vrborder-strong/25 bg-vrbg-surface transition-colors hover:bg-vrbg-hover',
            containerClasses,
            isDragging && 'border-vr-blue/50 bg-vr-blue/5',
            disabled && 'cursor-not-allowed opacity-60'
          )}
        >
          <div className={cn('rounded-full bg-vrbg-card p-2 shadow-sm', compact && 'p-1.5')}>
            <ImagePlus className={cn('text-vrtext-muted', compact ? 'h-4 w-4' : 'h-6 w-6')} />
          </div>
          {!compact && (
            <div className="text-center">
              <p className="text-sm font-medium text-vrtext-secondary">点击选择图片</p>
              <p className="text-xs text-vrtext-muted">或拖拽文件到此处</p>
            </div>
          )}
        </div>
      ) : (
        <div className={cn('group relative overflow-hidden border border-vrborder-subtle', containerClasses)}>
          <img
            src={displayUrl}
            alt="Preview"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleThumbnailClick}
              disabled={disabled}
              className={cn('h-9 w-9 p-0', compact && 'h-7 w-7')}
            >
              <Upload className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleRemove}
              disabled={disabled}
              className={cn('h-9 w-9 p-0', compact && 'h-7 w-7')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
