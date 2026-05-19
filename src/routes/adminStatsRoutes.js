const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');
const { getEstadisticas } = require('../controllers/adminStatsController');

/**
 * @swagger
 * /api/admin/estadisticas:
 *   get:
 *     summary: KPIs del sistema para el dashboard de administrador
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas del sistema
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Sin permiso (rol incorrecto)
 *       500:
 *         description: Error interno del servidor
 */
router.get(
    '/admin/estadisticas',
    authMiddleware,
    authorizeRole(['administrador']),
    getEstadisticas
);

module.exports = router;
