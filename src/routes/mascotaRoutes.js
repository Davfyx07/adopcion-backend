const express = require('express');
const router = express.Router();

const { crearMascota, previsualizarMascota } = require('../controllers/mascotaController');
const { validateCreateMascota } = require('../middlewares/mascotaValidation');
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

module.exports = router;
