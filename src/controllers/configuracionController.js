const configuracionService = require('../services/configuracionService');

const getConfiguracion = async (req, res) => {
  try {
    const config = await configuracionService.getConfiguracion();
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error en getConfiguracion:', error);
    res.status(500).json({ success: false, message: 'Error interno al obtener configuración' });
  }
};

const updateConfiguracionGrupo = async (req, res) => {
  try {
    const grupo = req.params.grupo;
    const values = req.body;
    const adminId = req.user.id;
    const ip = req.ip;

    if (!values || typeof values !== 'object') {
      return res.status(400).json({ success: false, message: 'Se esperaban los valores de configuración en el body' });
    }

    const result = await configuracionService.updateConfiguracionGrupo(grupo, values, adminId, ip);
    res.json({ success: true, message: 'Configuración actualizada correctamente' });
  } catch (error) {
    console.error('Error en updateConfiguracionGrupo:', error);
    res.status(500).json({ success: false, message: 'Error interno al actualizar la configuración' });
  }
};

module.exports = {
  getConfiguracion,
  updateConfiguracionGrupo
};
