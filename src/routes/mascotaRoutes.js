const express = require('express');
const router = express.Router();

const {
    crearMascota,
    previsualizarMascota,
    actualizarMascotaController,
    cambiarEstado,
    feed,
    match,
    misMascotas
} = require('../controllers/mascotaController');
const {
    validateCreateMascota,
    validateUUIDParam,
    validateUpdateMascota,
    validateCambioEstado,
    validateFeedQuery
} = require('../middlewares/mascotaValidation');
const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');

/**
 * @swagger
 * tags:
 *   name: Mascotas
 *   description: Endpoints para gestión de publicaciones de mascotas
 */

/**
 * @swagger
 * /api/mascotas:
 *   post:
 *     summary: Publicar una nueva mascota (Solo Albergues)
 *     description: >
 *       Crea una publicación de mascota para el albergue autenticado.
 *       Requiere enviar entre 1 y 5 fotos en base64 JPG/PNG, máximo 5MB cada una.
 *       La mascota se crea con estado inicial `disponible`.
 *     tags: [Mascotas]
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
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: Luna
 *               descripcion:
 *                 type: string
 *                 example: Perrita sociable, tranquila y vacunada.
 *               fotos:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 5
 *                 description: Fotos en formato data URI base64 JPG o PNG.
 *                 items:
 *                   type: string
 *                   example: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=
 *               tagsIds:
 *                 type: array
 *                 description: UUIDs de opciones de tags existentes.
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 example:
 *                   - 4f8b74cb-d3c4-4391-8e7a-0311078ca9a2
 *                   - 6225d818-ac3b-4e4b-9399-c44fd080c19a
 *     responses:
 *       201:
 *         description: Mascota publicada exitosamente
 *       400:
 *         description: Error de validación en nombre, fotos o tagsIds
 *       401:
 *         description: Token requerido o inválido
 *       403:
 *         description: El usuario autenticado no tiene rol albergue
 *       500:
 *         description: Error interno al publicar la mascota
 */
router.post('/', authMiddleware, authorizeRole(['albergue']), validateCreateMascota, crearMascota);

/**
 * @swagger
 * /api/mascotas/{id}:
 *   get:
 *     summary: Obtener vista previa de una mascota
 *     description: Retorna el detalle público de una mascota, incluyendo fotos, tags y datos del albergue.
 *     tags: [Mascotas]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la mascota.
 *     responses:
 *       200:
 *         description: Mascota encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_mascota:
 *                       type: string
 *                       format: uuid
 *                     nombre:
 *                       type: string
 *                       example: Luna
 *                     descripcion:
 *                       type: string
 *                       example: Perrita sociable, tranquila y vacunada.
 *                     estado_adopcion:
 *                       type: string
 *                       example: disponible
 *                     fecha_publicacion:
 *                       type: string
 *                       format: date-time
 *                     id_albergue:
 *                       type: string
 *                       format: uuid
 *                     nombre_albergue:
 *                       type: string
 *                       example: Albergue Patitas
 *                     fotos:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id_foto:
 *                             type: string
 *                             format: uuid
 *                           url_foto:
 *                             type: string
 *                             example: https://res.cloudinary.com/demo/image/upload/mascota.jpg
 *                           orden:
 *                             type: integer
 *                             example: 0
 *                     tags:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id_opcion:
 *                             type: string
 *                             format: uuid
 *                           valor:
 *                             type: string
 *                             example: Perro
 *                           nombre_tag:
 *                             type: string
 *                             example: Tipo de animal
 *                           categoria:
 *                             type: string
 *                             example: Mascota
 *       404:
 *         description: Mascota no encontrada o eliminada
 *       500:
 *         description: Error interno al obtener la mascota
 */
/**
 * @swagger
 * /api/mascotas/feed:
 *   get:
 *     summary: Feed de exploración de mascotas disponibles
 *     tags: [Mascotas]
 *     responses:
 *       200:
 *         description: Feed de mascotas
 */
router.get('/feed', validateFeedQuery, feed);

/**
 * @swagger
 * /api/mascotas/match:
 *   get:
 *     summary: Matching de compatibilidad
 *     tags: [Mascotas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista ordenada por compatibilidad
 */
router.get('/match', authMiddleware, authorizeRole(['adoptante']), match);

/**
 * @swagger
 * /api/mascotas/mis-mascotas:
 *   get:
 *     summary: Listar mascotas del albergue
 *     tags: [Mascotas]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de mascotas
 */
