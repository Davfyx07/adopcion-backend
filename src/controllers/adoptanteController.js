const { crearPerfilAdoptante, obtenerPerfilAdoptante, actualizarPerfilAdoptante, actualizarEtiquetasAdoptante } = require('../services/adoptanteService');

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

/**
 * GET /api/adoptante/perfil
 * Obtiene el perfil de un adoptante autenticado.
 */
const getPerfil = async (req, res) => {
    try {
        const idUsuario = req.user.id;
        const result = await obtenerPerfilAdoptante(idUsuario);

        if (!result.success) {
            return res.status(result.status).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(200).json({
            success: true,
            data: result.data,
        });

    } catch (err) {
        console.error('[adoptante.controller] getPerfil:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener el perfil de adoptante. Intenta de nuevo.',
        });
    }
};

/**
 * PUT /api/adoptante/perfil
 * Actualiza la información básica del perfil del adoptante.
 */
const updatePerfil = async (req, res) => {
    try {
        const { telefono, ciudad, direccion, foto } = req.body;
        const idUsuario = req.user.id;
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const result = await actualizarPerfilAdoptante({
            idUsuario,
            telefono,
            ciudad,
            direccion,
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

        return res.status(200).json({
            success: true,
            message: 'Perfil actualizado exitosamente.',
            data: result.data,
        });

    } catch (err) {
        console.error('[adoptante.controller] updatePerfil:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Error al actualizar el perfil de adoptante.',
        });
    }
};

/**
 * PUT /api/adoptante/etiquetas
 * Actualiza las etiquetas y recalcula el embedding del adoptante.
 */
const updateEtiquetas = async (req, res) => {
    try {
        const { tags } = req.body;
        const idUsuario = req.user.id;
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        let tagIds;
        if (Array.isArray(tags)) {
            tagIds = tags.map(Number);
        } else {
            tagIds = JSON.parse(tags || '[]').map(Number);
        }

        const result = await actualizarEtiquetasAdoptante({
            idUsuario,
            tagIds,
            ip,
        });

        if (!result.success) {
            return res.status(result.status).json({
                success: false,
                message: result.message,
                data: result.data || null,
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Etiquetas actualizadas exitosamente.',
            data: result.data,
        });

    } catch (err) {
        console.error('[adoptante.controller] updateEtiquetas:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Error al actualizar las etiquetas del adoptante.',
        });
    }
};

module.exports = { crearPerfil, getPerfil, updatePerfil, updateEtiquetas };
