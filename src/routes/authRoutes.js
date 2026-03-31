const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { register, login, forgotPassword, resetPassword } = require('../controllers/authController');
const validate = require('../middlewares/validate');

const router = Router();

// Configuración de Rate Limit para recuperación de contraseña
const recoveryRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, 
    message: {
        message: 'Demasiadas solicitudes de recuperación desde esta IP. Intente nuevamente en 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registrar un nuevo usuario
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, correo, password]
 *             properties:
 *               nombre: { type: string }
 *               correo: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               telefono: { type: string }
 *               direccion: { type: string }
 */
router.post('/register', validate, register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [correo, password]
 *             properties:
 *               correo: { type: string, format: email }
 *               password: { type: string }
 */
router.post('/login', login);

/**
 * @swagger
 * /api/auth/recuperar-password:
 *   post:
 *     summary: Solicitar recuperación de contraseña
 *     description: >
 *       Envía un correo electrónico con un enlace de recuperación de contraseña
 *       al usuario registrado con el correo proporcionado.
 *       Límite: 5 solicitudes cada 15 minutos por IP.
 *     tags:
 *       - Autenticación
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - correo
 *             properties:
 *               correo:
 *                 type: string
 *                 format: email
 *                 example: usuario@ejemplo.com
 *                 description: Correo electrónico del usuario registrado
 *     responses:
 *       200:
 *         description: Enlace de recuperación enviado exitosamente
 *       429:
 *         description: Demasiadas solicitudes (Rate Limit)
 *       500:
 *         description: Error interno del servidor
 */
router.post('/recuperar-password', recoveryRateLimit, forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Restablecer contraseña
 *     description: >
 *       Restablecer la contraseña del usuario utilizando el token de recuperación
 *       recibido por correo electrónico.
 *     tags:
 *       - Autenticación
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - nuevaPassword
 *             properties:
 *               token:
 *                 type: string
 *                 format: uuid
 *                 description: Token de recuperación recibido por correo
 *               nuevaPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: Nueva contraseña (mínimo 8 caracteres)
 *     responses:
 *       200:
 *         description: Contraseña restablecida exitosamente
 *       400:
 *         description: Token inválido o expirado
 *       500:
 *         description: Error interno del servidor
 */
router.post('/reset-password', resetPassword);

module.exports = router;