router.get('/mis-mascotas', authMiddleware, authorizeRole(['albergue']), validateFeedQuery, misMascotas);

router.get('/:id', previsualizarMascota);

/**
 * @swagger
 * /api/mascotas/{id}:
 *   put:
 *     summary: Actualizar una mascota (Solo Albergues)
 *     description: >
 *       Actualiza datos, fotos y tags de una mascota del albergue autenticado.
 *       Usa bloqueo optimista con `updated_at`; primero consulta la mascota y envía
 *       el mismo valor recibido. No permite editar mascotas en estado `adoptado`.
 *     tags: [Mascotas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la mascota.
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
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: Luna Actualizada
 *               descripcion:
 *                 type: string
 *                 minLength: 10
 *                 example: Perrita sociable, tranquila, vacunada y esterilizada.
 *               estado_adopcion:
 *                 type: string
 *                 enum: [disponible, en_proceso, adoptado, pausado]
 *                 example: disponible
 *               updated_at:
 *                 type: string
 *                 format: date-time
 *                 description: >
 *                   Valor actual de updated_at en formato ISO 8601. Si en PostgreSQL aparece
 *                   como `2026-04-29 10:22:25.996936-05`, envíalo como
 *                   `2026-04-29T10:22:25.996-05:00` o su equivalente UTC
 *                   `2026-04-29T15:22:25.996Z`.
 *                 example: 2026-04-29T10:22:25.996-05:00
 *               fotos:
 *                 type: array
 *                 description: Fotos existentes para reordenar o fotos nuevas en base64 para agregar.
 *                 items:
 *                   type: object
 *                   properties:
 *                     id_foto:
 *                       type: string
 *                       format: uuid
 *                       description: ID de foto existente.
 *                     base64:
 *                       type: string
 *                       description: Foto nueva en data URI base64 JPG/PNG, máximo 5MB.
 *                     orden:
 *                       type: integer
 *                       example: 0
 *                 example:
 *                   - id_foto: 11111111-1111-1111-1111-111111111111
 *                     orden: 0
 *                   - base64: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=
 *                     orden: 1
 *               fotos_eliminadas:
 *                 type: array
 *                 description: IDs de fotos a eliminar. La mascota debe conservar mínimo una foto.
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 example: []
 *               tagsIds:
 *                 type: array
 *                 description: Reemplaza los tags actuales por estas opciones.
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 example:
 *                   - 4f8b74cb-d3c4-4391-8e7a-0311078ca9a2
 *                   - 6225d818-ac3b-4e4b-9399-c44fd080c19a
 *     responses:
 *       200:
 *         description: Mascota actualizada exitosamente
 *       400:
 *         description: Error de validación, estado inválido o mascota adoptada
 *       401:
 *         description: Token requerido o inválido
 *       403:
 *         description: La mascota no pertenece al albergue autenticado
 *       404:
 *         description: Mascota no encontrada
 *       409:
 *         description: Conflicto de concurrencia por updated_at desactualizado
 *       500:
 *         description: Error interno al actualizar la mascota
 */
router.put('/:id', authMiddleware, authorizeRole(['albergue']), validateUUIDParam, validateUpdateMascota, actualizarMascotaController);

/**
 * @swagger
 * /api/mascotas/{id}/estado:
 *   patch:
 *     summary: Cambiar el estado de adopción de una mascota
 *     description: >
 *       Cambia el estado de una mascota del albergue autenticado. Para cambios a
 *       `oculto`, `inactivo` o `archivado`, el campo `motivo` es obligatorio.
 *     tags: [Mascotas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la mascota.
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
 *                 enum: [disponible, en_proceso, adoptado, oculto, inactivo, archivado, pausado]
 *                 example: en_proceso
 *               motivo:
 *                 type: string
 *                 description: Obligatorio para oculto, inactivo o archivado.
 *                 example: Publicación pausada por revisión del albergue.
 *     responses:
 *       200:
 *         description: Estado actualizado correctamente
 *       400:
 *         description: Estado inválido, motivo faltante o transición no permitida
 *       401:
 *         description: Token requerido o inválido
 *       403:
 *         description: El usuario autenticado no tiene rol albergue
 *       404:
 *         description: Mascota no encontrada o no pertenece al albergue
 *       500:
 *         description: Error interno al cambiar el estado
 */
router.patch('/:id/estado', authMiddleware, authorizeRole(['albergue']), validateUUIDParam, validateCambioEstado, cambiarEstado);

module.exports = router;
