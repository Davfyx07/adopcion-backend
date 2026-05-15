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

};


module.exports = {
    calcularMatch,
    obtenerMatches,
    descartarMascota,
    ob
};
