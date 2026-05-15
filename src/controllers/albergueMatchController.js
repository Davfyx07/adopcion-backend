const albergueMatchService = require('../services/albergueMatchService');

/**
 * HU-MCH-01: GET /api/shelters/matches
 * Lista todos los matches de las mascotas del albergue autenticado.
 */
const listarMatchesAlbergue = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const {
            estado,
            fecha_desde,
            fecha_hasta,
            id_mascota,
            order_by,
            limit,
            offset,
        } = req.query;

        const result = await albergueMatchService.listarMatchesAlbergue(idAlbergue, {
            estado,
            fecha_desde,
            fecha_hasta,
            id_mascota: id_mascota ? parseInt(id_mascota) : undefined,
            order_by,
            limit: limit ? parseInt(limit) : 20,
            offset: offset ? parseInt(offset) : 0,
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error('[albergueMatchController] listarMatchesAlbergue:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al listar matches.',
        });
    }
};

/**
 * HU-MCH-01: GET /api/shelters/matches/:id
 * Detalle completo de un match para el albergue.
 */
const obtenerDetalleMatchAlbergue = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const idMatch = parseInt(req.params.id);

        if (!idMatch) {
            return res.status(400).json({ success: false, message: 'ID de match inválido.' });
        }

        const result = await albergueMatchService.obtenerDetalleMatchAlbergue(idMatch, idAlbergue);

        if (!result.success) {
            return res.status(result.status).json(result);
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('[albergueMatchController] obtenerDetalleMatchAlbergue:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al obtener detalle del match.',
        });
    }
};

module.exports = {
    listarMatchesAlbergue,
    obtenerDetalleMatchAlbergue,
};
