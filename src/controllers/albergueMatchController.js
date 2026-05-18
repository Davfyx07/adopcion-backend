const albergueMatchService = require('../services/albergueMatchService');
const matchService = require('../services/matchService');
const prisma = require('../config/prisma');

/**
 * HU-MCH-01: GET /api/shelters/matches
 * Lista todos los matches de las mascotas del albergue autenticado.
 */
const listarMatchesAlbergue = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const {
            estado,
            fecha_desde,
            fecha_hasta,
            id_mascota,
            order_by,
            limit,
            offset,
        } = req.query;

        const result = await albergueMatchService.listarMatchesAlbergue(idAlbergue, {
            estado,
            fecha_desde,
            fecha_hasta,
            id_mascota: id_mascota ? parseInt(id_mascota) : undefined,
            order_by,
            limit: limit ? parseInt(limit) : 20,
            offset: offset ? parseInt(offset) : 0,
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error('[albergueMatchController] listarMatchesAlbergue:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al listar matches.',
        });
    }
};

/**
 * HU-MCH-01: GET /api/shelters/matches/:id
 * Detalle completo de un match para el albergue.
 */
const obtenerDetalleMatchAlbergue = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const idMatch = parseInt(req.params.id);

        if (!idMatch) {
            return res.status(400).json({ success: false, message: 'ID de match inválido.' });
        }

        const result = await albergueMatchService.obtenerDetalleMatchAlbergue(idMatch, idAlbergue);

        if (!result.success) {
            return res.status(result.status).json(result);
        }

        return res.status(200).json(result);
    } catch (error) {
        console.error('[albergueMatchController] obtenerDetalleMatchAlbergue:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno al obtener detalle del match.',
        });
    }
};

/**
 * HU-MCH-02: POST /api/shelters/matches/:id/contact
 * El albergue contacta al adoptante vía WhatsApp.
 * Delega la lógica de negocio a matchService.contactarAdoptante.
 */
const contactarAdoptante = async (req, res) => {
  try {
    const idAlbergue = req.user.id;
    const idMatch = parseInt(req.params.id);

    if (!idMatch || isNaN(idMatch)) {
      return res.status(400).json({ success: false, message: 'ID de match inválido.' });
    }

    const result = await matchService.contactarAdoptante(idAlbergue, idMatch);

    if (!result.success) {
      return res.status(result.status).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('[albergueMatchController] contactarAdoptante:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al contactar adoptante.',
    });
  }
};

/**
 * HU-MCH-02: GET /api/shelters/matches/:id/historial
 * Historial de contactos WhatsApp para un match específico.
 */
const obtenerHistorialContactos = async (req, res) => {
  try {
    const idAlbergue = req.user.id;
    const idMatch = parseInt(req.params.id);

    if (!idMatch || isNaN(idMatch)) {
      return res.status(400).json({ success: false, message: 'ID de match inválido.' });
    }

    // Verificar que el match pertenece a una mascota del albergue
    const match = await prisma.match.findUnique({
      where: { id_match: idMatch },
      include: { mascota: { select: { id_albergue: true } } },
    });

    if (!match) {
      return res.status(404).json({ success: false, message: 'Match no encontrado.' });
    }

    if (match.mascota.id_albergue !== idAlbergue) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para ver este historial.' });
    }

    const contactos = await prisma.contactoWhatsapp.findMany({
      where: { id_match: idMatch },
      orderBy: { fecha_enlace: 'desc' },
    });

    return res.status(200).json({ success: true, data: contactos });
  } catch (error) {
    console.error('[albergueMatchController] obtenerHistorialContactos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al obtener historial de contactos.',
    });
  }
};

module.exports = {
  listarMatchesAlbergue,
  obtenerDetalleMatchAlbergue,
  contactarAdoptante,
  obtenerHistorialContactos,
};
