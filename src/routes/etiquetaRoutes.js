const express = require('express');
const { listarEtiquetas } = require('../controllers/etiquetaController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Etiquetas
 *   description: Catálogo de etiquetas para perfil de adoptante
 */

/**
 * @swagger
 * /api/etiquetas:
 *   get:
 *     summary: Obtener catálogo de etiquetas
 *     description: >
 *       Retorna todas las etiquetas disponibles para el perfil de adoptante,
 *       agrupadas por categoría. Las etiquetas marcadas como obligatorias
 *       deben ser seleccionadas al crear el perfil.
 *     tags: [Etiquetas]
 *     responses:
 *       200:
 *         description: Lista de etiquetas disponibles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id_etiqueta:
 *                         type: integer
 *                         example: 1
 *                       nombre:
 *                         type: string
 *                         example: "Tiene patio"
 *                       categoria:
 *                         type: string
 *                         example: "vivienda"
 *                       es_obligatoria:
 *                         type: boolean
 *                         example: true
 *       500:
 *         description: Error interno del servidor
 */
router.get('/', listarEtiquetas);

module.exports = router;
