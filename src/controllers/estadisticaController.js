const estadisticaService = require('../services/estadisticaService');

const getEstadisticas = async (req, res) => {
  try {
    const stats = await estadisticaService.getEstadisticas();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error en getEstadisticas:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor al obtener estadísticas.' });
  }
};

module.exports = {
  getEstadisticas
};
