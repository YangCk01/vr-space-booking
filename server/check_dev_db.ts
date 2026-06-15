import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
p.venue.findMany().then(v => {
  console.log('Venues count:', v.length)
  v.forEach(x => console.log(x.name, x.id))
  process.exit(0)
}).catch(e => {
  console.error(e.message)
  process.exit(1)
})
