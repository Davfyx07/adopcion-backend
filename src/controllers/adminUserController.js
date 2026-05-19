/**
 * adminUserController.js — HU-ADM-01
 *
 * Controlador delgado: extrae parámetros y delega al servicio.
 * Sigue el patrón de tagController.js.
 */

const adminUserService = require('../services/adminUserService');

/**
 * GET /api/admin/usuarios
 * Query params: rol (id_rol), estado
 */
const getUsuarios = async (req, res) => {
    try {
        const { rol, estado } = req.query;
        const data = await adminUserService.getUsuarios({ rol, estado });
        res.json({ success: true, data });
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ success: false, message: err.message || 'Error interno' });
    }
};

/**
 * PATCH /api/admin/usuarios/:id/estado
 * Body: { estado, motivo? }
 */
const cambiarEstado = async (req, res) => {
    try {
        const adminId = req.user.id;
        const userId = req.params.id;
        const { estado, motivo } = req.body;

        if (!estado) {
            return res.status(400).json({ success: false, message: 'El campo estado es requerido' });
        }

        const data = await adminUserService.cambiarEstado(adminId, userId, { estado, motivo });
        res.json({ success: true, data });
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ success: false, message: err.message || 'Error interno' });
    }
};

/**
 * DELETE /api/admin/usuarios/:id
 */
const eliminarUsuario = async (req, res) => {
    try {
        const adminId = req.user.id;
        const userId = req.params.id;

        await adminUserService.eliminarUsuario(adminId, userId);
        res.json({ success: true });
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ success: false, message: err.message || 'Error interno' });
    }
};

module.exports = {
    getUsuarios,
    cambiarEstado,
    eliminarUsuario,
};
