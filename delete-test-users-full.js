require('dotenv').config();
console.log('DATABASE_URL:', process.env.DATABASE_URL);
const prisma = require('./src/config/prisma'); // Import configured Prisma client with adapter

(async () => {
  const emails = [
    'test_1779394803347@example.com',
    'u20222208138@usco.edu.co',
    'miguel.ortiz.e13@gmail.com',
    'miguel@furmatch.local',
  ];
  try {
    for (const email of emails) {
      const user = await prisma.usuario.findUnique({ where: { correo: email } });
      if (!user) {
        console.log(`⚠️ No user found for ${email}`);
        continue;
      }
      // Delete related adoptante if exists
      const adoptante = await prisma.adoptante.findUnique({ where: { id_usuario: user.id_usuario } });
      if (adoptante) {
        await prisma.adoptante.delete({ where: { id_usuario: user.id_usuario } });
        console.log(`🧹 Deleted adoptante linked to ${email}`);
      }
      // Delete related albergue if exists
      const albergue = await prisma.albergue.findUnique({ where: { id_usuario: user.id_usuario } });
      if (albergue) {
        await prisma.albergue.delete({ where: { id_usuario: user.id_usuario } });
        console.log(`🧹 Deleted albergue linked to ${email}`);
      }
      // Finally delete the user
      await prisma.usuario.delete({ where: { id_usuario: user.id_usuario } });
      console.log(`✅ Deleted user with email ${email}`);
    }
  } catch (err) {
    console.error('Error deleting users:', err);
  } finally {
    await prisma.$disconnect();
  }
})();
