const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const household = await prisma.household.updateMany({
    where: { phone: '0334037898' },
    data: { keycloak_user_id: '8a9f93fb-f347-4354-983e-1af54639bc38' }
  });

  console.log('Updated households:', household.count);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
