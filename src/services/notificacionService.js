const prisma = require('../config/prisma');

// ──────────────────────────────────────────────
// Helper: derivar título legible desde tipo_notificacion
// ──────────────────────────────────────────────
const TITULOS = {
    nuevo_match: 'Nuevo match',
    match: 'Match',
    mascota_adoptada: 'Mascota adoptada',
    adopcion_confirmada: 'Adopción confirmada',
    mascota_disponible: 'Mascota disponible',
};

const derivarTitulo = (tipo) => {
    if (!tipo) return 'Notificación';
    return TITULOS[tipo] || tipo.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

// ──────────────────────────────────────────────
// Obtener notificaciones con filtros y paginación
// ──────────────────────────────────────────────

/**
 * @param {number} idUsuario
 * @param {Object} options - { tipo, page, limit, soloNoLeidas }
 */
const obtenerNotificaciones = async (idUsuario, { tipo, page = 1, limit = 20, soloNoLeidas = false } = {}) => {
    try {
        const where = { id_usuario: idUsuario };

        if (soloNoLeidas) {
            where.estado = 'pendiente';
        }

        if (tipo) {
            where.tipo_notificacion = tipo;
        }

        const offset = (page - 1) * limit;

        const [notificaciones, total, totalNoLeidas] = await Promise.all([
            prisma.notificacion.findMany({
                where,
                orderBy: { fecha_creacion: 'desc' },
                skip: offset,
                take: limit,
            }),
            prisma.notificacion.count({ where }),
            prisma.notificacion.count({
                where: { id_usuario: idUsuario, estado: 'pendiente' },
            }),
        ]);

        return {
            success: true,
            data: notificaciones.map((n) => ({
                id_notificacion: n.id,
                tipo: n.tipo_notificacion,
                titulo: derivarTitulo(n.tipo_notificacion),
                mensaje: n.mensaje,
                leida: n.estado === 'leida',
                fecha_creacion: n.fecha_creacion,
                recurso_tipo: n.recurso_tipo,
                recurso_id: n.recurso_id,
            })),
            total_no_leidas: totalNoLeidas,
            meta: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    } catch (err) {
        console.error('[notificacion.service] obtenerNotificaciones:', err.message);
        throw err;
    }
};

// ──────────────────────────────────────────────
// Marcar una notificación como leída
// ──────────────────────────────────────────────

/**
 * @param {number} idNotificacion
 * @param {number} idUsuario
 * @returns {Object} { success, data? | status, message }
 */
const marcarLeida = async (idNotificacion, idUsuario) => {
    try {
        const notificacion = await prisma.notificacion.findUnique({
            where: { id: idNotificacion },
        });

        if (!notificacion) {
            return { success: false, status: 404, message: 'Notificación no encontrada.' };
        }

        if (notificacion.id_usuario !== idUsuario) {
            return { success: false, status: 403, message: 'No tienes permiso para modificar esta notificación.' };
        }

        const actualizada = await prisma.notificacion.update({
            where: { id: idNotificacion },
            data: {
                estado: 'leida',
                fecha_lectura: new Date(),
            },
        });

        return {
            success: true,
            data: {
                id_notificacion: actualizada.id,
                tipo: actualizada.tipo_notificacion,
                titulo: derivarTitulo(actualizada.tipo_notificacion),
                mensaje: actualizada.mensaje,
                leida: true,
                fecha_creacion: actualizada.fecha_creacion,
                fecha_lectura: actualizada.fecha_lectura,
                recurso_tipo: actualizada.recurso_tipo,
                recurso_id: actualizada.recurso_id,
            },
        };
    } catch (err) {
        console.error('[notificacion.service] marcarLeida:', err.message);
        throw err;
    }
};

// ──────────────────────────────────────────────
// Marcar todas las notificaciones como leídas
// ──────────────────────────────────────────────

/**
 * @param {number} idUsuario
 * @returns {Object} { success, count }
 */
const marcarTodasLeidas = async (idUsuario) => {
    try {
        const result = await prisma.notificacion.updateMany({
            where: { id_usuario: idUsuario, estado: 'pendiente' },
            data: {
                estado: 'leida',
                fecha_lectura: new Date(),
            },
        });

        return { success: true, count: result.count };
    } catch (err) {
        console.error('[notificacion.service] marcarTodasLeidas:', err.message);
        throw err;
    }
};

// ──────────────────────────────────────────────
// Limpieza de notificaciones antiguas (> 30 días)
// Invocado por el job diario a las 3:00 AM
// ──────────────────────────────────────────────

/**
 * Elimina notificaciones con fecha_creacion anterior a 30 días.
 * @returns {Object} { success, eliminadas }
 */
const limpiarNotificacionesAntiguas = async () => {
    try {
        const limite = new Date();
        limite.setDate(limite.getDate() - 30);

        const result = await prisma.notificacion.deleteMany({
            where: {
                fecha_creacion: { lt: limite },
            },
        });

        console.log(`[notificacion.service] Limpieza: ${result.count} notificaciones eliminadas (anteriores a ${limite.toISOString()})`);

        return { success: true, eliminadas: result.count };
    } catch (err) {
        console.error('[notificacion.service] limpiarNotificacionesAntiguas:', err.message);
        throw err;
    }
};

module.exports = {
    obtenerNotificaciones,
    marcarLeida,
    marcarTodasLeidas,
    limpiarNotificacionesAntiguas,
    derivarTitulo,
};
