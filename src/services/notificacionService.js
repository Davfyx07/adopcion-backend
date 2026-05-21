const prisma = require('../config/prisma');

/**
 * Obtener notificaciones de un usuario.
 * @param {string} idUsuario
 * @param {Object} options - { soloNoLeidas, limit }
 * @returns {Object} { success, data }
 */
const obtenerNotificaciones = async (idUsuario, { soloNoLeidas = false, limit = 50 } = {}) => {
    try {
        const where = { id_usuario: idUsuario };

        if (soloNoLeidas) {
            where.leida = false;
        }

        const notificaciones = await prisma.notificacion.findMany({
            where,
            orderBy: { fecha_hora: 'desc' },
            take: limit,
        });

        const totalNoLeidas = soloNoLeidas
            ? notificaciones.length
            : await prisma.notificacion.count({
                where: { id_usuario: idUsuario, leida: false }
            });

        return {
            success: true,
            data: notificaciones.map(n => ({
                id: n.id_notificacion,
                tipo: n.tipo_notificacion,
                mensaje: n.mensaje,
                leida: n.leida,
                fecha_creacion: n.fecha_hora,
                recurso_id: n.recurso_id,
            })),
            total_no_leidas: totalNoLeidas,
        };
    } catch (err) {
        console.error('[notificacion.service] obtenerNotificaciones:', err.message);
        throw err;
    }
};

/**
 * Marcar una notificación como leída.
 * @param {string} idNotificacion
 * @param {string} idUsuario - para verificar propiedad
 * @returns {Object} { success, message? }
 */
const marcarLeida = async (idNotificacion, idUsuario) => {
    try {
        const notificacion = await prisma.notificacion.findUnique({
            where: { id_notificacion: idNotificacion }
        });

        if (!notificacion) {
            return { success: false, status: 404, message: 'Notificación no encontrada.' };
        }

        if (notificacion.id_usuario !== idUsuario) {
            return { success: false, status: 403, message: 'No tienes permiso para modificar esta notificación.' };
        }

        await prisma.notificacion.update({
            where: { id_notificacion: idNotificacion },
            data: {
                leida: true,
            }
        });

        return { success: true };
    } catch (err) {
        console.error('[notificacion.service] marcarLeida:', err.message);
        throw err;
    }
};

/**
 * Marcar todas las notificaciones como leídas para un usuario.
 * @param {string} idUsuario
 * @returns {Object} { success, count }
 */
const marcarTodasLeidas = async (idUsuario) => {
    try {
        const result = await prisma.notificacion.updateMany({
            where: { id_usuario: idUsuario, leida: false },
            data: {
                leida: true,
            }
        });

        return { success: true, count: result.count };
    } catch (err) {
        console.error('[notificacion.service] marcarTodasLeidas:', err.message);
        throw err;
    }
};

module.exports = {
    obtenerNotificaciones,
    marcarLeida,
    marcarTodasLeidas,
};
