import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
p.venue.count().then(c => {
  console.log('Venue count:', c)
  process.exit(0)
}).catch(e => {
  console.error(e.message)
  process.exit(1)
})
