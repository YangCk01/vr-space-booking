import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'Venue' ORDER BY ordinal_position`.then(cols => {
  console.log('Venue columns:', cols.map((c: any) => c.column_name))
  process.exit(0)
}).catch(e => {
  console.error(e.message)
  process.exit(1)
})
