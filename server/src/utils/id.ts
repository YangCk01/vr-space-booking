import { randomInt, randomUUID } from 'crypto'
import { format } from 'date-fns'

export function newUuid(): string {
  return randomUUID()
}

export function newBusinessNo(prefix: string, randomLength = 6): string {
  const max = 10 ** randomLength
  const suffix = randomInt(0, max).toString().padStart(randomLength, '0')
  return `${prefix}${format(new Date(), 'yyyyMMdd')}${suffix}`
}

export function generateVerifyCode(): string {
  return newBusinessNo('VR', 6)
}

export function randomChoice<T>(items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('randomChoice requires a non-empty array')
  }
  return items[randomInt(0, items.length)]
}
