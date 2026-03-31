const express = require('express');
const { register, login } = require('../controllers/authController');
const { validateRegister, validateLogin } = require('../middlewares/validate');

const router = express.Router();

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

module.exports = router;
