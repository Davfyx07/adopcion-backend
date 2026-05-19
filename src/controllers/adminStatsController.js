const adminStatsService = require('../services/adminStatsService');

/**
 * GET /api/admin/estadisticas
 * Devuelve los KPIs del sistema para el dashboard de administrador.
 * Solo accesible para usuarios con rol 'administrador'.
 */
const getEstadisticas = async (req, res) => {
    try {
        const data = await adminStatsService.getEstadisticas();
        return res.json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getEstadisticas };
