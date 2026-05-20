/**
 * adminConfigController.js — HU-ADM-CONFIG
 *
 * Controlador delgado: extrae parámetros y delega al servicio.
 * Sigue el patrón de adminUserController.js.
 */

const adminConfigService = require('../services/adminConfigService');

/**
 * GET /api/admin/configuracion
 * Retorna toda la configuración agrupada por grupo.
 */
const getConfiguracion = async (req, res) => {
    try {
        const data = await adminConfigService.getConfiguracion();
        res.json({ success: true, data });
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ success: false, message: err.message || 'Error interno' });
    }
};

/**
 * GET /api/admin/configuracion/:grupo
 * Retorna la configuración de un grupo específico.
 */
const getConfiguracionGrupo = async (req, res) => {
    try {
        const { grupo } = req.params;
        const data = await adminConfigService.getConfiguracionGrupo(grupo);
        res.json({ success: true, data });
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ success: false, message: err.message || 'Error interno' });
    }
};

/**
 * PUT /api/admin/configuracion/:grupo
 * Body: { shortKey: valor, ... }
 * Actualiza todos los valores del grupo (upsert).
 */
const updateConfiguracionGrupo = async (req, res) => {
    try {
        const { grupo } = req.params;
        const values = req.body;

        if (!values || typeof values !== 'object' || Array.isArray(values)) {
            return res.status(400).json({ success: false, message: 'El cuerpo debe ser un objeto con pares clave/valor' });
        }

        const data = await adminConfigService.updateConfiguracionGrupo(grupo, values);
        res.json({ success: true, data });
    } catch (err) {
        const status = err.status || 500;
        res.status(status).json({ success: false, message: err.message || 'Error interno' });
    }
};

module.exports = {
    getConfiguracion,
    getConfiguracionGrupo,
    updateConfiguracionGrupo,
};
