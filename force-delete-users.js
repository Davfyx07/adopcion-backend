const fs = require('fs');
const path = require('path');

// Leer el archivo .env manualmente
try {
  const envPath = path.join(__dirname, '.env');
  const envFile = fs.readFileSync(envPath, 'utf8');
  const dbUrlMatch = envFile.match(/DATABASE_URL="?([^"\n\r]+)"?/);
  if (dbUrlMatch) {
    process.env.DATABASE_URL = dbUrlMatch[1];
    console.log('✅ DATABASE_URL cargada desde .env:', process.env.DATABASE_URL);
  } else {
    console.log('⚠️ No se encontró DATABASE_URL en el .env');
  }
} catch (e) {
  console.log('⚠️ Error leyendo .env:', e.message);
}

// Ahora importamos la configuración de prisma del proyecto
const prisma = require('./src/config/prisma');

(async () => {
  const emails = [
    'test_1779394803347@example.com',
    'u20222208138@usco.edu.co',
    'miguel.ortiz.e13@gmail.com',
    'miguel@furmatch.local',
  ];
  
  try {
    for (const email of emails) {
      console.log(`Buscando usuario: ${email}`);
      // Usar withSoftDeleted para buscar incluso si estaban marcados como eliminados lógicamente
      const user = await prisma.withSoftDeleted(async (p) => {
          return p.usuario.findUnique({ where: { correo: email } });
      });

      if (!user) {
        console.log(`⚠️ No se encontró el usuario: ${email}`);
        continue;
      }
      
      console.log(`Usuario encontrado, procediendo a eliminar relacionados...`);

      // Eliminar adoptante si existe
      const adoptante = await prisma.withSoftDeleted(async (p) => p.adoptante.findUnique({ where: { id_usuario: user.id_usuario } }));
      if (adoptante) {
        await prisma.adoptante.delete({ where: { id_usuario: user.id_usuario } });
        console.log(`🧹 Adoptante eliminado para ${email}`);
      }

      // Eliminar albergue si existe
      const albergue = await prisma.withSoftDeleted(async (p) => p.albergue.findUnique({ where: { id_usuario: user.id_usuario } }));
      if (albergue) {
        await prisma.albergue.delete({ where: { id_usuario: user.id_usuario } });
        console.log(`🧹 Albergue eliminado para ${email}`);
      }

      // Eliminar registros dependientes
      await prisma.withSoftDeleted(async (p) => p.terminoAceptado.deleteMany({ where: { id_usuario: user.id_usuario } }));
      await prisma.withSoftDeleted(async (p) => p.notificacion.deleteMany({ where: { id_usuario: user.id_usuario } }));
      await prisma.withSoftDeleted(async (p) => p.logAuditoria.deleteMany({ where: { id_autor: user.id_usuario } }));

      // Finalmente eliminar el usuario (Hard Delete real)
      await prisma.usuario.delete({ where: { id_usuario: user.id_usuario } });
      console.log(`✅ Usuario ${email} eliminado definitivamente.`);
    }
  } catch (err) {
    console.error('❌ Error eliminando usuarios:', err);
  } finally {
    // Si withSoftDeleted devuelve el basePrisma o el extendido, no podemos desconectar fácilmente, 
    // pero el proceso de Node terminará.
    process.exit(0);
  }
})();
