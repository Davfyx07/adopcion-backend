/**
 * adminConfigRoutes.js — HU-ADM-CONFIG
 *
 * Rutas de configuración del sistema.
 * Requiere rol 'administrador'.
 *
 * GET  /api/admin/configuracion         — toda la config agrupada
 * GET  /api/admin/configuracion/:grupo  — config de un grupo
 * PUT  /api/admin/configuracion/:grupo  — actualiza un grupo (upsert)
 */

/**
 * @swagger
 * tags:
 *   name: Admin - Configuración
 *   description: Gestión de configuración del sistema
 *
 * /api/admin/configuracion:
 *   get:
 *     summary: Retorna toda la configuración del sistema agrupada por grupo
 *     tags: [Admin - Configuración]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuración agrupada
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Sin permisos
 *
 * /api/admin/configuracion/{grupo}:
 *   get:
 *     summary: Retorna la configuración de un grupo específico
 *     tags: [Admin - Configuración]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: grupo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Configuración del grupo
 *   put:
 *     summary: Actualiza los valores de un grupo (upsert)
 *     tags: [Admin - Configuración]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: grupo
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties:
 *               type: string
 *     responses:
 *       200:
 *         description: Configuración actualizada
 *       400:
 *         description: Body inválido
 */

const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');
const {
    getConfiguracion,
    getConfiguracionGrupo,
    updateConfiguracionGrupo,
} = require('../controllers/adminConfigController');

router.get(
    '/admin/configuracion',
    authMiddleware,
    authorizeRole(['administrador']),
    getConfiguracion
);

router.get(
    '/admin/configuracion/:grupo',
    authMiddleware,
    authorizeRole(['administrador']),
    getConfiguracionGrupo
);

router.put(
    '/admin/configuracion/:grupo',
    authMiddleware,
    authorizeRole(['administrador']),
    updateConfiguracionGrupo
);

module.exports = router;
