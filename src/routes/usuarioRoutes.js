const express = require('express');
const crypto = require('crypto');
const authMiddleware = require('../middlewares/authMiddleware');
const prisma = require('../config/prisma');

const router = express.Router();

const addToBlacklist = async (token, expiresInSeconds = 3600) => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const fechaExpiracion = new Date(Date.now() + expiresInSeconds * 1000);

  await prisma.blacklistToken.create({
    data: {
      token_hash: tokenHash,
      fecha_expiracion: fechaExpiracion,
    },
  });
};

const getUserRoleName = async (idRol) => {
  const rol = await prisma.rol.findUnique({ where: { id_rol: idRol } });
  return rol?.nombre_rol || null;
};

router.delete('/cuenta', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const token = req.headers.authorization?.replace('Bearer ', '') || req.token;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.findUnique({
        where: { id_usuario: userId },
        include: { adoptante: true, albergue: true },
      });

      if (!usuario) {
        throw { status: 404, message: 'Usuario no encontrado.' };
      }

      const roleName = await getUserRoleName(usuario.id_rol);

      if (roleName === 'adoptante' && usuario.adoptante) {
        await tx.adoptante.update({
          where: { id_usuario: userId },
          data: { deleted_at: now },
        });

        await tx.match.updateMany({
          where: {
            id_adoptante: userId,
            estado: 'pendiente',
          },
          data: { estado: 'cancelado' },
        });
      }

      if (roleName === 'albergue' && usuario.albergue) {
        await tx.albergue.update({
          where: { id_usuario: userId },
          data: { deleted_at: now },
        });
      }

      await tx.usuario.update({
        where: { id_usuario: userId },
        data: { deleted_at: now },
      });

      await addToBlacklist(token, 86400);
    });

    return res.status(200).json({
      success: true,
      message: 'Cuenta eliminada.',
    });
  } catch (error) {
    console.error('Error al eliminar cuenta:', error);
    const status = error.status || 500;
    const message = error.message || 'Error interno del servidor.';
    return res.status(status).json({ success: false, message });
  }
});

router.get('/datos', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const usuario = await prisma.usuario.findUnique({
      where: { id_usuario: userId },
      select: {
        correo: true,
        fecha_registro: true,
        id_rol: true,
      },
    });

    if (!usuario) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }

    const roleName = await getUserRoleName(usuario.id_rol);

    let perfil = null;
    let matches = null;
    let mascotas = null;

    if (roleName === 'adoptante') {
      const adoptante = await prisma.adoptante.findUnique({
        where: { id_usuario: userId },
        include: {
          adoptante_tag: {
            include: {
              opcion_tag: {
                include: { tag: true },
              },
            },
          },
        },
      });

      if (adoptante) {
        perfil = {
          nombre_completo: adoptante.nombre_completo,
          whatsapp: adoptante.whatsapp_adoptante,
          ciudad: adoptante.ciudad,
          direccion: adoptante.direccion,
          foto_perfil: adoptante.foto_perfil,
          etiquetas: adoptante.adoptante_tag.map((at) => ({
            valor: at.opcion_tag.valor,
            categoria: at.opcion_tag.tag.nombre_tag,
          })),
        };
      }

      const adoptanteMatches = await prisma.match.findMany({
        where: { id_adoptante: userId },
        include: {
          mascota: {
            include: {
              mascota_foto: { take: 1, orderBy: { orden: 'asc' } },
            },
          },
        },
        orderBy: { fecha: 'desc' },
      });

      matches = adoptanteMatches.map((m) => ({
        id_match: m.id_match,
        puntaje: m.puntaje,
        estado: m.estado,
        fecha: m.fecha,
        mascota: {
          id_mascota: m.mascota.id_mascota,
          nombre: m.mascota.nombre,
          estado_adopcion: m.mascota.estado_adopcion,
          foto_url: m.mascota.mascota_foto[0]?.url_foto || null,
        },
      }));
    }

    if (roleName === 'albergue') {
      const albergue = await prisma.albergue.findUnique({
        where: { id_usuario: userId },
      });

      if (albergue) {
        perfil = {
          nit: albergue.nit,
          nombre_albergue: albergue.nombre_albergue,
          logo: albergue.logo,
          descripcion: albergue.descripcion,
          whatsapp_actual: albergue.whatsapp_actual,
          sitio_web: albergue.sitio_web,
        };
      }

      const albergueMascotas = await prisma.mascota.findMany({
        where: { id_albergue: userId },
        include: {
          mascota_foto: { take: 1, orderBy: { orden: 'asc' } },
        },
        orderBy: { fecha_publicacion: 'desc' },
      });

      mascotas = albergueMascotas.map((m) => ({
        id_mascota: m.id_mascota,
        nombre: m.nombre,
        descripcion: m.descripcion,
        estado_adopcion: m.estado_adopcion,
        fecha_publicacion: m.fecha_publicacion,
        foto_url: m.mascota_foto[0]?.url_foto || null,
      }));
    }

    const terminos = await prisma.terminoAceptado.findMany({
      where: { id_usuario: userId },
      select: {
        version_documento: true,
        ip_aceptacion: true,
        fecha_hora_aceptacion: true,
      },
      orderBy: { fecha_hora_aceptacion: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: {
        usuario: {
          correo: usuario.correo,
          fecha_registro: usuario.fecha_registro,
          id_rol: usuario.id_rol,
        },
        perfil,
        terminos_aceptados: terminos,
        matches,
        mascotas,
      },
    });
  } catch (error) {
    console.error('Error al exportar datos:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
});

module.exports = router;