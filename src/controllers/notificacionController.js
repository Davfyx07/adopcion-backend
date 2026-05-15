const {
    obtenerNotificaciones,
    marcarLeida,
    marcarTodasLeidas,
} = require('../services/notificacionService');

/**
 * GET /api/notificaciones
 * Query params: tipo, page, limit, solo_no_leidas
 */
const getNotificaciones = async (req, res) => {
    try {
        const idUsuario = req.user.id;
        const tipo = req.query.tipo || null;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const soloNoLeidas = req.query.solo_no_leidas === 'true';

        const result = await obtenerNotificaciones(idUsuario, { tipo, page, limit, soloNoLeidas });

        return res.status(200).json({
            success: true,
            data: result.data,
            total_no_leidas: result.total_no_leidas,
            meta: result.meta,
        });
    } catch (err) {
        console.error('[notificacion.controller] getNotificaciones:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener notificaciones.',
        });
    }
};

/**
 * PATCH /api/notificaciones/:id/leida
 * Marca una notificación como leída y retorna la notificación actualizada.
 */
const marcarNotificacionLeida = async (req, res) => {
    try {
        const idNotificacion = parseInt(req.params.id);
        const idUsuario = req.user.id;

        if (isNaN(idNotificacion) || idNotificacion <= 0) {
            return res.status(400).json({
                success: false,
                message: 'El ID de notificación debe ser un entero positivo.',
            });
        }

        const result = await marcarLeida(idNotificacion, idUsuario);

        if (!result.success) {
            return res.status(result.status).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Notificación marcada como leída.',
            data: result.data,
        });
    } catch (err) {
        console.error('[notificacion.controller] marcarNotificacionLeida:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Error al marcar notificación como leída.',
        });
    }
};

/**
 * PATCH /api/notificaciones/leer-todas
 * Marca todas las notificaciones del usuario como leídas.
 */
const leerTodasController = async (req, res) => {
    try {
        const idUsuario = req.user.id;

        const result = await marcarTodasLeidas(idUsuario);

        return res.status(200).json({
            success: true,
            message: `${result.count} notificación(es) marcada(s) como leída(s).`,
            count: result.count,
        });
    } catch (err) {
        console.error('[notificacion.controller] leerTodas:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Error al marcar notificaciones como leídas.',
        });
    }
};

module.exports = {
    getNotificaciones,
    marcarNotificacionLeida,
    leerTodas: leerTodasController,
};
