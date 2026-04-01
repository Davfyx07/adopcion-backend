const express = require('express');
const rateLimit = require('express-rate-limit');
const { register, login, forgotPassword, resetPassword, logout } = require('../controllers/authController');
const {
    validateRegister,
    validateLogin,
    validateForgotPassword,
    validateResetPassword
} = require('../middlewares/validate');
const authMiddleware = require('../middlewares/authMiddleware');
const router = express.Router();
const recoveryRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Demasiados intentos. Intenta en 15 min.' }
});
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registro de un nuevo usuario
 *     description: Permite que un usuario nuevo cree su cuenta seleccionando rol (adoptante o albergue), validando correo, contraseña y aceptación de términos.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - confirmPassword
 *               - role
 *               - termsAccepted
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *               role:
 *                 type: string
 *                 enum: [adoptante, albergue]
 *               termsAccepted:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Cuenta creada exitosamente.
 *       400:
 *         description: Error de validación en los campos enviados.
 *       409:
 *         description: El correo ya se encuentra registrado.
 *       500:
 *         description: Error interno del servidor.
 */
router.post('/register', validateRegister, register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Inicio de sesión de usuario
 *     description: Permite a un usuario autenticarse empleando su correo electrónico y contraseña. Retorna un JWT válido por 24 horas y audita el acceso. Tras 5 intentos fallidos, la cuenta se bloquea por 15 minutos.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Inicio de sesión exitoso. Se devuelve el Token JWT.
 *       400:
 *         description: Error de validación (correo o contraseña en blanco/formato incorrecto).
 *       401:
 *         description: Correo o contraseña incorrectos.
 *       403:
 *         description: Demasiados intentos fallidos. Cuenta bloqueada temporalmente.
 *       500:
 *         description: Error interno del servidor.
 */
router.post('/login', validateLogin, login);



/**
 * @swagger
 * /api/auth/forgot-password:
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
router.post('/forgot-password', recoveryRateLimit, validateForgotPassword, forgotPassword);

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
router.post('/reset-password', validateResetPassword, resetPassword);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Cerrar sesión
 *     description: Invalida el token JWT evitando su reutilización.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout exitoso
 *       401:
 *         description: Token inválido
 */
router.post('/logout', authMiddleware, logout);
module.exports = router;
