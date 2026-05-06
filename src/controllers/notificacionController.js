const { obtenerNotificaciones, marcarLeida, marcarTodasLeidas } = require('../services/notificacionService');

/**
 * GET /api/notificaciones
 * Obtiene las notificaciones del usuario autenticado.
 * Query params:
 *   - solo_no_leidas (boolean): si es true, solo retorna no leídas
 *   - limit (number): límite de resultados (default 50)
 */
const getNotificaciones = async (req, res) => {
    try {
        const idUsuario = req.user.id;
        const soloNoLeidas = req.query.solo_no_leidas === 'true';
        const limit = parseInt(req.query.limit) || 50;

        const result = await obtenerNotificaciones(idUsuario, { soloNoLeidas, limit });

        return res.status(200).json({
            success: true,
            data: result.data,
            total_no_leidas: result.total_no_leidas,
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
 * Marca una notificación como leída.
 */
const marcarNotificacionLeida = async (req, res) => {
    try {
        const idNotificacion = parseInt(req.params.id);
        const idUsuario = req.user.id;

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
 * PATCH /api/notificaciones/leidas
 * Marca todas las notificaciones como leídas.
 */
const marcarTodasLeidasController = async (req, res) => {
    try {
        const idUsuario = req.user.id;

        const result = await marcarTodasLeidas(idUsuario);

        return res.status(200).json({
            success: true,
            message: `${result.count} notificación(es) marcada(s) como leída(s).`,
            count: result.count,
        });
    } catch (err) {
        console.error('[notificacion.controller] marcarTodasLeidas:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Error al marcar notificaciones como leídas.',
        });
    }
};

module.exports = {
    getNotificaciones,
    marcarNotificacionLeida,
    marcarTodasLeidas: marcarTodasLeidasController,
};
