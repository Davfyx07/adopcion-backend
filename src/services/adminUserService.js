/**
 * adminUserService.js — HU-ADM-01
 *
 * Gestión de usuarios por el administrador:
 *   - getUsuarios: lista con filtros opcionales
 *   - cambiarEstado: suspender / reactivar usuario (con self-guard y auditoría)
 *   - eliminarUsuario: soft delete (con self-guard y auditoría)
 */

const prisma = require('../config/prisma');

/**
 * Lista usuarios con filtros opcionales.
 *
 * @param {object} filters
 * @param {string|number} [filters.rol]     - id_rol (1=adoptante,2=albergue,3=administrador)
 * @param {string}        [filters.estado]  - estado_cuenta ('activo','suspendido',...)
 * @returns {Promise<Array>}
 */
const getUsuarios = async ({ rol, estado } = {}) => {
    // El middleware de Prisma ya inyecta `deleted_at: null` automáticamente.
    const where = {};

    if (rol) {
        const idRol = parseInt(rol, 10);
        if (!isNaN(idRol)) {
            where.id_rol = idRol;
        }
    }

    if (estado) {
        where.estado_cuenta = estado;
    }

    const usuarios = await prisma.usuario.findMany({
        where,
        include: {
            rol: true,
            adoptante: true,
            albergue: true,
        },
        orderBy: { id_usuario: 'asc' },
    });

    return usuarios.map((u) => ({
        id: u.id_usuario,
        correo: u.correo,
        rol: u.rol ? u.rol.nombre_rol : null,
        estado: u.estado_cuenta,
        fecha_registro: u.fecha_registro,
        nombre: u.adoptante
            ? u.adoptante.nombre_completo
            : u.albergue
            ? u.albergue.nombre_albergue
            : null,
    }));
};

/**
 * Cambia el estado_cuenta de un usuario.
 *
 * @param {string|number} adminId  - ID del admin que ejecuta la acción
 * @param {string|number} userId   - ID del usuario a modificar
 * @param {object} payload
 * @param {string} payload.estado  - Nuevo estado ('activo' | 'suspendido')
 * @param {string} [payload.motivo]
 * @returns {Promise<object>}
 */
const cambiarEstado = async (adminId, userId, { estado, motivo }) => {
    // Self-guard
    if (String(adminId) === String(userId)) {
        throw { status: 400, message: 'No puedes modificar tu propio estado' };
    }

    const estadosValidos = ['activo', 'suspendido'];
    if (!estadosValidos.includes(estado)) {
        throw { status: 400, message: `Estado inválido. Debe ser uno de: ${estadosValidos.join(', ')}` };
    }

    return prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.findUnique({
            where: { id_usuario: Number(userId) },
        });

        if (!usuario || usuario.deleted_at !== null) {
            throw { status: 404, message: 'Usuario no encontrado' };
        }

        const actualizado = await tx.usuario.update({
            where: { id_usuario: Number(userId) },
            data: { estado_cuenta: estado },
        });

        await tx.logAuditoria.create({
            data: {
                id_autor: Number(adminId),
                accion: 'CAMBIO_ESTADO_USUARIO',
                entidad_afectada: 'usuario',
                id_registro_afectado: Number(userId),
                valor_anterior: JSON.stringify({ estado_cuenta: usuario.estado_cuenta }),
                valor_nuevo: JSON.stringify({ estado_cuenta: estado, motivo: motivo || null }),
            },
        });

        return {
            id: actualizado.id_usuario,
            estado: actualizado.estado_cuenta,
        };
    });
};

/**
 * Soft delete de un usuario.
 *
 * @param {string|number} adminId
 * @param {string|number} userId
 * @returns {Promise<object>}
 */
const eliminarUsuario = async (adminId, userId) => {
    // Self-guard
    if (String(adminId) === String(userId)) {
        throw { status: 400, message: 'No puedes eliminarte a ti mismo' };
    }

    return prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.findUnique({
            where: { id_usuario: Number(userId) },
        });

        if (!usuario || usuario.deleted_at !== null) {
            throw { status: 404, message: 'Usuario no encontrado' };
        }

        await tx.usuario.update({
            where: { id_usuario: Number(userId) },
            data: { deleted_at: new Date() },
        });

        await tx.logAuditoria.create({
            data: {
                id_autor: Number(adminId),
                accion: 'ELIMINACION_USUARIO',
                entidad_afectada: 'usuario',
                id_registro_afectado: Number(userId),
                valor_anterior: JSON.stringify({ correo: usuario.correo, estado_cuenta: usuario.estado_cuenta }),
            },
        });

        return { success: true };
    });
};

module.exports = {
    getUsuarios,
    cambiarEstado,
    eliminarUsuario,
};
