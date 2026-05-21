const {
    createAlbergueProfile,
    getPerfilAlbergue,
    updatePerfilAlbergue,
    obtenerHistorialAdopciones: serviceObtenerHistorialAdopciones
} = require('../services/albergueService');

/**
 * POST /api/albergue/perfil
 * HU-AL-01: Completar perfil institucional del albergue
 */
const createProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const { nombre_albergue, nit, descripcion, whatsapp, sitio_web, logo } = req.body;

        const result = await createAlbergueProfile({
            userId,
            data: { nombre_albergue, nit, descripcion, whatsapp, sitio_web, logo },
            ip,
        });

        if (!result.success) {
            return res.status(result.status).json({
                success: false,
                message: result.message,
            });
        }

        return res.status(201).json({
            success: true,
            message: 'Perfil institucional creado exitosamente. Tu cuenta ha sido activada.',
            data: result.data,
        });

    } catch (err) {
        console.error('[albergue.controller] createProfile:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Ocurrió un error al crear el perfil. Intenta de nuevo más tarde.',
        });
    }
};

/**
 * GET /api/albergue/perfil
 * HU-AL-02: Obtener perfil del albergue
 */
const getPerfil = async (req, res) => {
    try {
        const perfil = await getPerfilAlbergue(req.user.id);

        if (!perfil) {
            return res.status(404).json({
                success: false,
                message: 'Perfil no encontrado'
            });
        }

        res.json({
            success: true,
            data: perfil
        });

    } catch (err) {
        console.error('[albergue] getPerfil:', err.message);
        res.status(500).json({ success: false, message: 'Error interno al obtener el perfil.' });
    }
};

/**
 * PUT /api/albergue/perfil
 * HU-AL-02: Editar perfil del albergue
 */
const updatePerfil = async (req, res) => {
    try {
        const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

        const result = await updatePerfilAlbergue(
            req.user.id,
            req.body,
            ip
        );

        if (!result.success) {
            return res.status(result.status).json(result);
        }

        res.json({
            success: true,
            message: 'Perfil actualizado exitosamente',
            data: result.data
        });

    } catch (err) {
        console.error('[albergue] updatePerfil:', err.message);
        res.status(500).json({ success: false, message: 'Error interno al actualizar el perfil.' });
    }
};

const { 
    obtenerMatchesAlbergue,
    contactarAdoptante: serviceContactarAdoptante,
    obtenerHistorialContactos: serviceObtenerHistorialContactos
} = require('../services/matchService');

const obtenerMatches = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const idMascota = req.query.id_mascota || null;
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;

        const result = await obtenerMatchesAlbergue(idAlbergue, { idMascota, limit, offset });

        return res.status(200).json(result);
    } catch (err) {
        console.error('[albergueController] Error en obtenerMatches:', err);
        return res.status(500).json({
            success: false,
            message: 'Error interno al obtener matches.',
        });
    }
};

const contactarAdoptante = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const { idMatch } = req.params;

        const result = await serviceContactarAdoptante(idAlbergue, idMatch);
        if (!result.success) {
            return res.status(result.status || 400).json(result);
        }

        return res.status(200).json(result);
    } catch (err) {
        console.error('[albergueController] Error en contactarAdoptante:', err);
        return res.status(500).json({
            success: false,
            message: 'Error interno al registrar contacto.',
        });
    }
};

const obtenerHistorialContactos = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const { idMatch } = req.params;

        const result = await serviceObtenerHistorialContactos(idAlbergue, idMatch);
        if (!result.success) {
            return res.status(result.status || 400).json(result);
        }

        return res.status(200).json(result);
    } catch (err) {
        console.error('[albergueController] Error en obtenerHistorialContactos:', err);
        return res.status(500).json({
            success: false,
            message: 'Error interno al obtener el historial de contactos.',
        });
    }
};

const obtenerHistorialAdopciones = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;

        const result = await serviceObtenerHistorialAdopciones(idAlbergue, { limit, offset });
        return res.status(200).json(result);
    } catch (err) {
        console.error('[albergueController] Error en obtenerHistorialAdopciones:', err);
        return res.status(500).json({
            success: false,
            message: 'Error interno al obtener el historial de adopciones.',
        });
    }
};

const ExcelJS = require('exceljs');

const exportarCSV = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const { estado, fecha_desde, fecha_hasta } = req.query;

        // Fetch all (no limits)
        const result = await serviceObtenerHistorialAdopciones(idAlbergue, { limit: 10000, offset: 0 });
        let data = result.data;

        if (estado) data = data.filter(a => (a.estado_proceso || a.estado) === estado);
        if (fecha_desde) data = data.filter(a => new Date(a.fecha_adopcion) >= new Date(fecha_desde));
        if (fecha_hasta) data = data.filter(a => new Date(a.fecha_adopcion) <= new Date(fecha_hasta));

        let csv = 'ID Adopcion,Mascota,Adoptante,Fecha,Estado\n';
        data.forEach(a => {
            const petName = a.mascota?.nombre || '—';
            const adopterName = a.adoptante?.nombre_completo || '—';
            const date = a.fecha_adopcion ? new Date(a.fecha_adopcion).toISOString().split('T')[0] : '—';
            const status = a.estado_proceso || '—';
            csv += `"${a.id_adopcion}","${petName}","${adopterName}","${date}","${status}"\n`;
        });

        res.header('Content-Type', 'text/csv');
        res.attachment('adopciones.csv');
        return res.send(csv);
    } catch (err) {
        console.error('[albergueController] Error en exportarCSV:', err);
        return res.status(500).json({ success: false, message: 'Error al exportar CSV.' });
    }
};

const exportarExcel = async (req, res) => {
    try {
        const idAlbergue = req.user.id;
        const { estado, fecha_desde, fecha_hasta } = req.query;

        const result = await serviceObtenerHistorialAdopciones(idAlbergue, { limit: 10000, offset: 0 });
        let data = result.data;

        if (estado) data = data.filter(a => (a.estado_proceso || a.estado) === estado);
        if (fecha_desde) data = data.filter(a => new Date(a.fecha_adopcion) >= new Date(fecha_desde));
        if (fecha_hasta) data = data.filter(a => new Date(a.fecha_adopcion) <= new Date(fecha_hasta));

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Adopciones');

        worksheet.columns = [
            { header: 'ID Adopcion', key: 'id', width: 36 },
            { header: 'Mascota', key: 'petName', width: 20 },
            { header: 'Adoptante', key: 'adopterName', width: 30 },
            { header: 'Fecha', key: 'date', width: 15 },
            { header: 'Estado', key: 'status', width: 15 },
        ];

        data.forEach(a => {
            worksheet.addRow({
                id: a.id_adopcion,
                petName: a.mascota?.nombre || '—',
                adopterName: a.adoptante?.nombre_completo || '—',
                date: a.fecha_adopcion ? new Date(a.fecha_adopcion).toISOString().split('T')[0] : '—',
                status: a.estado_proceso || '—'
            });
        });

        res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.attachment('adopciones.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('[albergueController] Error en exportarExcel:', err);
        return res.status(500).json({ success: false, message: 'Error al exportar Excel.' });
    }
};

module.exports = {
    createProfile,
    getPerfil,
    updatePerfil,
    obtenerMatches,
    contactarAdoptante,
    obtenerHistorialContactos,
    obtenerHistorialAdopciones,
    exportarCSV,
    exportarExcel,
};