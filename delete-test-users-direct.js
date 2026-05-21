require('dotenv').config();
console.log('DATABASE_URL:', process.env.DATABASE_URL);
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = process.env.DATABASE_URL?.replace(/^"|"$/g, '');
if (!connectionString) {
  console.error('DATABASE_URL no está definido');
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString, schema: 'public' });
const prisma = new PrismaClient({ adapter, log: ['error'] });

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
      if (!user) { console.log(`⚠️ No user found for ${email}`); continue; }
      const adoptante = await prisma.adoptante.findUnique({ where: { id_usuario: user.id_usuario } });
      if (adoptante) { await prisma.adoptante.delete({ where: { id_usuario: user.id_usuario } }); console.log(`🧹 Deleted adoptante for ${email}`); }
      const albergue = await prisma.albergue.findUnique({ where: { id_usuario: user.id_usuario } });
      if (albergue) { await prisma.albergue.delete({ where: { id_usuario: user.id_usuario } }); console.log(`🧹 Deleted albergue for ${email}`); }
      await prisma.usuario.delete({ where: { id_usuario: user.id_usuario } });
      console.log(`✅ Deleted user ${email}`);
    }
  } catch (err) { console.error('Error:', err); }
  finally { await prisma.$disconnect(); }
})();
