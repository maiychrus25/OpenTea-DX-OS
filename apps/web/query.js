const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const h = await prisma.household.findFirst({ where: { phone: '0334037899' } });
  console.log(h);
}

run().finally(() => prisma.$disconnect());
