import { prisma } from '../src/utils/prisma'

async function main() {
  const order = await prisma.order.update({
    where: { orderNo: 'VRN2026061700004' },
    data: { status: 'PAID' },
  })
  console.log('status set to', order.status)
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1) })
