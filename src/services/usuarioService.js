const prisma = require('../config/prisma');

const getUsuarios = async (filtros) => {
  const where = {};
  
  if (filtros.estado) {
    where.estado_cuenta = filtros.estado;
  }
  
  // Si filtramos por rol, necesitamos hacer un join
  if (filtros.rol) {
    where.rol = {
      nombre_rol: filtros.rol
    };
  }

  const usuariosDB = await prisma.usuario.findMany({
    where,
    include: {
      rol: true,
      adoptante: { select: { nombre_completo: true } },
      albergue: { select: { nombre_albergue: true } }
    },
    orderBy: { fecha_registro: 'desc' }
  });

  // Mapear al formato que espera el frontend
  return usuariosDB.map(u => {
    let nombre = "Administrador";
    if (u.adoptante) nombre = u.adoptante.nombre_completo;
    if (u.albergue) nombre = u.albergue.nombre_albergue;

    return {
      id: u.id_usuario,
      correo: u.correo,
      rol: u.rol?.nombre_rol || 'desconocido',
      estado: u.estado_cuenta,
      fecha_registro: u.fecha_registro,
      nombre: nombre
    };
  });
};

const cambiarEstadoUsuario = async (id, estado, motivo, adminId, ip) => {
  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.findUnique({ where: { id_usuario: id } });
    
    if (!usuario) {
      return { success: false, status: 404, message: 'Usuario no encontrado' };
    }

    const updated = await tx.usuario.update({
      where: { id_usuario: id },
      data: { estado_cuenta: estado }
    });

    await tx.logAuditoria.create({
      data: {
        id_autor: adminId,
        accion: estado === 'suspendido' ? 'SUSPEND_USER' : 'ACTIVATE_USER',
        entidad_afectada: 'usuario',
        id_registro_afectado: id,
        valor_anterior: JSON.stringify({ estado_cuenta: usuario.estado_cuenta }),
        valor_nuevo: JSON.stringify({ estado_cuenta: estado }),
        motivo: motivo,
        ip: ip
      }
    });

    return { success: true, data: updated };
  });
};

module.exports = {
  getUsuarios,
  cambiarEstadoUsuario
};
