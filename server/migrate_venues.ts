import { PrismaClient } from '@prisma/client'

async function main() {
  const source = new PrismaClient({
    datasources: { db: { url: 'postgresql://vruser:vrpass@127.0.0.1:5432/vrspace?schema=public&connection_limit=10' } }
  })
  const target = new PrismaClient({
    datasources: { db: { url: 'postgresql://vruser:vrpass@127.0.0.1:5432/vrspace_dev?schema=public&connection_limit=10' } }
  })

  try {
    const venues = await source.venue.findMany()
    console.log('Source venues:', venues.length)

    if (venues.length === 0) {
      console.log('No venues to migrate')
      return
    }

    for (const v of venues) {
      const { id, ...data } = v as any
      await target.venue.upsert({
        where: { id },
        update: data,
        create: { id, ...data },
      })
      console.log('Migrated venue:', v.name)
    }

    const count = await target.venue.count()
    console.log('Target venues count:', count)
  } catch (e: any) {
    console.error('Error:', e.message)
    process.exit(1)
  } finally {
    await source.$disconnect()
    await target.$disconnect()
  }
}

main()
