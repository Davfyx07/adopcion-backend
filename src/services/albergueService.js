const pool = require('../config/db');
const { uploadImage, deleteImage } = require('./storageService');

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
        FROM albergue a
        JOIN usuario u ON u.id_usuario = a.id_usuario
        WHERE a.id_usuario = $1`,
        [userId]
    );

    return result.rows[0] || null;
};

const updatePerfilAlbergue = async (userId, data, ip) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const currentRes = await client.query(
            `SELECT * FROM albergue WHERE id_usuario = $1`,
            [userId]
        );

        if (currentRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 404, message: 'Albergue no encontrado' };
        }

        const current = currentRes.rows[0];

        // 🚫 NIT bloqueado
        if (data.nit) {
            await client.query('ROLLBACK');
            return { success: false, status: 400, message: 'El NIT no es editable' };
        }

        // 📞 Historial WhatsApp
        if (data.whatsapp_actual && data.whatsapp_actual !== current.whatsapp_actual) {

            await client.query(
                `UPDATE historial_whatsapp_albergue
                 SET fecha_fin = NOW()
                 WHERE id_albergue = $1 AND fecha_fin IS NULL`,
                [userId]
            );

            await client.query(
                `INSERT INTO historial_whatsapp_albergue 
                 (id_albergue, numero_whatsapp, fecha_inicio)
                 VALUES ($1, $2, NOW())`,
                [userId, data.whatsapp_actual]
            );
        }

        // 🖼️ Logo
        let logoFinal = current.logo;

        if (data.logo && data.logo !== current.logo) {
            const newLogo = await uploadImage(data.logo);

            if (current.logo) {
                await deleteImage(current.logo);
            }

            logoFinal = newLogo;
        }

        // 📝 Update
        const updatedRes = await client.query(
            `UPDATE albergue SET
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
            `INSERT INTO log_auditoria 
            (id_autor, accion, entidad_afectada, id_registro_afectado, valor_anterior, valor_nuevo, ip, fecha)
            VALUES ($1, 'UPDATE_PERFIL_ALBERGUE', 'albergue', $1, $2, $3, $4, NOW())`,
            [userId, current, updated, ip]
        );

        await client.query('COMMIT');

        return { success: true, data: updated };

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

module.exports = {
    getPerfilAlbergue,
    updatePerfilAlbergue
};