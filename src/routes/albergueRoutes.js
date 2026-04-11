const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');
const { upload } = require('../config/uploadConfig');
const { validateAlbergueProfile } = require('../middlewares/albergueValidate');
const { createProfile } = require('../controllers/albergueController');

const router = express.Router();

/**
 * @swagger
 * /api/albergue/profile:
 *   post:
 *     summary: Crear perfil institucional del albergue (HU-AL-01)
 *     description: >
 *       Permite a un usuario con rol "albergue" y estado "perfil_incompleto"
 *       completar su perfil institucional. Al completar exitosamente,
 *       el estado de la cuenta cambia a "activo" y se habilita el panel de gestión.
 *       El logo debe enviarse como archivo en formato multipart/form-data.
 *     tags:
 *       - Albergue
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - nombre_albergue
 *               - nit
 *               - descripcion
 *               - whatsapp
 *               - logo
 *             properties:
 *               nombre_albergue:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 150
 *                 example: Fundación Patitas Felices
 *                 description: Nombre oficial del albergue
 *               nit:
 *                 type: string
 *                 example: "900123456-7"
 *                 description: NIT del albergue (formato colombiano)
 *               descripcion:
 *                 type: string
 *                 minLength: 20
 *                 example: Somos una fundación dedicada al rescate y adopción responsable de animales en situación de calle en la ciudad de Neiva.
 *                 description: Descripción institucional del albergue
 *               whatsapp:
 *                 type: string
 *                 example: "+573001234567"
 *                 description: Número de WhatsApp institucional (canal principal de contacto con adoptantes)
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Logo institucional (JPG o PNG, máximo 5MB)
 *               sitio_web:
 *                 type: string
 *                 format: uri
 *                 example: https://www.patitasfelices.org
 *                 description: Sitio web o red social del albergue (opcional)
 *     responses:
 *       201:
 *         description: Perfil institucional creado exitosamente. Cuenta activada.
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
 *                   example: Perfil institucional creado exitosamente. Tu cuenta ha sido activada.
 *                 data:
 *                   type: object
 *                   properties:
 *                     id_usuario:
 *                       type: string
 *                       format: uuid
 *                     nombre_albergue:
 *                       type: string
 *                     nit:
 *                       type: string
 *                     descripcion:
 *                       type: string
 *                     whatsapp:
 *                       type: string
 *                     logo_url:
 *                       type: string
 *                     sitio_web:
 *                       type: string
 *                       nullable: true
 *                     estado_cuenta:
 *                       type: string
 *                       example: activo
 *       400:
 *         description: Error de validación en los campos enviados.
 *       401:
 *         description: Token JWT ausente, inválido o expirado.
 *       403:
 *         description: El usuario no tiene rol de albergue.
 *       409:
 *         description: NIT ya registrado o perfil ya creado.
 *       500:
 *         description: Error interno del servidor.
 */
router.post(
    '/profile',
    authMiddleware,
    authorizeRole(['albergue']),
    (req, res, next) => {
        // Wrapper para capturar errores de multer (tamaño, formato)
        upload.single('logo')(req, res, (err) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        success: false,
                        errors: [{
                            field: 'logo',
                            message: 'El archivo excede el tamaño máximo permitido de 5MB.',
                        }],
                    });
                }
                return res.status(400).json({
                    success: false,
                    errors: [{
                        field: 'logo',
                        message: err.message || 'Error al procesar el archivo.',
                    }],
                });
            }
            next();
        });
    },
    validateAlbergueProfile,
    createProfile
);

module.exports = router;
