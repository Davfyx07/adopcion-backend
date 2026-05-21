const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');

const {
  getUsuarios,
  cambiarEstadoUsuario
} = require('../controllers/usuarioController');

// Solo administradores pueden gestionar usuarios
router.get('/admin/usuarios', authMiddleware, authorizeRole(['admin']), getUsuarios);
router.patch('/admin/usuarios/:id/estado', authMiddleware, authorizeRole(['admin']), cambiarEstadoUsuario);

module.exports = router;
