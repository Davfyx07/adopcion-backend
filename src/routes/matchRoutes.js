const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');
const matchController = require('../controllers/matchController');

/**
 * @swagger
 * tags:
 *   name: Match
 *   description: Motor de matching entre adoptantes y mascotas
 */

/**
 * @swagger
 * /api/emparejamiento/calcular:
 *   post:
 *     summary: Calcular compatibilidad para el adoptante autenticado
 *     tags: [Match]
 */
router.post('/emparejamiento/calcular',
    authMiddleware,
    authorizeRole(['adoptante']),
    matchController.calcularMatch
);

/**
 * @swagger
 * /api/match/descartar/{id_mascota}:
 *   post:
 *     summary: Descartar una mascota del matching
 *     tags: [Match]
 */
router.post('/match/descartar/:id_mascota',
    authMiddleware,
    authorizeRole(['adoptante']),
    matchController.descartarMascota
);

/**
 * @swagger
 * /api/adopters/matches:
 *   get:
 *     summary: Obtener matches del adoptante autenticado (HU-MCH-03)
 *     description: Retorna todos los matches registrados para el adoptante autenticado, con filtros y paginación.
 *     tags: [Match]
 *     security:
 *       - bearerAuth: []
 */
router.get('/adopters/matches',
    authMiddleware,
    authorizeRole(['adoptante']),
    matchController.obtenerMatches
);

/**
 * @swagger
 * /api/matches/{id}:
 *   get:
 *     summary: Obtener detalle de un match (HU-MCH-03)
 *     description: Retorna el detalle completo de un match perteneciente al adoptante autenticado.
 *     tags: [Match]
 *     security:
 *       - bearerAuth: []
 */
router.get('/matches/:id',
    authMiddleware,
    authorizeRole(['adoptante']),
    matchController.obtenerDetalleMatch
);

/**
 * @swagger
 * /api/matches/{id}/contact:
 *   post:
 *     summary: Contactar a un adoptante vía WhatsApp (HU-MCH-02)
 *     tags: [Match]
 *     security:
 *       - bearerAuth: []
 */
router.post('/matches/:id/contact',
    authMiddleware,
    authorizeRole(['albergue']),
    matchController.contactarAdoptante
);

module.exports = router;
