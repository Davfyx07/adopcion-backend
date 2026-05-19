/**
 * adminUserRoutes.js — HU-ADM-01
 *
 * Rutas de administración de usuarios.
 * Requiere rol 'admin' (ver tagRoutes.js — develop usa 'admin', fix-auth-flow usa 'administrador').
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
    authorizeRole(['admin', 'administrador']),
    getUsuarios
);

router.patch(
    '/admin/usuarios/:id/estado',
    authMiddleware,
    authorizeRole(['admin', 'administrador']),
    cambiarEstado
);

router.delete(
    '/admin/usuarios/:id',
    authMiddleware,
    authorizeRole(['admin', 'administrador']),
    eliminarUsuario
);

module.exports = router;
