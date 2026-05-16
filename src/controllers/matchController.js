const matchService = require('../services/matchService');

const calcularMatch = async (req, res) => {
    try {
        const idAdoptante = req.user.id;
        const { tipoAnimal } = req.body;
        const resultados = await matchService.calcularCompatibilidad(idAdoptante, tipoAnimal);

        return res.status(200).json({
            success: true,
            data: resultados,
        });
    } catch (error) {
        console.error('[matchController] Error en calcularMatch:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al calcular compatibilidad.',
        });
    }
};

const obtenerMatches = async (req, res) => {
    try {
        const idAdoptante = req.user.id;
        const result = await matchService.obtenerMatches(idAdoptante, {
            estado: req.query.estado,
            fecha_desde: req.query.fecha_desde,
            fecha_hasta: req.query.fecha_hasta,
            limit: req.query.limit,
            offset: req.query.offset,
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error('[matchController] Error en obtenerMatches:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al obtener matches.',
        });
    }
};

const descartarMascota = async (req, res) => {
    try {
        const idAdoptante = req.user.id;
        const idMascota = parseInt(req.params.id_mascota);
        const result = await matchService.descartarMascota(idAdoptante, idMascota);

        if (!result.success) {
            return res.status(result.status).json(result);
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('[matchController] Error en descartarMascota:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al descartar mascota.',
        });
    }
};

// HU-MCH-03: Detalle de un match (adoptante)
const obtenerDetalleMatch = async (req, res) => {
    try {
        const idAdoptante = req.user.id;
        const idMatch = parseInt(req.params.id);

        if (!idMatch) {
            return res.status(400).json({ success: false, message: 'ID de match inválido.' });
        }

        const result = await matchService.obtenerDetalleMatch(idMatch, idAdoptante);

        if (!result.success) {
            return res.status(result.status).json(result);
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('[matchController] Error en obtenerDetalleMatch:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al obtener detalle del match.',
        });
    }
};

// HU-MCH-02: Contactar adoptante via WhatsApp (albergue)
const contactarAdoptante = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const idMatch = parseInt(req.params.id);

        if (!idMatch) {
            return res.status(400).json({ success: false, message: 'ID de match inválido.' });
        }

        const result = await matchService.contactarAdoptante(idAlbergue, idMatch);

        if (!result.success) {
            return res.status(result.status).json(result);
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('[matchController] Error en contactarAdoptante:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al contactar adoptante.',
        });
    }
};

module.exports = {
    calcularMatch,
    obtenerMatches,
    descartarMascota,
    obtenerDetalleMatch,
    contactarAdoptante,
};
