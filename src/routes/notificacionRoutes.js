const express = require('express');
const { getNotificaciones, marcarNotificacionLeida, marcarTodasLeidas } = require('../controllers/notificacionController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Notificaciones
 *   description: Gestión de notificaciones de usuario
 */

/**
 * @swagger
 * /api/notificaciones:
 *   get:
 *     summary: Obtener notificaciones del usuario autenticado
 *     description: Retorna la lista de notificaciones del usuario. Opcionalmente filtrar solo no leídas.
 *     tags: [Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: solo_no_leidas
 *         schema:
 *           type: boolean
 *         description: Si es true, solo retorna notificaciones no leídas
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Límite de resultados (default 50)
 *     responses:
 *       200:
 *         description: Lista de notificaciones
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error interno del servidor
 */
router.get('/', authMiddleware, getNotificaciones);

/**
 * @swagger
 * /api/notificaciones/{id}/leida:
 *   patch:
 *     summary: Marcar notificación como leída
 *     description: Cambia el estado de una notificación a "leida".
 *     tags: [Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la notificación
 *     responses:
 *       200:
 *         description: Notificación marcada como leída
 *       401:
 *         description: No autorizado
 *       403:
 *         description: No tienes permiso para modificar esta notificación
 *       404:
 *         description: Notificación no encontrada
 *       500:
 *         description: Error interno del servidor
 */
router.patch('/:id/leida', authMiddleware, marcarNotificacionLeida);

/**
 * @swagger
 * /api/notificaciones/leidas:
 *   patch:
 *     summary: Marcar todas las notificaciones como leídas
 *     description: Cambia el estado de todas las notificaciones pendientes a "leida".
 *     tags: [Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notificaciones marcadas como leídas
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error interno del servidor
 */
router.patch('/leidas', authMiddleware, marcarTodasLeidas);

module.exports = router;
