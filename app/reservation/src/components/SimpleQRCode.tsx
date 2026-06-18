import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

interface SimpleQRCodeProps {
  value: string
  size?: number
  className?: string
}

export function SimpleQRCode({ value, size = 128, className }: SimpleQRCodeProps) {
  const [dataUrl, setDataUrl] = useState('')

  useEffect(() => {
    if (!value) {
      setDataUrl('')
      return
    }
    let cancelled = false
    QRCode.toDataURL(value, { width: size, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setDataUrl('')
      })
    return () => {
      cancelled = true
    }
  }, [value, size])

  if (!dataUrl) {
    return (
      <div
        className={className}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <img
      src={dataUrl}
      alt="二维码"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block' }}
    />
  )
}
