const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const {
    getNotificaciones,
    marcarNotificacionLeida,
    leerTodas,
} = require('../controllers/notificacionController');

/**
 * @swagger
 * tags:
 *   name: Notificaciones
 *   description: Centro de notificaciones del usuario
 */

/**
 * @swagger
 * /api/notificaciones:
 *   get:
 *     summary: Listar notificaciones del usuario autenticado
 *     description: >
 *       Retorna las notificaciones del usuario con soporte de filtro por tipo,
 *       paginación (20 por página por defecto) y ordenamiento por fecha descendente.
 *     tags: [Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *           enum: [nuevo_match, match, mascota_adoptada, adopcion_confirmada]
 *         description: Filtrar por tipo de notificación
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Resultados por página (máx. 100)
 *       - in: query
 *         name: solo_no_leidas
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Si es true, solo retorna notificaciones no leídas
 *     responses:
 *       200:
 *         description: Lista de notificaciones paginada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_notificacion:
 *                         type: integer
 *                       tipo:
 *                         type: string
 *                       titulo:
 *                         type: string
 *                       mensaje:
 *                         type: string
 *                       leida:
 *                         type: boolean
 *                       fecha_creacion:
 *                         type: string
 *                         format: date-time
 *                 total_no_leidas:
 *                   type: integer
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error interno del servidor
 */
router.get('/', authMiddleware, getNotificaciones);

/**
 * @swagger
 * /api/notificaciones/leer-todas:
 *   patch:
 *     summary: Marcar todas las notificaciones como leídas
 *     description: Actualiza todas las notificaciones pendientes del usuario a estado leída.
 *     tags: [Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notificaciones actualizadas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 count:
 *                   type: integer
 *                   description: Cantidad de notificaciones actualizadas
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error interno del servidor
 */
router.patch('/leer-todas', authMiddleware, leerTodas);

/**
 * @swagger
 * /api/notificaciones/{id}/leida:
 *   patch:
 *     summary: Marcar una notificación como leída
 *     description: >
 *       Cambia el estado de una notificación específica a leída.
 *       Valida que la notificación pertenezca al usuario autenticado.
 *       Retorna la notificación actualizada.
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_notificacion:
 *                       type: integer
 *                     tipo:
 *                       type: string
 *                     titulo:
 *                       type: string
 *                     mensaje:
 *                       type: string
 *                     leida:
 *                       type: boolean
 *                       example: true
 *                     fecha_creacion:
 *                       type: string
 *                       format: date-time
 *                     fecha_lectura:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: ID inválido
 *       401:
 *         description: No autorizado
 *       403:
 *         description: La notificación no pertenece al usuario
 *       404:
 *         description: Notificación no encontrada
 *       500:
 *         description: Error interno del servidor
 */
router.patch('/:id/leida', authMiddleware, marcarNotificacionLeida);

module.exports = router;
