import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/providers/AuthProvider'
import { AnimatedSignIn, type AuthMode } from '@/components/ui/animated-sign-in'

export default function AuthPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { login, register, refreshUser } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleModeChange = (next: AuthMode) => {
    setMode(next)
    setError('')
  }

  const handleSubmit = async (values: { phone: string; password: string; name?: string; birthday?: string }) => {
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await login({ phone: values.phone, password: values.password })
      } else {
        await register({
          phone: values.phone,
          password: values.password,
          name: values.name!,
          birthday: values.birthday,
        })
      }
      await refreshUser()
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['venues'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      navigate(-1)
    } catch (err: any) {
      setError(err?.response?.data?.message || '操作失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatedSignIn
      mode={mode}
      onModeChange={handleModeChange}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      onBack={() => navigate(-1)}
    />
  )
}
