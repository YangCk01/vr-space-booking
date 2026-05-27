import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prismaOptions: ConstructorParameters<typeof PrismaClient>[0] = {
  log: process.env.NODE_ENV === 'production'
    ? ['error', 'warn']
    : ['error', 'warn', 'info'],
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient(prismaOptions)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/* ─── Connection health check ─── */
export async function checkDbConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (err) {
    console.error('❌ Database connection check failed:', err)
    return false
  }
}
