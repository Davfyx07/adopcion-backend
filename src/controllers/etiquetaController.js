const { getEtiquetas } = require('../services/etiquetaService');

/**
 * GET /api/etiquetas
 * Retorna el catálogo completo de etiquetas disponibles.
 */
const listarEtiquetas = async (req, res) => {
    try {
        const etiquetas = await getEtiquetas();
        return res.status(200).json({
            success: true,
            data: etiquetas,
        });
    } catch (err) {
        console.error('[etiqueta.controller] listarEtiquetas:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener las etiquetas.',
        });
    }
};

module.exports = { listarEtiquetas };
