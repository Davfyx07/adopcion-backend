const express = require('express');
const router = express.Router();

const { crearMascota, previsualizarMascota, cambiarEstado } = require('../controllers/mascotaController');
const { validateCreateMascota, validateCambioEstado } = require('../middlewares/mascotaValidation');
const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');

/**
 * @swagger
 * tags:
 *   name: Pets
 *   description: Endpoints para gestión de publicaciones de mascotas
 */

/**
 * @swagger
 * /api/pets:
 *   post:
 *     summary: Publicar una nueva mascota (Solo Albergues)
 *     tags: [Pets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *               - fotos
 *               - tagsIds
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: 'Max'
 *                 description: 'Nombre de la mascota'
 *               descripcion:
 *                 type: string
 *                 example: 'Perrito muy juguetón y amigable.'
 *                 description: 'Descripción breve de la mascota'
 *               fotos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   description: Imagen en Base64 (JPG/PNG)
 *                 example: ['data:image/jpeg;base64,...']
 *               tagsIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: IDs (UUID) de los tags asociados
 *                 example: ['c2d29867-3d0b-d497-9191-18a9d8ee7830']
 *     responses:
 *       201:
 *         description: Mascota publicada exitosamente
 *       400:
 *         description: Errores de validación o tags incorrectos
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No autorizado (no es albergue)
 *       500:
 *         description: Error en servidor
 */
router.post('/', authMiddleware, authorizeRole(['albergue']), validateCreateMascota, crearMascota);

/**
 * @swagger
 * /api/pets/{id}:
 *   get:
 *     summary: Obtener el detalle de una mascota (Vista previa)
 *     tags: [Pets]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: UUID de la mascota
 *     responses:
 *       200:
 *         description: Datos de la mascota, incluyendo fotos y tags
 *       404:
 *         description: Mascota no encontrada
 *       400:
 *         description: ID inválido
 *       500:
 *         description: Error en servidor
 */
router.get('/:id', previsualizarMascota);

/**
 * @swagger
 * /api/pets/{id}/estado:
 *   patch:
 *     summary: Cambiar el estado de adopción de una mascota (Solo Albergues)
 *     tags: [Pets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: UUID de la mascota
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - estado
 *             properties:
 *               estado:
 *                 type: string
 *                 enum: [disponible, en_proceso, adoptado, oculto, inactivo, archivado]
 *                 description: Nuevo estado de la mascota
 *               motivo:
 *                 type: string
 *                 description: Motivo del cambio (obligatorio para oculto, inactivo, archivado)
 *     responses:
 *       200:
 *         description: Estado actualizado correctamente
 *       400:
 *         description: Transición no permitida o motivo faltante
 *       401:
 *         description: No autenticado
 *       403:
 *         description: No autorizado
 *       404:
 *         description: Mascota no encontrada
 *       500:
 *         description: Error en servidor
 */
router.patch('/:id/estado', authMiddleware, authorizeRole(['albergue']), validateCambioEstado, cambiarEstado);

module.exports = router;
