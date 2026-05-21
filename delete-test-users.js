const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const emails = [
    'test_1779394803347@example.com',
    'u20222208138@usco.edu.co',
    'miguel.ortiz.e13@gmail.com',
  ];
  try {
    for (const email of emails) {
      const user = await prisma.usuario.findUnique({ where: { correo: email } });
      if (user) {
        await prisma.usuario.delete({ where: { id_usuario: user.id_usuario } });
        console.log(`✅ Deleted user with email ${email}`);
      } else {
        console.log(`⚠️ No user found for ${email}`);
      }
    }
  } catch (err) {
    console.error('Error deleting users:', err);
  } finally {
    await prisma.$disconnect();
  }
})();
