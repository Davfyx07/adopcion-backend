const usuarioService = require('../services/usuarioService');

const getUsuarios = async (req, res) => {
  try {
    const filtros = {
      rol: req.query.rol,
      estado: req.query.estado
    };
    
    const usuarios = await usuarioService.getUsuarios(filtros);
    res.json({ success: true, data: usuarios });
  } catch (error) {
    console.error('Error en getUsuarios:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

const cambiarEstadoUsuario = async (req, res) => {
  try {
    const id = req.params.id;
    const { estado, motivo } = req.body;
    const adminId = req.user.id;
    const ip = req.ip;

    if (!estado) {
      return res.status(400).json({ success: false, message: 'El estado es requerido' });
    }

    const result = await usuarioService.cambiarEstadoUsuario(id, estado, motivo, adminId, ip);

    if (!result.success) {
      return res.status(result.status).json(result);
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Error en cambiarEstadoUsuario:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

module.exports = {
  getUsuarios,
  cambiarEstadoUsuario
};
