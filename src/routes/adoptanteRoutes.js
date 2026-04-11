const express = require('express');
const { crearPerfil, getPerfil, updatePerfil, updateEtiquetas } = require('../controllers/adoptanteController');
const { validatePerfilAdoptante, validateUpdatePerfil, validateUpdateTags } = require('../middlewares/adoptanteValidation');
const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');

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
 *     summary: Crear perfil de adoptante (HU-US-01)
 *     description: >
 *       Crea el perfil completo del usuario adoptante autenticado.
 *       Solo puede ser ejecutado una vez por usuario con rol adoptante.
 *       Requiere seleccionar opciones de las categorías obligatorias del catálogo de tags.
 *       La foto de perfil debe enviarse como base64 (JPG o PNG, máximo 5MB).
 *       Al completarse, el estado de la cuenta cambia a 'activo'.
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
 *               - nombre_completo
 *               - whatsapp
 *               - ciudad
 *             properties:
 *               nombre_completo:
 *                 type: string
 *                 example: "Carlos Mendoza"
 *                 description: Nombre completo del adoptante (3-150 caracteres)
 *               whatsapp:
 *                 type: string
 *                 example: "3001234567"
 *                 description: Número de WhatsApp colombiano (ej. 3001234567 o +573001234567)
 *               ciudad:
 *                 type: string
 *                 example: "Neiva"
 *                 description: Ciudad de residencia (entre 2 y 100 caracteres)
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 example: ["4f8b74cb-d3c4-4391-8e7a-0311078ca9a2", "c782f31c-1d2a-4332-9b09-49bf26af7e4c"]
 *                 description: UUIDs de opciones de tags seleccionadas del catálogo
 *               foto:
 *                 type: string
 *                 example: "data:image/jpeg;base64,/9j/4AAQ..."
 *                 description: Foto de perfil en base64 (JPG o PNG, máx 5MB). Opcional.
 *     responses:
 *       201:
 *         description: Perfil creado exitosamente. Cuenta activada.
 *       400:
 *         description: Error de validación (campos inválidos o tags obligatorios faltantes)
 *       401:
 *         description: Token inválido o no proporcionado
 *       403:
 *         description: El usuario no tiene rol adoptante
 *       409:
 *         description: El usuario ya tiene un perfil creado
 *       500:
 *         description: Error interno del servidor
 */
router.post('/perfil', authMiddleware, authorizeRole(['adoptante']), validatePerfilAdoptante, crearPerfil);

/**
 * @swagger
 * /api/adoptante/perfil:
 *   get:
 *     summary: Obtener perfil de adoptante (HU-US-02)
 *     description: Retorna los datos completos y etiquetas del adoptante autenticado.
 *     tags: [Adoptante]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   id_usuario: "123e4567-e89b-12d3-a456-426614174000"
 *                   nombre_completo: "Carlos Mendoza"
 *                   whatsapp: "3001234567"
 *                   ciudad: "Bogotá"
 *                   foto_url: "https://res.cloudinary.com/..."
 *                   etiquetas:
 *                     - id_opcion: "4f8b74cb-d3c4-4391-8e7a-0311078ca9a2"
 *                       valor: "Gato"
 *                       categoria: "Tipo de animal"
 *       404:
 *         description: Perfil no encontrado
 *       401:
 *         description: Token inválido o no proporcionado
 *       403:
 *         description: El usuario no tiene rol adoptante
 */
router.get('/perfil', authMiddleware, authorizeRole(['adoptante']), getPerfil);

/**
 * @swagger
 * /api/adoptante/perfil:
 *   put:
 *     summary: Actualizar datos básicos del perfil (HU-US-02)
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
 *               - nombre_completo
 *               - whatsapp
 *               - ciudad
 *             properties:
 *               nombre_completo:
 *                 type: string
 *                 example: "Juan Pérez"
 *               whatsapp:
 *                 type: string
 *                 example: "3009876543"
 *               ciudad:
 *                 type: string
 *                 example: "Medellín"
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
 *       403:
 *         description: El usuario no tiene rol adoptante
 */
router.put('/perfil', authMiddleware, authorizeRole(['adoptante']), validateUpdatePerfil, updatePerfil);

/**
 * @swagger
 * /api/adoptante/etiquetas:
 *   put:
 *     summary: Actualizar etiquetas (preferencias) del adoptante (HU-US-02)
 *     description: Reemplaza las etiquetas del adoptante actual. Debe incluir al menos una opción de cada categoría obligatoria.
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
 *                   type: string
 *                   format: uuid
 *                 example: ["uuid-opcion-1", "uuid-opcion-3", "uuid-opcion-5"]
 *     responses:
 *       200:
 *         description: Etiquetas actualizadas exitosamente
 *       400:
 *         description: Error de validación (ej. faltan categorías obligatorias)
 *       404:
 *         description: Perfil no encontrado
 *       401:
 *         description: No autorizado
 *       403:
 *         description: El usuario no tiene rol adoptante
 */
router.put('/etiquetas', authMiddleware, authorizeRole(['adoptante']), validateUpdateTags, updateEtiquetas);

module.exports = router;
