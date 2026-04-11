const {
    createAlbergueProfile,
    getPerfilAlbergue,
    updatePerfilAlbergue
} = require('../services/albergueService');

/**
 * POST /api/albergue/perfil
 * HU-AL-01: Completar perfil institucional del albergue
 */
const createProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const { nombre_albergue, nit, descripcion, whatsapp, sitio_web, logo } = req.body;

        const result = await createAlbergueProfile({
            userId,
            data: { nombre_albergue, nit, descripcion, whatsapp, sitio_web, logo },
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

/**
 * GET /api/albergue/perfil
 * HU-AL-02: Obtener perfil del albergue
 */
const getPerfil = async (req, res) => {
    try {
        const perfil = await getPerfilAlbergue(req.user.id);

        if (!perfil) {
            return res.status(404).json({
                success: false,
                message: 'Perfil no encontrado'
            });
        }

        res.json({
            success: true,
            data: perfil
        });

    } catch (err) {
        console.error('[albergue] getPerfil:', err.message);
        res.status(500).json({ success: false, message: 'Error interno al obtener el perfil.' });
    }
};

/**
 * PUT /api/albergue/perfil
 * HU-AL-02: Editar perfil del albergue
 */
const updatePerfil = async (req, res) => {
    try {
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const result = await updatePerfilAlbergue(
            req.user.id,
            req.body,
            ip
        );

        if (!result.success) {
            return res.status(result.status).json(result);
        }

        res.json({
            success: true,
            message: 'Perfil actualizado exitosamente',
            data: result.data
        });

    } catch (err) {
        console.error('[albergue] updatePerfil:', err.message);
        res.status(500).json({ success: false, message: 'Error interno al actualizar el perfil.' });
    }
};

module.exports = {
    createProfile,
    getPerfil,
    updatePerfil
};