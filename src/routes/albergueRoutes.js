const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const { validateUpdatePerfil } = require('../middlewares/albergueValidation');

const {
    getPerfil,
    updatePerfil
} = require('../controllers/albergueController');

/**
 * @swagger
 * /api/albergue/perfil:
 *   get:
 *     summary: Obtener perfil del albergue autenticado
 *     tags: [Albergue]
 *     security:
 *       - bearerAuth: []
 */
router.get('/perfil', authMiddleware, getPerfil);

/**
 * @swagger
 * /api/albergue/perfil:
 *   put:
 *     summary: Editar perfil del albergue
 *     tags: [Albergue]
 *     security:
 *       - bearerAuth: []
 */
router.put('/perfil', authMiddleware, validateUpdatePerfil, updatePerfil);

module.exports = router;