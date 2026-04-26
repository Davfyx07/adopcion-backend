const express = require('express');
const router = express.Router();

const {
    crearMascota,
    previsualizarMascota,
    actualizarMascotaController,
    cambiarEstado
} = require('../controllers/mascotaController');
const {
    validateCreateMascota,
    validateUUIDParam,
    validateUpdateMascota,
    validateCambioEstado
} = require('../middlewares/mascotaValidation');
const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');

/**
 * @swagger
 * tags:
 *   name: Pets
 *   description: Endpoints para gestión de publicaciones de mascotas
 */

/**
 * @swagger
 * /api/pets:
 *   post:
 *     summary: Publicar una nueva mascota (Solo Albergues)
 *     tags: [Pets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Mascota publicada exitosamente
 */
router.post('/', authMiddleware, authorizeRole(['albergue']), validateCreateMascota, crearMascota);

/**
 * @swagger
 * /api/pets/{id}:
 *   get:
 *     summary: Obtener detalle de mascota
 *     tags: [Pets]
 */
/**
 * @swagger
 * /api/mascotas/{id}:
 *   get:
 *     summary: Obtener detalle de mascota
 *     tags: [Pets]
 */
router.get('/:id', previsualizarMascota);

/**
 * @swagger
 * /api/pets/{id}:
 *   put:
 *     summary: Editar detalle de mascota (HU-MA-02)
 *     tags: [Pets]
 */
/**
 * @swagger
 * /api/mascotas/{id}:
 *   put:
 *     summary: Editar detalle de mascota (HU-MA-02)
 *     tags: [Pets]
 */
router.put('/:id', authMiddleware, authorizeRole(['albergue']), validateUUIDParam, validateUpdateMascota, actualizarMascotaController);

/**
 * @swagger
 * /api/pets/{id}/estado:
 *   patch:
 *     summary: Cambiar el estado de adopción de una mascota
 *     tags: [Pets]
 */
/**
 * @swagger
 * /api/mascotas/{id}/estado:
 *   patch:
 *     summary: Cambiar el estado de adopción de una mascota
 *     tags: [Pets]
 */
router.patch('/:id/estado', authMiddleware, authorizeRole(['albergue']), validateUUIDParam, validateCambioEstado, cambiarEstado);

module.exports = router;
