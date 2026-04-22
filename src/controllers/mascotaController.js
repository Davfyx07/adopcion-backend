const mascotaService = require('../services/mascotaService');

/**
 * @desc    Registrar una nueva mascota con etiquetas y fotos
 * @route   POST /api/pets
 * @access  Private (Sólo Albergue)
 */
const crearMascota = async (req, res) => {
    try {
        const authUserId = req.user.id; // Del authMiddleware
        const clientIp = req.socket.remoteAddress || req.ip;

        const result = await mascotaService.crearMascota(
            authUserId,   // El ID del albergue es el mismo ID del usuario
            authUserId,   // ID del autor (para auditoría)
            req.body,
            clientIp
        );

        return res.status(201).json({
            success: true,
            message: 'Mascota publicada exitosamente',
            data: result
        });
    } catch (error) {
        console.error('[mascotaController] Error en crearMascota:', error);
        if (error.message.includes('tagsIds proporcionados no son válidos')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor al publicar la mascota.'
        });
    }
};

/**
 * @desc    Obtener vista previa de una mascota por su ID
 * @route   GET /api/pets/:id
 * @access  Public
 */
const previsualizarMascota = async (req, res) => {
    try {
        const { id } = req.params;

        const mascota = await mascotaService.obtenerMascotaPorId(id);

        if (!mascota) {
            return res.status(404).json({
                success: false,
                message: 'Mascota no encontrada o ha sido eliminada.'
            });
        }

        return res.status(200).json({
            success: true,
            data: mascota
        });
    } catch (error) {
        console.error('[mascotaController] Error en previsualizarMascota:', error);
        // Si el UUID es inválido en postgres, lanzará un error de sintaxis que capturaremos
        if (error.code === '22P02') {
            return res.status(400).json({ success: false, message: 'ID de mascota inválido.' });
        }
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor al obtener la mascota.'
        });
    }
};

module.exports = { crearMascota, previsualizarMascota };
