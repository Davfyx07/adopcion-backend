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
 * /api/match/calcular:
 *   post:
 *     summary: Calcular compatibilidad para el adoptante autenticado
 *     description: >
 *       Ejecuta el algoritmo de matching ponderado para el adoptante autenticado.
 *       Limpia matches previos en estado 'pendiente' y persiste los nuevos resultados
 *       que superen el umbral del 30% de compatibilidad.
 *     tags: [Match]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de mascotas ordenada por compatibilidad descendente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_mascota:
 *                         type: integer
 *                         example: 1
 *                       nombre:
 *                         type: string
 *                         example: Luna
 *                       descripcion:
 *                         type: string
 *                         example: Perrita sociable y tranquila
 *                       foto:
 *                         type: string
 *                         nullable: true
 *                         example: https://res.cloudinary.com/demo/image/upload/mascota.jpg
 *                       compatibilidad:
 *                         type: integer
 *                         example: 70
 *                       tags:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             valor:
 *                               type: string
 *                             nombre_tag:
 *                               type: string
 *                             categoria:
 *                               type: string
 *       401:
 *         description: Token requerido o inválido
 *       403:
 *         description: El usuario no tiene rol adoptante
 *       500:
 *         description: Error interno al calcular compatibilidad
 */
router.post('/calcular',
    authMiddleware,
    authorizeRole(['adoptante']),
    matchController.calcularMatch
);

/**
 * @swagger
 * /api/match:
 *   get:
 *     summary: Obtener matches del adoptante autenticado
 *     description: Retorna todos los matches registrados para el adoptante autenticado, ordenados por fecha descendente.
 *     tags: [Match]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de matches del adoptante
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_match:
 *                         type: integer
 *                       id_adoptante:
 *                         type: integer
 *                       id_mascota:
 *                         type: integer
 *                       puntaje:
 *                         type: number
 *                         format: decimal
 *                       estado:
 *                         type: string
 *                       fecha:
 *                         type: string
 *                         format: date-time
 *                       mascota:
 *                         type: object
 *       401:
 *         description: Token requerido o inválido
 *       403:
 *         description: El usuario no tiene rol adoptante
 *       500:
 *         description: Error interno al obtener matches
 */
router.get('/',
    authMiddleware,
    authorizeRole(['adoptante']),
    matchController.obtenerMatches
);

/**
 * @swagger
 * /api/match/descartar/{id_mascota}:
 *   post:
 *     summary: Descartar una mascota del matching
 *     description: >
 *       Registra un descarte del adoptante autenticado hacia una mascota.
 *       También elimina cualquier match pendiente existente entre ambos.
 *       La mascota descartada no aparecerá en futuros cálculos de compatibilidad.
 *     tags: [Match]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id_mascota
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la mascota a descartar
 *     responses:
 *       200:
 *         description: Mascota descartada exitosamente
 *       401:
 *         description: Token requerido o inválido
 *       403:
 *         description: El usuario no tiene rol adoptante
 *       404:
 *         description: Mascota no encontrada
 *       409:
 *         description: La mascota ya fue descartada previamente
 *       500:
 *         description: Error interno al descartar mascota
 */
router.post('/descartar/:id_mascota',
    authMiddleware,
    authorizeRole(['adoptante']),
    matchController.descartarMascota
);

/**
 * @swagger
 * /api/match/{id}:
 *   get:
 *     summary: Obtener detalle de un match
 *     description: Retorna el detalle completo de un match perteneciente al adoptante autenticado.
 *     tags: [Match]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Detalle del match
 *       404:
 *         description: Match no encontrado
 *       403:
 *         description: No autorizado
 */
router.get('/:id',
    authMiddleware,
    authorizeRole(['adoptante']),
    matchController.obtenerDetalleMatch
);

module.exports = router;
