import { UserRole } from '@prisma/client'

type EnvLike = Record<string, string | undefined>

export function requireSecret(name: string, env: EnvLike = process.env): string {
  const value = env[name]
  if (!value || value.length < 32) {
    throw new Error(`[Config] 环境变量 ${name} 必须设置且长度不少于 32 字符。`)
  }
  return value
}

export function getJwtSecret(env: EnvLike = process.env): string {
  return requireSecret('JWT_SECRET', env)
}

export function getJwtRefreshSecret(env: EnvLike = process.env): string {
  return requireSecret('JWT_REFRESH_SECRET', env)
}

export function getJwtExpiresIn(env: EnvLike = process.env): string {
  return env.JWT_EXPIRES_IN || '24h'
}

export function getJwtRefreshExpiresIn(env: EnvLike = process.env): string {
  return env.JWT_REFRESH_EXPIRES_IN || '7d'
}

export function getCorsOrigins(env: EnvLike = process.env): string[] | true {
  const raw = env.CORS_ORIGIN
  if (raw) {
    return raw.split(',').map((origin) => origin.trim()).filter(Boolean)
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('[Config] 生产环境必须设置 CORS_ORIGIN 环境变量。')
  }

  return true
}

export function normalizeRegisterRole(_role?: UserRole | string): UserRole {
  return UserRole.CUSTOMER
}

export function shouldMountDebugRoutes(env: EnvLike = process.env): boolean {
  return env.NODE_ENV !== 'production'
}
