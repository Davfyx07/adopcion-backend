const express = require('express');
const { crearPerfil, getPerfil, updatePerfil, updateEtiquetas } = require('../controllers/adoptanteController');
const { validatePerfilAdoptante, validateUpdatePerfil, validateUpdateTags } = require('../middlewares/adoptanteValidation');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Adoptante
 *   description: Gestión del perfil de adoptante
 */

/**
 * @swagger
 * /api/adoptante/perfil:
 *   post:
 *     summary: Crear perfil de adoptante
 *     description: >
 *       Crea el perfil completo del usuario adoptante autenticado.
 *       Solo puede ser ejecutado una vez por usuario.
 *       Requiere seleccionar todas las etiquetas obligatorias del catálogo.
 *       La foto de perfil debe enviarse como base64 (JPG o PNG, máximo 5MB).
 *       Al completarse, el estado de la cuenta cambia a 'completo'.
 *     tags: [Adoptante]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - telefono
 *               - ciudad
 *               - direccion
 *               - tags
 *             properties:
 *               telefono:
 *                 type: string
 *                 example: "3001234567"
 *                 description: Número de teléfono colombiano (ej. 3001234567 o +573001234567)
 *               ciudad:
 *                 type: string
 *                 example: "Bogotá"
 *                 description: Ciudad de residencia (entre 2 y 100 caracteres)
 *               direccion:
 *                 type: string
 *                 example: "Calle 123 # 45-67"
 *                 description: Dirección de residencia (entre 5 y 255 caracteres)
 *               tags:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 3, 5]
 *                 description: IDs de etiquetas seleccionadas del catálogo
 *               foto:
 *                 type: string
 *                 example: "data:image/jpeg;base64,/9j/4AAQ..."
 *                 description: Foto de perfil en base64 (JPG o PNG, máx 5MB). Opcional.
 *     responses:
 *       201:
 *         description: Perfil creado exitosamente
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
 *                   example: "Perfil de adoptante creado exitosamente."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_perfil:
 *                       type: integer
 *                     telefono:
 *                       type: string
 *                     ciudad:
 *                       type: string
 *                     direccion:
 *                       type: string
 *                     foto_url:
 *                       type: string
 *                       nullable: true
 *                     tags:
 *                       type: array
 *                       items:
 *                         type: integer
 *       400:
 *         description: Error de validación (campos inválidos, tags obligatorios faltantes o imagen inválida)
 *       401:
 *         description: Token inválido o no proporcionado
 *       403:
 *         description: El usuario no tiene rol adoptante
 *       409:
 *         description: El usuario ya tiene un perfil creado
 *       500:
 *         description: Error interno del servidor
 */
router.post('/perfil', authMiddleware, validatePerfilAdoptante, crearPerfil);

/**
 * @swagger
 * /api/adoptante/perfil:
 *   get:
 *     summary: Obtener perfil de adoptante
 *     description: Retorna los datos básicos y etiquetas del adoptante autenticado.
 *     tags: [Adoptante]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil obtenido exitosamente
 *       404:
 *         description: Perfil no encontrado
 *       401:
 *         description: Token inválido o no proporcionado
 */
router.get('/perfil', authMiddleware, getPerfil);

/**
 * @swagger
 * /api/adoptante/perfil:
 *   put:
 *     summary: Actualizar datos básicos del perfil
 *     description: Actualiza la información de contacto y foto del adoptante, excluyendo las etiquetas.
 *     tags: [Adoptante]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - telefono
 *               - ciudad
 *               - direccion
 *             properties:
 *               telefono:
 *                 type: string
 *                 example: "3001234567"
 *               ciudad:
 *                 type: string
 *                 example: "Medellín"
 *               direccion:
 *                 type: string
 *                 example: "Carrera 45 # 12-34"
 *               foto:
 *                 type: string
 *                 description: Foto en base64. Opcional.
 *     responses:
 *       200:
 *         description: Perfil actualizado exitosamente
 *       400:
 *         description: Error de validación
 *       404:
 *         description: Perfil no encontrado
 *       401:
 *         description: No autorizado
 */
router.put('/perfil', authMiddleware, validateUpdatePerfil, updatePerfil);

/**
 * @swagger
 * /api/adoptante/etiquetas:
 *   put:
 *     summary: Actualizar etiquetas (preferencias) del adoptante
 *     description: Reemplaza las etiquetas del adoptante actual y recalcula su embedding.
 *     tags: [Adoptante]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tags
 *             properties:
 *               tags:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 4, 5]
 *     responses:
 *       200:
 *         description: Etiquetas actualizadas exitosamente
 *       400:
 *         description: Error de validación (ej. faltan obligatorias)
 *       404:
 *         description: Perfil no encontrado
 *       401:
 *         description: No autorizado
 */
router.put('/etiquetas', authMiddleware, validateUpdateTags, updateEtiquetas);

module.exports = router;
