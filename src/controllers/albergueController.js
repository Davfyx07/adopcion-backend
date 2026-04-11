const { createAlbergueProfile } = require('../services/albergueService');

/**
 * POST /api/albergue/perfil
 * HU-AL-01: Completar perfil institucional del albergue
 */
const createProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const { nombre_albergue, nit, descripcion, whatsapp, sitio_web } = req.body;

        const result = await createAlbergueProfile({
            userId,
            data: { nombre_albergue, nit, descripcion, whatsapp, sitio_web },
            logoFile: req.file,
            ip,
        });

        if (!result.success) {
            return res.status(result.status).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(201).json({
            success: true,
            message: 'Perfil institucional creado exitosamente. Tu cuenta ha sido activada.',
            data: result.data,
        });

    } catch (err) {
        console.error('[albergue.controller] createProfile:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Ocurrió un error al crear el perfil. Intenta de nuevo más tarde.',
        });
    }
};

module.exports = { createProfile };
