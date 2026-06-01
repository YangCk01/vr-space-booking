import { useState, useCallback } from 'react'

interface ToastState {
  message: string
  type: 'success' | 'error'
  visible: boolean
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'success', visible: false })

  const show = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type, visible: true })
    setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }))
    }, 2500)
  }, [])

  const success = useCallback((message: string) => show(message, 'success'), [show])
  const error = useCallback((message: string) => show(message, 'error'), [show])

  return { toast, success, error }
}
