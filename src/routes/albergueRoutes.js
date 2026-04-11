const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');
const { validateCreatePerfil, validateUpdatePerfil } = require('../middlewares/albergueValidation');

const {
    createProfile,
    getPerfil,
    updatePerfil
} = require('../controllers/albergueController');

/**
 * @swagger
 * /api/albergue/perfil:
 *   post:
 *     summary: Crear perfil institucional del albergue (HU-AL-01)
 *     description: >
 *       Permite a un usuario con rol "albergue" y estado "perfil_incompleto"
 *       completar su perfil institucional. Al completar exitosamente,
 *       el estado de la cuenta cambia a "activo".
 *     tags: [Albergue]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre_albergue
 *               - nit
 *               - descripcion
 *               - whatsapp
 *             properties:
 *               nombre_albergue:
 *                 type: string
 *                 example: Fundación Patitas Felices
 *                 description: Nombre oficial del albergue (3-150 caracteres)
 *               nit:
 *                 type: string
 *                 example: "900123456-7"
 *               descripcion:
 *                 type: string
 *                 example: Somos una fundación dedicada al rescate...
 *                 description: Mínimo 20 caracteres
 *               whatsapp:
 *                 type: string
 *                 example: "+573001234567"
 *               logo:
 *                 type: string
 *                 example: "data:image/jpeg;base64,/9j/4AAQ..."
 *                 description: Logo en formato base64 (JPG o PNG, máx 5MB). Opcional.
 *               sitio_web:
 *                 type: string
 *                 example: https://www.patitasfelices.org
 *     responses:
 *       201:
 *         description: Perfil institucional creado exitosamente. Cuenta activada.
 *       400:
 *         description: Error de validación en los campos enviados.
 *       401:
 *         description: Token JWT ausente, inválido o expirado.
 *       403:
 *         description: El usuario no tiene rol de albergue.
 *       409:
 *         description: NIT ya registrado o perfil ya creado.
 */
router.post('/perfil', authMiddleware, authorizeRole(['albergue']), validateCreatePerfil, createProfile);

/**
 * @swagger
 * /api/albergue/perfil:
 *   get:
 *     summary: Obtener perfil del albergue autenticado (HU-AL-02)
 *     description: Retorna los datos institucionales del albergue logueado.
 *     tags: [Albergue]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil retornado exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 success: true
 *                 data:
 *                   id_usuario: "6f5cd3e1-7890-a1b2-c3d4-426614174000"
 *                   nit: "900123456-7"
 *                   nombre_albergue: "Fundación Patitas Felices"
 *                   logo: "https://res.cloudinary.com/..."
 *                   descripcion: "Somos una fundación dedicada al rescate animal en Neiva y brindamos cuidado integral a los perritos."
 *                   whatsapp_actual: "3001234567"
 *                   sitio_web: "https://patitasfelices.org"
 *                   correo: "fundacion@gmail.com"
 *       404:
 *         description: Perfil no encontrado.
 */
router.get('/perfil', authMiddleware, authorizeRole(['albergue']), getPerfil);

/**
 * @swagger
 * /api/albergue/perfil:
 *   put:
 *     summary: Editar perfil del albergue (HU-AL-02)
 *     description: >
 *       Actualiza la información del albergue. 
 *       El NIT no es editable.
 *       Si cambia el WhatsApp, se guarda en el historial.
 *       Si se envía un logo nuevo, sobrescribe el anterior.
 *     tags: [Albergue]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               descripcion:
 *                 type: string
 *                 example: Nueva descripción de la fundación...
 *               whatsapp_actual:
 *                 type: string
 *                 example: "+573009999999"
 *               sitio_web:
 *                 type: string
 *                 example: https://www.nuevo-sitio.org
 *               logo:
 *                 type: string
 *                 description: Foto en base64 para reemplazar el logo actual. Opcional.
 *     responses:
 *       200:
 *         description: Perfil actualizado exitosamente.
 *       400:
 *         description: Error de validación (ej. intento de modificar NIT).
 */
router.put('/perfil', authMiddleware, authorizeRole(['albergue']), validateUpdatePerfil, updatePerfil);

module.exports = router;