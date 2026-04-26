const express = require('express');
const router = express.Router();

const { crearMascota, previsualizarMascota, actualizarMascotaController } = require('../controllers/mascotaController');
const { validateCreateMascota, validateUUIDParam, validateUpdateMascota } = require('../middlewares/mascotaValidation');
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
/**
 * @swagger
 * /api/mascotas/{id}:
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
 * /api/pets/{id}:
 *   put:
 *     summary: Editar detalle de una mascota (HU-MA-02)
 *     description: >
 *       Permite al albergue dueño actualizar los datos, etiquetas y fotos de una mascota.
 *       - Valida que la mascota no esté 'adoptada'.
 *       - Requiere el campo `updated_at` para Bloqueo Optimista de concurrencia.
 *       - Para fotos: Se pueden reordenar fotos existentes, eliminar y subir nuevas (vía base64).
 *       - Debe quedar siempre un mínimo de 1 foto.
 *     tags: [Pets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID de la mascota a editar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updated_at
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: Firulais
 *               descripcion:
 *                 type: string
 *                 example: Es un perrito muy juguetón y lleno de amor.
 *               estado_adopcion:
 *                 type: string
 *                 enum: [disponible, en_proceso, adoptado, pausado]
 *                 example: disponible
 *               updated_at:
 *                 type: string
 *                 format: date-time
 *                 description: Fecha y hora de la última modificación (para evitar sobreescritura paralela)
 *                 example: 2026-04-20T10:30:00Z
 *               fotos:
 *                 type: array
 *                 description: Array mixto con fotos existentes (solo id_foto) para reordenar y fotos nuevas (base64)
 *                 items:
 *                   type: object
 *                   properties:
 *                     id_foto:
 *                       type: string
 *                       format: uuid
 *                     base64:
 *                       type: string
 *                     orden:
 *                       type: integer
 *                 example:
 *                   - id_foto: "uuid-foto-1"
 *                     orden: 1
 *                   - base64: "data:image/jpeg;base64,/9j/4..."
 *                     orden: 0
 *               fotos_eliminadas:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: IDs de fotos que se van a eliminar de la mascota (y de Cloudinary)
 *                 example: ["uuid-foto-3"]
 *               tagsIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Nuevo set de opciones de tags
 *                 example: ["uuid-opcion-1", "uuid-opcion-2"]
 *     responses:
 *       200:
 *         description: Mascota actualizada exitosamente.
 *       400:
 *         description: Error de validación (estado adoptado, faltan fotos, etc).
 *       403:
 *         description: El albergue no es el dueño de la mascota.
 *       404:
 *         description: Mascota no encontrada.
 *       409:
 *         description: Conflicto de concurrencia optimista (updated_at no coincide).
 */
/**
 * @swagger
 * /api/mascotas/{id}:
 *   put:
 *     summary: Editar detalle de una mascota (HU-MA-02)
 *     description: >
 *       Permite al albergue dueño actualizar los datos, etiquetas y fotos de una mascota.
 *       - Valida que la mascota no esté 'adoptada'.
 *       - Requiere el campo `updated_at` para Bloqueo Optimista de concurrencia.
 *       - Para fotos: Se pueden reordenar fotos existentes, eliminar y subir nuevas (vía base64).
 *       - Debe quedar siempre un mínimo de 1 foto.
 *     tags: [Pets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID de la mascota a editar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updated_at
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: Firulais
 *               descripcion:
 *                 type: string
 *                 example: Es un perrito muy juguetón y lleno de amor.
 *               estado_adopcion:
 *                 type: string
 *                 enum: [disponible, en_proceso, adoptado, pausado]
 *                 example: disponible
 *               updated_at:
 *                 type: string
 *                 format: date-time
 *                 description: Fecha y hora de la última modificación (para evitar sobreescritura paralela)
 *                 example: 2026-04-20T10:30:00Z
 *               fotos:
 *                 type: array
 *                 description: Array mixto con fotos existentes (solo id_foto) para reordenar y fotos nuevas (base64)
 *                 items:
 *                   type: object
 *                   properties:
 *                     id_foto:
 *                       type: string
 *                       format: uuid
 *                     base64:
 *                       type: string
 *                     orden:
 *                       type: integer
 *                 example:
 *                   - id_foto: "uuid-foto-1"
 *                     orden: 1
 *                   - base64: "data:image/jpeg;base64,/9j/4..."
 *                     orden: 0
 *               fotos_eliminadas:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: IDs de fotos que se van a eliminar de la mascota (y de Cloudinary)
 *                 example: ["uuid-foto-3"]
 *               tagsIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Nuevo set de opciones de tags
 *                 example: ["uuid-opcion-1", "uuid-opcion-2"]
 *     responses:
 *       200:
 *         description: Mascota actualizada exitosamente.
 *       400:
 *         description: Error de validación (estado adoptado, faltan fotos, etc).
 *       403:
 *         description: El albergue no es el dueño de la mascota.
 *       404:
 *         description: Mascota no encontrada.
 *       409:
 *         description: Conflicto de concurrencia optimista (updated_at no coincide).
 */
router.put('/:id', authMiddleware, authorizeRole(['albergue']), validateUUIDParam, validateUpdateMascota, actualizarMascotaController);

module.exports = router;
