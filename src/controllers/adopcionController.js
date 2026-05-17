const adopcionService = require('../services/adopcionService');

/**
 * POST /api/adopciones
 * Registra una adopción completada. Solo el albergue dueño de la mascota
 * puede invocar este endpoint.
 */
const registrarAdopcion = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const {
            id_mascota,
            id_adoptante,
            observaciones,
            fecha_match,
            fecha_contacto,
        } = req.body;

        const clientIp = req.socket?.remoteAddress || req.ip || null;

        const result = await adopcionService.registrarAdopcion({
            idAlbergue,
            idMascota: parseInt(id_mascota),
            idAdoptante: parseInt(id_adoptante),
            observaciones,
            fecha_match,
            fecha_contacto,
            clientIp,
        });

        if (!result.success) {
            return res.status(result.status).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(201).json({
            success: true,
            message: 'Adopción registrada exitosamente.',
            data: result.data,
        });
    } catch (error) {
        console.error('[adopcionController] Error en registrarAdopcion:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al registrar la adopción.',
        });
    }
};

/**
 * GET /api/albergue/adopciones
 * Lista adopciones del albergue con filtros y paginación
 */
const getAdopcionesAlbergue = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const { fecha_desde, fecha_hasta, estado, busqueda, page, limit } = req.query;

        const result = await adopcionService.getAdopcionesAlbergue(idAlbergue, {
            fecha_desde,
            fecha_hasta,
            estado,
            busqueda,
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 20
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error('[adopcionController] Error en getAdopcionesAlbergue:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al obtener adopciones.',
        });
    }
};

/**
 * GET /api/adopciones/:id
 * Detalle completo de una adopción
 */
const getAdopcionDetail = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const idAdopcion = parseInt(req.params.id);

        const result = await adopcionService.getAdopcionDetail(idAlbergue, idAdopcion);

        if (!result.success) {
            return res.status(result.status).json({
                success: false,
                message: result.message
            });
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('[adopcionController] Error en getAdopcionDetail:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al obtener detalle de la adopción.',
        });
    }
};

/**
 * GET /api/albergue/adopciones/exportar
 * Exportar adopciones a CSV o Excel
 */
const exportarAdopcionesAlbergue = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const { fecha_desde, fecha_hasta, estado, busqueda, format } = req.query;

        const result = await adopcionService.exportarAdopcionesAlbergue(idAlbergue, {
            fecha_desde,
            fecha_hasta,
            estado,
            busqueda,
            format: format === 'excel' ? 'excel' : 'csv'
        });

        if (result.format === 'excel') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=adopciones.xlsx');
            return res.send(result.buffer);
        } else {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=adopciones.csv');
            return res.send(result.data);
        }
    } catch (error) {
        console.error('[adopcionController] Error en exportarAdopcionesAlbergue:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al exportar adopciones.',
        });
    }
};

module.exports = { registrarAdopcion, getAdopcionesAlbergue, getAdopcionDetail, exportarAdopcionesAlbergue };
