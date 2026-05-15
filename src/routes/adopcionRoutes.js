const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');
const adopcionController = require('../controllers/adopcionController');
const { validarRegistrarAdopcion } = require('../middlewares/adopcionValidation');

/**
 * @swagger
 * tags:
 *   name: Adopciones
 *   description: Registro y gestión de adopciones completadas
 */

/**
 * @swagger
 * /api/adopciones:
 *   post:
 *     summary: Registrar una adopción completada
 *     description: >
 *       Permite a un albergue registrar formalmente la adopción de una mascota.
 *       La operación es transaccional y realiza las siguientes acciones atómicas:
 *       validar pertenencia de la mascota al albergue, validar existencia de match
 *       previo con el adoptante, crear el registro de adopción, actualizar el estado
 *       de la mascota a 'adoptado', cancelar todos los matches pendientes de la mascota,
 *       enviar notificación al adoptante seleccionado, enviar notificaciones a los
 *       adoptantes no seleccionados y registrar la acción en el log de auditoría.
 *     tags: [Adopciones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id_mascota
 *               - id_adoptante
 *             properties:
 *               id_mascota:
 *                 type: integer
 *                 description: ID de la mascota a adoptar
 *                 example: 5
 *               id_adoptante:
 *                 type: integer
 *                 description: ID del adoptante seleccionado
 *                 example: 12
 *               observaciones:
 *                 type: string
 *                 description: Notas adicionales sobre la adopción
 *                 example: "Adoptante con experiencia previa con perros."
 *               fecha_match:
 *                 type: string
 *                 format: date-time
 *                 description: Fecha en que se produjo el match (opcional, se toma del match si no se provee)
 *               fecha_contacto:
 *                 type: string
 *                 format: date-time
 *                 description: Fecha en que el albergue contactó al adoptante (opcional)
 *     responses:
 *       201:
 *         description: Adopción registrada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Adopción registrada exitosamente.
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_adopcion:
 *                       type: integer
 *                     id_mascota:
 *                       type: integer
 *                     id_adoptante:
 *                       type: integer
 *                     fecha:
 *                       type: string
 *                       format: date-time
 *                     estado:
 *                       type: string
 *                       example: en_proceso
 *                     observaciones:
 *                       type: string
 *                       nullable: true
 *                     porcentaje_compatibilidad:
 *                       type: number
 *                       nullable: true
 *                     matches_cancelados:
 *                       type: integer
 *                       description: Cantidad de matches pendientes cancelados
 *       400:
 *         description: Datos inválidos, mascota ya adoptada o sin match previo
 *       401:
 *         description: Token requerido o inválido
 *       403:
 *         description: El albergue no es dueño de la mascota
 *       404:
 *         description: Mascota no encontrada
 *       500:
 *         description: Error interno al registrar la adopción
 */
router.post(
    '/',
    authMiddleware,
    authorizeRole(['albergue']),
    validarRegistrarAdopcion,
    adopcionController.registrarAdopcion
);

/**
 * @swagger
 * /api/adopciones/{id}:
 *   get:
 *     summary: Obtener detalle de una adopción
 *     description: Solo el albergue dueño de la mascota puede consultar el detalle.
 *     tags: [Adopciones]
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
 *         description: Detalle de la adopción
 *       403:
 *         description: No autorizado
 *       404:
 *         description: Adopción no encontrada
 */
const { obtenerDetalleAdopcion } = require('../controllers/adopcionHistorialController');
router.get(
    '/:id',
    authMiddleware,
    authorizeRole(['albergue']),
    obtenerDetalleAdopcion
);

module.exports = router;

