const express = require('express');
const router = express.Router();
const controller = require('../controllers/recomendacionController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');

/**
 * @swagger
 * tags:
 *   name: Recomendaciones
 *   description: Feed de mascotas y gestión de matches/descartes (Swipe)
 */

// Todas las rutas de recomendaciones requieren estar autenticado como Adoptante
router.use(authMiddleware);
router.use(authorizeRole(['adoptante']));

/**
 * @swagger
 * /api/recomendaciones:
 *   get:
 *     summary: Obtiene el feed de mascotas compatibles
 *     tags: [Recomendaciones]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Lista de mascotas recomendadas ordenada por compatibilidad
 */
router.get('/', controller.getFeed);

/**
 * @swagger
 * /api/recomendaciones/{id}/me-interesa:
 *   post:
 *     summary: Registra interés en una mascota (Match)
 *     tags: [Recomendaciones]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       201:
 *         description: Match registrado exitosamente
 */
router.post('/:id/me-interesa', controller.postInteres);

/**
 * @swagger
 * /api/recomendaciones/{id}/descartar:
 *   post:
 *     summary: Registra descarte de una mascota
 *     tags: [Recomendaciones]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       201:
 *         description: Descarte registrado exitosamente
 */
router.post('/:id/descartar', controller.postDescarte);

/**
 * @swagger
 * /api/recomendaciones/deshacer:
 *   post:
 *     summary: Deshace la última acción (Like o Skip)
 *     tags: [Recomendaciones]
 *     responses:
 *       200:
 *         description: Acción deshecha correctamente
 */
router.post('/deshacer', controller.postDeshacer);

module.exports = router;
