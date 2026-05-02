const service = require('../services/recomendacionService');

const getFeed = async (req, res) => {
    try {
        const idAdoptante = req.user.id;
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        const result = await service.obtenerRecomendaciones(idAdoptante, { limit, offset });

        return res.status(200).json(result);
    } catch (err) {
        console.error('[recomendacion.controller] getFeed:', err.message);
        return res.status(500).json({ success: false, message: 'Error al obtener recomendaciones.' });
    }
};

const postInteres = async (req, res) => {
    try {
        const idAdoptante = req.user.id;
        const idMascota = parseInt(req.params.id);

        if (isNaN(idMascota)) {
            return res.status(400).json({ success: false, message: 'ID de mascota inválido.' });
        }

        const result = await service.registrarInteres(idAdoptante, idMascota);

        if (!result.success) {
            return res.status(result.status).json({ success: false, message: result.message });
        }

        return res.status(201).json(result);
    } catch (err) {
        console.error('[recomendacion.controller] postInteres:', err.message);
        return res.status(500).json({ success: false, message: 'Error al registrar interés.' });
    }
};

const postDescarte = async (req, res) => {
    try {
        const idAdoptante = req.user.id;
        const idMascota = parseInt(req.params.id);

        if (isNaN(idMascota)) {
            return res.status(400).json({ success: false, message: 'ID de mascota inválido.' });
        }

        const result = await service.registrarDescarte(idAdoptante, idMascota);

        if (!result.success) {
            return res.status(result.status).json({ success: false, message: result.message });
        }

        return res.status(201).json(result);
    } catch (err) {
        console.error('[recomendacion.controller] postDescarte:', err.message);
        return res.status(500).json({ success: false, message: 'Error al registrar descarte.' });
    }
};

const postDeshacer = async (req, res) => {
    try {
        const idAdoptante = req.user.id;
        const result = await service.deshacerUltimaAccion(idAdoptante);

        if (!result.success) {
            return res.status(result.status).json({ success: false, message: result.message });
        }

        return res.status(200).json(result);
    } catch (err) {
        console.error('[recomendacion.controller] postDeshacer:', err.message);
        return res.status(500).json({ success: false, message: 'Error al deshacer acción.' });
    }
};

module.exports = {
    getFeed,
    postInteres,
    postDescarte,
    postDeshacer
};
