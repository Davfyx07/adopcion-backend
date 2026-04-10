const { crearPerfilAdoptante } = require('../services/adoptanteService');

/**
 * POST /api/adoptante/perfil
 * Crea el perfil de un adoptante autenticado.
 */
const crearPerfil = async (req, res) => {
    try {
        const { telefono, ciudad, direccion, tags, foto } = req.body;
        const idUsuario = req.user.id;
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        // tags puede llegar como array o como JSON string desde el cliente
        let tagIds;
        if (Array.isArray(tags)) {
            tagIds = tags.map(Number);
        } else {
            tagIds = JSON.parse(tags || '[]').map(Number);
        }

        const result = await crearPerfilAdoptante({
            idUsuario,
            telefono,
            ciudad,
            direccion,
            tagIds,
            fotoBase64: foto || null,
            ip,
        });

        if (!result.success) {
            return res.status(result.status).json({
                success: false,
                message: result.message,
                data: result.data || null,
            });
        }

        return res.status(201).json({
            success: true,
            message: 'Perfil de adoptante creado exitosamente.',
            data: result.data,
        });

    } catch (err) {
        console.error('[adoptante.controller] crearPerfil:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Error al crear el perfil de adoptante. Intenta de nuevo más tarde.',
        });
    }
};

module.exports = { crearPerfil };
