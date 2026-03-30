const express = require('express');
const { register } = require('../controllers/authController');
const { validateRegister } = require('../middlewares/validate');

const router = express.Router();

/**
 * @swagger
 * /auth/register:
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

module.exports = router;
