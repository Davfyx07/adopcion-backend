const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');
const {
  listarMatchesAlbergue,
  obtenerDetalleMatchAlbergue,
  contactarAdoptante,
  obtenerHistorialContactos,
} = require('../controllers/albergueMatchController');

/**
 * @swagger
 * tags:
 *   name: AlbergueMatch
 *   description: Gestión de matches desde la perspectiva del albergue
 */

/**
 * @swagger
 * /api/shelters/matches:
 *   get:
 *     summary: Listar matches del albergue autenticado
 *     tags: [AlbergueMatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [pendiente, contactado, cancelado]
 *       - in: query
 *         name: fecha_desde
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: fecha_hasta
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: id_mascota
 *         schema:
 *           type: integer
 *       - in: query
 *         name: order_by
 *         schema:
 *           type: string
 *           enum: [fecha, puntaje]
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
 *         description: Lista de matches del albergue
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Rol no autorizado
 */
router.get(
    '/',
    authMiddleware,
    authorizeRole(['albergue']),
    listarMatchesAlbergue
);

/**
 * @swagger
 * /api/shelters/matches/{id}:
 *   get:
 *     summary: Detalle de un match (vista albergue)
 *     tags: [AlbergueMatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalle del match con datos del adoptante, mascota e historial de contactos
 *       404:
 *         description: Match no encontrado
 *       403:
 *         description: No autorizado
 */
router.get(
  '/:id',
  authMiddleware,
  authorizeRole(['albergue']),
  obtenerDetalleMatchAlbergue
);

/**
 * @swagger
 * /api/shelters/matches/{id}/contact:
 *   post:
 *     summary: Contactar adoptante vía WhatsApp
 *     tags: [AlbergueMatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Enlace de WhatsApp generado y contacto registrado
 *       400:
 *         description: Adoptante sin WhatsApp o ID inválido
 *       403:
 *         description: No autorizado
 *       404:
 *         description: Match no encontrado
 */
router.post(
  '/:id/contact',
  authMiddleware,
  authorizeRole(['albergue']),
  contactarAdoptante
);

/**
 * @swagger
 * /api/shelters/matches/{id}/historial:
 *   get:
 *     summary: Historial de contactos WhatsApp de un match
 *     tags: [AlbergueMatch]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lista de contactos registrados
 *       403:
 *         description: No autorizado
 *       404:
 *         description: Match no encontrado
 */
router.get(
  '/:id/historial',
  authMiddleware,
  authorizeRole(['albergue']),
  obtenerHistorialContactos
);

module.exports = router;
