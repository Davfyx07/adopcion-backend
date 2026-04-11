const pool = require('../config/db');
const { uploadImage } = require('./storageService');

/**
 * HU-AL-01: Crear Perfil Institucional del Albergue
 * 
 * Flujo atómico (BEGIN/COMMIT/ROLLBACK):
 * 1. Verificar que el usuario sea albergue con perfil_incompleto
 * 2. Verificar que NO exista ya un perfil para ese usuario
 * 3. Verificar unicidad del NIT (409 si duplicado)
 * 4. Subir logo y obtener URL
 * 5. INSERT en tabla Albergue
 * 6. INSERT en Historial_WhatsApp_Albergue (trazabilidad)
 * 7. UPDATE Usuario → estado_cuenta = 'activo'
 * 8. INSERT en Log_Auditoria
 * 9. COMMIT
 * 
 * @param {Object} params
 * @param {string} params.userId - UUID del usuario autenticado
 * @param {Object} params.data - Datos del perfil {nombre_albergue, nit, descripcion, whatsapp, sitio_web}
 * @param {Object} params.logoFile - Archivo del logo (req.file de multer)
 * @param {string} params.ip - IP del request
 * @returns {Object} Resultado con success, status, data/message
 */
const createAlbergueProfile = async ({ userId, data, logoFile, ip }) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verificar que el usuario existe, es albergue y tiene perfil incompleto
        const userResult = await client.query(
            `SELECT u.id_usuario, u.estado_cuenta, r.nombre_rol 
             FROM Usuario u 
             JOIN Rol r ON u.id_rol = r.id_rol 
             WHERE u.id_usuario = $1 AND u.deleted_at IS NULL`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return {
                success: false,
                status: 404,
                message: 'Usuario no encontrado.',
            };
        }

        const user = userResult.rows[0];

        if (user.nombre_rol.toLowerCase() !== 'albergue') {
            await client.query('ROLLBACK');
            return {
                success: false,
                status: 403,
                message: 'Solo los usuarios con rol albergue pueden crear un perfil institucional.',
            };
        }

        if (user.estado_cuenta !== 'perfil_incompleto') {
            await client.query('ROLLBACK');
            return {
                success: false,
                status: 409,
                message: 'Tu perfil institucional ya fue completado anteriormente.',
            };
        }

        // 2. Verificar que no exista ya un perfil de albergue para este usuario (doble check)
        const existingProfile = await client.query(
            'SELECT id_usuario FROM Albergue WHERE id_usuario = $1',
            [userId]
        );

        if (existingProfile.rows.length > 0) {
            await client.query('ROLLBACK');
            return {
                success: false,
                status: 409,
                message: 'Ya existe un perfil de albergue asociado a tu cuenta.',
            };
        }

        // 3. Verificar unicidad del NIT
        const nitClean = data.nit.replace(/\./g, '').trim();
        const existingNit = await client.query(
            'SELECT id_usuario FROM Albergue WHERE nit = $1',
            [nitClean]
        );

        if (existingNit.rows.length > 0) {
            await client.query('ROLLBACK');
            return {
                success: false,
                status: 409,
                message: 'El NIT ingresado ya está registrado por otro albergue.',
            };
        }

        // 4. Subir logo y obtener URL
        let logoUrl = null;
        if (logoFile) {
            logoUrl = await uploadImage(logoFile.path, 'adopcion/logos');
        }

        // 5. INSERT en tabla Albergue (PK compartida con Usuario)
        const whatsappClean = data.whatsapp.replace(/[\s()-]/g, '');

        await client.query(
            `INSERT INTO Albergue 
             (id_usuario, nit, nombre_albergue, logo, descripcion, whatsapp_actual, sitio_web)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                userId,
                nitClean,
                data.nombre_albergue.trim(),
                logoUrl,
                data.descripcion.trim(),
                whatsappClean,
                data.sitio_web ? data.sitio_web.trim() : null,
            ]
        );

        // 6. Registrar en historial de WhatsApp (trazabilidad HU-AL-02)
        await client.query(
            `INSERT INTO Historial_WhatsApp_Albergue 
             (id_albergue, numero_whatsapp, fecha_inicio)
             VALUES ($1, $2, NOW())`,
            [userId, whatsappClean]
        );

        // 7. Activar cuenta del usuario
        await client.query(
            "UPDATE Usuario SET estado_cuenta = 'activo' WHERE id_usuario = $1",
            [userId]
        );

        // 8. Log de auditoría
        await client.query(
            `INSERT INTO Log_Auditoria 
             (id_autor, accion, entidad_afectada, id_registro_afectado, ip, fecha)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [userId, 'CREACION_PERFIL_ALBERGUE', 'Albergue', userId, ip]
        );

        await client.query('COMMIT');

        // 9. Retornar datos del perfil creado
        return {
            success: true,
            status: 201,
            data: {
                id_usuario: userId,
                nombre_albergue: data.nombre_albergue.trim(),
                nit: nitClean,
                descripcion: data.descripcion.trim(),
                whatsapp: whatsappClean,
                logo_url: logoUrl,
                sitio_web: data.sitio_web ? data.sitio_web.trim() : null,
                estado_cuenta: 'activo',
            },
        };

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[albergue.service] Error creando perfil:', err.message);
        throw err;
    } finally {
        client.release();
    }
};

module.exports = { createAlbergueProfile };
