const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRole = require('../middlewares/authorizeRole');
const matchService = require('../services/matchService');

// GET /api/recomendaciones - Equivalente a calcularMatch pero devuelto como feed
router.get('/', authMiddleware, authorizeRole(['adoptante']), async (req, res) => {
    try {
        const idAdoptante = req.user.id;
        // Obtenemos resultados del algoritmo
        const resultados = await matchService.calcularCompatibilidad(idAdoptante);
        
        // Simular paginación si se pide
        const { page = 1, limit = 10 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const startIndex = (pageNum - 1) * limitNum;
        const paginated = resultados.slice(startIndex, startIndex + limitNum);

        return res.status(200).json({
            success: true,
            data: paginated,
            meta: {
                page: pageNum,
                limit: limitNum,
                total: resultados.length
            }
        });
    } catch (error) {
        console.error('[recomendacionRoutes] Error en GET /:', error);
        return res.status(500).json({ success: false, message: 'Error al obtener recomendaciones.' });
    }
});

// POST /api/recomendaciones/:id/me-interesa
router.post('/:id/me-interesa', authMiddleware, authorizeRole(['adoptante']), async (req, res) => {
    try {
        const idAdoptante = req.user.id;
        const idMascota = req.params.id;
        
        const result = await matchService.registrarMatch({
            idAdoptante,
            idMascota,
            puntaje: null // No tenemos el puntaje exacto aquí a menos que lo consultemos
        });

        if (!result.success) {
            return res.status(result.status || 400).json(result);
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('[recomendacionRoutes] Error en me-interesa:', error);
        return res.status(500).json({ success: false, message: 'Error interno al registrar interés.' });
    }
});

// POST /api/recomendaciones/:id/descartar
router.post('/:id/descartar', authMiddleware, authorizeRole(['adoptante']), async (req, res) => {
    try {
        const idAdoptante = req.user.id;
        const idMascota = req.params.id;
        const result = await matchService.descartarMascota(idAdoptante, idMascota);

        if (!result.success) {
            return res.status(result.status || 400).json(result);
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('[recomendacionRoutes] Error en descartar:', error);
        return res.status(500).json({ success: false, message: 'Error interno al descartar.' });
    }
});

// POST /api/recomendaciones/deshacer
router.post('/deshacer', authMiddleware, authorizeRole(['adoptante']), async (req, res) => {
    // Por ahora es un mock porque deshacer la última acción de matching requiere lógica compleja
    return res.status(200).json({ success: true, message: 'Simulación de deshacer completada.' });
});

module.exports = router;
