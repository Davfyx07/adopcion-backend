const matchService = require('../services/matchService');

const calcularMatch = async (req, res) => {
    try {
        const idAdoptante = req.user.id;
        const resultados = await matchService.calcularCompatibilidad(idAdoptante);

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
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;
        const estado = req.query.estado || null;
        
        const result = await matchService.obtenerMatches(idAdoptante, { limit, offset, estado });

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
        const idMascota = req.params.id_mascota; // Es UUID, no entero
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

const obtenerMatchPorId = async (req, res) => {
    try {
        const idAdoptante = req.user.id;
        const idMatch = req.params.id_match;
        const result = await matchService.obtenerMatchPorId(idAdoptante, idMatch);

        if (!result.success) {
            return res.status(result.status || 404).json(result);
        }
        return res.status(200).json(result);
    } catch (error) {
        console.error('[matchController] Error en obtenerMatchPorId:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al obtener el match.',
        });
    }
};

module.exports = {
    calcularMatch,
    obtenerMatches,
    obtenerMatchPorId,
    descartarMascota,
};
