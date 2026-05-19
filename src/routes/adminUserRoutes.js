/**
 * adminUserRoutes.js — HU-ADM-01
 *
 * Rutas de administración de usuarios.
 * Requiere rol 'administrador' (valor real del JWT generado por el backend).
 */

const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');

const {
    getUsuarios,
    cambiarEstado,
    eliminarUsuario,
} = require('../controllers/adminUserController');

router.get(
    '/admin/usuarios',
    authMiddleware,
    authorizeRole(['administrador']),
    getUsuarios
);

router.patch(
    '/admin/usuarios/:id/estado',
    authMiddleware,
    authorizeRole(['administrador']),
    cambiarEstado
);

router.delete(
    '/admin/usuarios/:id',
    authMiddleware,
    authorizeRole(['administrador']),
    eliminarUsuario
);

module.exports = router;

