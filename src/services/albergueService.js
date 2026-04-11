const pool = require('../config/db');
const { uploadImage, deleteImage, validateBase64Image } = require('./storageService');

// =====================================================================
// HU-AL-01: Crear Perfil Institucional del Albergue
// =====================================================================
/**
 * Flujo atómico (BEGIN/COMMIT/ROLLBACK):
 * 1. Verificar que el usuario sea albergue con perfil_incompleto
 * 2. Verificar que NO exista ya un perfil para ese usuario
 * 3. Verificar unicidad del NIT (409 si duplicado)
 * 4. Subir logo si se proporciona (base64 → Cloudinary)
 * 5. INSERT en tabla Albergue
 * 6. INSERT en Historial_WhatsApp_Albergue (trazabilidad)
 * 7. UPDATE Usuario → estado_cuenta = 'activo'
 * 8. INSERT en Log_Auditoria
 * 9. COMMIT
 */
const createAlbergueProfile = async ({ userId, data, ip }) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verificar rol y estado
        const userResult = await client.query(
            `SELECT u.id_usuario, u.estado_cuenta, r.nombre_rol 
             FROM Usuario u 
             JOIN Rol r ON u.id_rol = r.id_rol 
             WHERE u.id_usuario = $1 AND u.deleted_at IS NULL`,
            [userId]
        );

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 404, message: 'Usuario no encontrado.' };
        }

        const user = userResult.rows[0];

        if (user.nombre_rol.toLowerCase() !== 'albergue') {
            await client.query('ROLLBACK');
            return { success: false, status: 403, message: 'Solo los usuarios con rol albergue pueden crear un perfil institucional.' };
        }

        if (user.estado_cuenta !== 'perfil_incompleto') {
            await client.query('ROLLBACK');
            return { success: false, status: 409, message: 'Tu perfil institucional ya fue completado anteriormente.' };
        }

        // 2. Verificar que no exista perfil
        const existingProfile = await client.query(
            'SELECT id_usuario FROM Albergue WHERE id_usuario = $1',
            [userId]
        );

        if (existingProfile.rows.length > 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 409, message: 'Ya existe un perfil de albergue asociado a tu cuenta.' };
        }

        // 3. Verificar unicidad del NIT
        const nitClean = data.nit.replace(/\./g, '').trim();
        const existingNit = await client.query(
            'SELECT id_usuario FROM Albergue WHERE nit = $1',
            [nitClean]
        );

        if (existingNit.rows.length > 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 409, message: 'El NIT ingresado ya está registrado por otro albergue.' };
        }

        // 4. Subir logo (base64 → Cloudinary)
        let logoUrl = null;
        if (data.logo) {
            logoUrl = await uploadImage(data.logo, 'adopcion/logos');
        }

        // 5. INSERT en tabla Albergue
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

        // 6. Registrar en historial de WhatsApp
        await client.query(
            `INSERT INTO Historial_WhatsApp_Albergue 
             (id_albergue, numero_whatsapp, fecha_inicio)
             VALUES ($1, $2, NOW())`,
            [userId, whatsappClean]
        );

        // 7. Activar cuenta
        await client.query(
            "UPDATE Usuario SET estado_cuenta = 'activo' WHERE id_usuario = $1",
            [userId]
        );

        // 8. Log de auditoría
        await client.query(
            `INSERT INTO Log_Auditoria 
             (id_autor, accion, entidad_afectada, id_registro_afectado, ip, fecha)
             VALUES ($1, 'CREACION_PERFIL_ALBERGUE', 'Albergue', $1, $2, NOW())`,
            [userId, ip]
        );

        await client.query('COMMIT');

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
        console.error('[albergue.service] createProfile:', err.message);
        throw err;
    } finally {
        client.release();
    }
};

// =====================================================================
// HU-AL-02: Obtener Perfil del Albergue
// =====================================================================
const getPerfilAlbergue = async (userId) => {
    const result = await pool.query(
        `SELECT 
            a.id_usuario,
            a.nit,
            a.nombre_albergue,
            a.logo,
            a.descripcion,
            a.whatsapp_actual,
            a.sitio_web,
            u.correo
        FROM Albergue a
        JOIN Usuario u ON u.id_usuario = a.id_usuario
        WHERE a.id_usuario = $1`,
        [userId]
    );

    return result.rows[0] || null;
};

// =====================================================================
// HU-AL-02: Actualizar Perfil del Albergue
// =====================================================================
/**
 * - Bloquea edición de NIT (400)
 * - Si cambia whatsapp → cierra el registro anterior en historial y crea uno nuevo
 * - Si cambia logo → sube nuevo a Cloudinary y borra el anterior
 * - Audita con valor_anterior y valor_nuevo
 */
const updatePerfilAlbergue = async (userId, data, ip) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const currentRes = await client.query(
            'SELECT * FROM Albergue WHERE id_usuario = $1 FOR UPDATE',
            [userId]
        );

        if (currentRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 404, message: 'Albergue no encontrado.' };
        }

        const current = currentRes.rows[0];

        // 🚫 NIT bloqueado
        if (data.nit) {
            await client.query('ROLLBACK');
            return { success: false, status: 400, message: 'El NIT no es editable.' };
        }

        // 📞 Historial WhatsApp (si cambió)
        if (data.whatsapp_actual && data.whatsapp_actual !== current.whatsapp_actual) {
            await client.query(
                `UPDATE Historial_WhatsApp_Albergue
                 SET fecha_fin = NOW()
                 WHERE id_albergue = $1 AND fecha_fin IS NULL`,
                [userId]
            );

            await client.query(
                `INSERT INTO Historial_WhatsApp_Albergue 
                 (id_albergue, numero_whatsapp, fecha_inicio)
                 VALUES ($1, $2, NOW())`,
                [userId, data.whatsapp_actual]
            );
        }

        // 🖼️ Logo (si se envía uno nuevo)
        let logoFinal = current.logo;

        if (data.logo && data.logo !== current.logo) {
            logoFinal = await uploadImage(data.logo, 'adopcion/logos');

            if (current.logo) {
                deleteImage(current.logo, 'adopcion/logos').catch(e =>
                    console.warn('[albergue] No se pudo eliminar logo anterior:', e.message)
                );
            }
        }

        // 📝 Update con COALESCE para campos opcionales
        const updatedRes = await client.query(
            `UPDATE Albergue SET
                descripcion = COALESCE($1, descripcion),
                whatsapp_actual = COALESCE($2, whatsapp_actual),
                sitio_web = COALESCE($3, sitio_web),
                logo = $4
            WHERE id_usuario = $5
            RETURNING *`,
            [
                data.descripcion ?? null,
                data.whatsapp_actual ?? null,
                data.sitio_web ?? null,
                logoFinal,
                userId
            ]
        );

        const updated = updatedRes.rows[0];

        // 📊 Auditoría
        await client.query(
            `INSERT INTO Log_Auditoria 
            (id_autor, accion, entidad_afectada, id_registro_afectado, valor_anterior, valor_nuevo, ip, fecha)
            VALUES ($1, 'UPDATE_PERFIL_ALBERGUE', 'Albergue', $1, $2, $3, $4, NOW())`,
            [userId, JSON.stringify(current), JSON.stringify(updated), ip]
        );

        await client.query('COMMIT');

        return { success: true, data: updated };

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[albergue.service] updatePerfil:', err.message);
        throw err;
    } finally {
        client.release();
    }
};

module.exports = {
    createAlbergueProfile,
    getPerfilAlbergue,
    updatePerfilAlbergue,
};