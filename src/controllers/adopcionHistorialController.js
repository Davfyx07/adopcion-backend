const adopcionHistorialService = require('../services/adopcionHistorialService');

/**
 * HU-HIS-02: GET /api/albergue/adopciones
 */
const listarAdopcionesAlbergue = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const { fecha_desde, fecha_hasta, estado, busqueda, page, limit } = req.query;

        const result = await adopcionHistorialService.listarAdopcionesAlbergue(idAlbergue, {
            fecha_desde,
            fecha_hasta,
            estado,
            busqueda,
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 20,
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error('[adopcionHistorialController] listarAdopcionesAlbergue:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al listar adopciones.',
        });
    }
};

/**
 * HU-HIS-02: GET /api/adopciones/:id
 */
const obtenerDetalleAdopcion = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const idAdopcion = parseInt(req.params.id);

        if (!idAdopcion) {
            return res.status(400).json({ success: false, message: 'ID de adopción inválido.' });
        }

        const result = await adopcionHistorialService.obtenerDetalleAdopcion(idAdopcion, idAlbergue);

        if (!result.success) {
            return res.status(result.status).json(result);
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('[adopcionHistorialController] obtenerDetalleAdopcion:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al obtener detalle de adopción.',
        });
    }
};

/**
 * HU-HIS-02: GET /api/albergue/adopciones/exportar
 */
const exportarAdopcionesCSV = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const { fecha_desde, fecha_hasta, estado, busqueda } = req.query;

        const result = await adopcionHistorialService.exportarAdopcionesCSV(idAlbergue, {
            fecha_desde,
            fecha_hasta,
            estado,
            busqueda,
        });

        if (!result.success) {
            return res.status(result.status).json(result);
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="adopciones_${Date.now()}.csv"`);
        return res.status(200).send('\uFEFF' + result.csv); // BOM para Excel
    } catch (error) {
        console.error('[adopcionHistorialController] exportarAdopcionesCSV:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al exportar adopciones.',
        });
    }
};

module.exports = {
    listarAdopcionesAlbergue,
    obtenerDetalleAdopcion,
    exportarAdopcionesCSV,
};
