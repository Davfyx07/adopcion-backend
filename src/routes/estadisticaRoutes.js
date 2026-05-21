const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');

const { getEstadisticas } = require('../controllers/estadisticaController');

// Solo administradores pueden ver las estadísticas
router.get('/admin/estadisticas', authMiddleware, authorizeRole(['admin']), getEstadisticas);

module.exports = router;
