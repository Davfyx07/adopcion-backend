const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');

const {
  getConfiguracion,
  updateConfiguracionGrupo
} = require('../controllers/configuracionController');

// Solo administradores pueden gestionar la configuración global
router.get('/admin/configuracion', authMiddleware, authorizeRole(['admin']), getConfiguracion);
router.put('/admin/configuracion/:grupo', authMiddleware, authorizeRole(['admin']), updateConfiguracionGrupo);

module.exports = router;
