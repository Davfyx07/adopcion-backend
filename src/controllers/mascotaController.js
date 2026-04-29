const mascotaService = require('../services/mascotaService');

const crearMascota = async (req, res) => {
    try {
        const authUserId = req.user.id;
        const clientIp = req.socket.remoteAddress || req.ip;

        const result = await mascotaService.crearMascota(
            authUserId,
            authUserId,
            req.body,
            clientIp
        );

        return res.status(201).json({
            success: true,
            message: 'Mascota publicada exitosamente',
            data: result
        });
    } catch (error) {
        console.error('[mascotaController] Error en crearMascota:', error);
        if (error.message.includes('tagsIds proporcionados no son válidos')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor al publicar la mascota.'
        });
    }
};

const previsualizarMascota = async (req, res) => {
    try {
        const { id } = req.params;
        const mascota = await mascotaService.obtenerMascotaPorId(id);

        if (!mascota) {
            return res.status(404).json({
                success: false,
                message: 'Mascota no encontrada o ha sido eliminada.'
            });
        }

        return res.status(200).json({ success: true, data: mascota });
    } catch (error) {
        console.error('[mascotaController] Error en previsualizarMascota:', error);
        if (error.code === '22P02') {
            return res.status(400).json({ success: false, message: 'ID de mascota inválido.' });
        }
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor al obtener la mascota.'
        });
    }
};

const actualizarMascotaController = async (req, res) => {
    try {
        const { id } = req.params;
        const id_albergue = req.user.id;
        const ip = req.socket.remoteAddress || req.ip;

        const result = await mascotaService.actualizarMascota({
            id_mascota: id,
            id_albergue,
            data: req.body,
            ip
        });

        if (!result.success) {
            return res.status(result.status).json(result);
        }

        return res.status(200).json({
            success: true,
            message: 'Mascota actualizada exitosamente.',
            data: result.data
        });
    } catch (error) {
        console.error('[mascotaController] Error en actualizarMascotaController:', error);
        return res.status(500).json({ success: false, message: 'Error al actualizar la mascota.' });
    }
};

const cambiarEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, motivo } = req.body;
        const authUserId = req.user.id;
        const clientIp = req.socket.remoteAddress || req.ip;

        const result = await mascotaService.cambiarEstadoMascota(
            id,
            authUserId,
            estado,
            motivo,
            clientIp
        );

        return res.status(200).json({
            success: true,
            message: 'Estado de la mascota actualizado correctamente.',
            data: result
        });
    } catch (error) {
        console.error('[mascotaController] Error en cambiarEstado:', error);

        if (error.message.includes('No encontrada') || error.message.includes('No tienes permiso')) {
            return res.status(404).json({ success: false, message: error.message });
        }

        if (error.message.includes('Transición de estado no permitida')) {
            return res.status(400).json({ success: false, message: error.message });
        }

        if (error.code === '22P02') {
            return res.status(400).json({ success: false, message: 'ID de mascota inválido.' });
        }

        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor al cambiar el estado de la mascota.'
        });
    }
};

const feed = async (req, res) => {
    try {
        const { tipo, tamaño, edad, ciudad, page, limit } = req.query;
        const result = await mascotaService.listarFeed({ tipo, tamaño, edad, ciudad, page, limit });

        return res.status(200).json({
            success: true,
            data: result.data,
            meta: result.meta
        });
    } catch (error) {
        console.error('[mascotaController] Error en feed:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor al obtener el feed de mascotas.'
        });
    }
};

const match = async (req, res) => {
    try {
        const idAdoptante = req.user.id;
        const result = await mascotaService.calcularCompatibilidad(idAdoptante);

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('[mascotaController] Error en match:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor al calcular compatibilidad.'
        });
    }
};

const misMascotas = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const result = await mascotaService.listarMisMascotas(idAlbergue, { page, limit });

        return res.status(200).json({
            success: true,
            data: result.data,
            meta: result.meta
        });
    } catch (error) {
        console.error('[mascotaController] Error en misMascotas:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor al obtener tus mascotas.'
        });
    }
};

module.exports = {
    crearMascota,
    previsualizarMascota,
    actualizarMascotaController,
    cambiarEstado,
    feed,
    match,
    misMascotas
};
