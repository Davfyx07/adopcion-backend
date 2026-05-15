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

module.exports = { registrarAdopcion };
