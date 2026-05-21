/**
 * adminMascotaRoutes.js — HU-ADM-03
 *
 * Rutas de administración de mascotas: historial de moderación.
 * Requiere rol 'administrador'.
 */

const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');
const {
    getHistorialModeracion,
    cambiarEstadoAdmin,
    listarMascotasAdmin,
    getMascotaDetalle,
} = require('../controllers/adminMascotaController');

router.get(
    '/admin/mascotas/:id/historial-moderacion',
    authMiddleware,
    authorizeRole(['administrador']),
    getHistorialModeracion
);

router.get(
    '/admin/mascotas',
    authMiddleware,
    authorizeRole(['administrador']),
    listarMascotasAdmin
);

router.patch(
    '/admin/mascotas/:id/estado',
    authMiddleware,
    authorizeRole(['administrador']),
    cambiarEstadoAdmin
);

router.get(
    '/admin/mascotas/:id',
    authMiddleware,
    authorizeRole(['administrador']),
    getMascotaDetalle
);

module.exports = router;