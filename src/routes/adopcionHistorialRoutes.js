const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');
const {
    listarAdopcionesAlbergue,
    obtenerDetalleAdopcion,
    exportarAdopcionesCSV,
    exportarAdopcionesExcel,
} = require('../controllers/adopcionHistorialController');

/**
 * @swagger
 * tags:
 *   name: AdopcionHistorial
 *   description: Historial de adopciones del albergue (HU-HIS-02)
 */

/**
 * @swagger
 * /api/albergue/adopciones:
 *   get:
 *     summary: Listar adopciones del albergue autenticado
 *     tags: [AdopcionHistorial]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fecha_desde
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: fecha_hasta
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: estado
 *         schema: { type: string }
 *       - in: query
 *         name: busqueda
 *         schema: { type: string }
 *         description: Búsqueda por nombre de adoptante o mascota
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Lista de adopciones paginada
 */
router.get(
    '/',
    authMiddleware,
    authorizeRole(['albergue']),
    listarAdopcionesAlbergue
);

/**
 * @swagger
 * /api/albergue/adopciones/exportar:
 *   get:
 *     summary: Exportar adopciones del albergue en CSV
 *     tags: [AdopcionHistorial]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fecha_desde
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: fecha_hasta
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: estado
 *         schema: { type: string }
 *       - in: query
 *         name: busqueda
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Archivo CSV con adopciones
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get(
    '/exportar',
    authMiddleware,
    authorizeRole(['albergue']),
    exportarAdopcionesCSV
);

/**
 * @swagger
 * /api/albergue/adopciones/exportar-excel:
 *   get:
 *     summary: Exportar adopciones del albergue en Excel
 *     tags: [AdopcionHistorial]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fecha_desde
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: fecha_hasta
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: estado
 *         schema: { type: string }
 *       - in: query
 *         name: busqueda
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Archivo Excel (.xlsx) con adopciones
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get(
    '/exportar-excel',
    authMiddleware,
    authorizeRole(['albergue']),
    exportarAdopcionesExcel
);

module.exports = router;
