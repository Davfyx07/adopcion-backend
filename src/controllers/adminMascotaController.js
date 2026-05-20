const prisma = require('../config/prisma');

const listarMascotasAdmin = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        const mascotaService = require('../services/mascotaService');
        const result = await mascotaService.listarMascotasAdmin({ page, limit });

        return res.status(200).json({
            success: true,
            data: result.data,
            meta: result.meta,
        });
    } catch (error) {
        console.error('[adminMascotaController] Error en listarMascotasAdmin:', error);
        return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

const getHistorialModeracion = async (req, res) => {
    try {
        const idMascota = parseInt(req.params.id);

        if (isNaN(idMascota)) {
            return res.status(400).json({ success: false, message: 'ID de mascota inválido.' });
        }

        const historial = await prisma.logAuditoria.findMany({
            where: {
                entidad_afectada: 'Mascota',
                id_registro_afectado: idMascota,
                accion: {
                    in: ['cambio_estado_mascota', 'moderacion_admin_mascota', 'UPDATE_MASCOTA', 'ELIMINACION_MASCOTA'],
                },
            },
            orderBy: { fecha: 'desc' },
            select: {
                id_log: true,
                accion: true,
                valor_anterior: true,
                valor_nuevo: true,
                fecha: true,
                ip: true,
            },
        });

        return res.status(200).json({
            success: true,
            data: historial.map((log) => ({
                id: log.id_log,
                accion: log.accion,
                valor_anterior: log.valor_anterior ? JSON.parse(log.valor_anterior) : null,
                valor_nuevo: log.valor_nuevo ? JSON.parse(log.valor_nuevo) : null,
                fecha: log.fecha,
                ip: log.ip,
            })),
        });
    } catch (error) {
        console.error('[adminMascotaController] Error en getHistorialModeracion:', error);
        return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

const cambiarEstadoAdmin = async (req, res) => {
    try {
        const idMascota = parseInt(req.params.id);
        const { estado, motivo } = req.body;
        const idAdmin = req.user.id;
        const clientIp = req.socket.remoteAddress || req.ip;

        if (isNaN(idMascota)) {
            return res.status(400).json({ success: false, message: 'ID de mascota inválido.' });
        }

        if (!estado || !['oculto', 'disponible'].includes(estado)) {
            return res.status(400).json({ success: false, message: 'Estado inválido. Debe ser "oculto" o "disponible".' });
        }

        const mascotaService = require('../services/mascotaService');
        const result = await mascotaService.cambiarEstadoMascota(idMascota, {
            idAlbergue: null,
            nuevoEstado: estado,
            motivo,
            clientIp,
            idAdmin,
            motivoModeracion: motivo || null,
        });

        return res.status(200).json({
            success: true,
            message: `Mascota ${estado === 'oculto' ? 'ocultada' : 'reactivada'} correctamente.`,
            data: result,
        });
    } catch (error) {
        console.error('[adminMascotaController] Error en cambiarEstadoAdmin:', error);

        if (error.message.includes('no encontrada')) {
            return res.status(404).json({ success: false, message: error.message });
        }

        if (error.message.includes('Transición de estado no permitida')) {
            return res.status(400).json({ success: false, message: error.message });
        }

        return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
};

module.exports = { listarMascotasAdmin, getHistorialModeracion, cambiarEstadoAdmin };