require('dotenv').config();
const main = async () => {
  const prisma = require('../src/config/prisma');
  try {
    const u = await prisma.usuario.findUnique({ where: { correo: 'admin@furmatch.local' } });
    console.log(JSON.stringify(u, null, 2));
    const bcrypt = require('bcrypt');
    const pw = process.env.SEED_PASSWORD || 'FurMatch2025!';
    const match = await bcrypt.compare(pw, u.password_hash);
    console.log('Password matches seed value:', match);
  } catch (e) {
    console.error('Error querying user:', e.message);
  } finally {
    await prisma.$disconnect();
  }
};
main();
