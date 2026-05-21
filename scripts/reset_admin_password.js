require('dotenv').config();
const bcrypt = require('bcrypt');

const main = async () => {
  const prisma = require('../src/config/prisma');
  try {
    const correo = 'admin@furmatch.local';
    const newPassword = process.env.SEED_PASSWORD || 'FurMatch2025!';
    const hash = await bcrypt.hash(newPassword, 12);
    const updated = await prisma.usuario.update({
      where: { correo },
      data: {
        password_hash: hash,
        intentos_fallidos: 0,
        estado_cuenta: 'activo',
        bloqueado_hasta: null,
      }
    });
    console.log('Admin password updated for', updated.correo);
  } catch (e) {
    console.error('Error updating admin password:', e.message);
  } finally {
    try { await require('../src/config/prisma').$disconnect(); } catch (e) {}
  }
};

main();
