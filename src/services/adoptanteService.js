const pool = require('../config/db');
const { uploadImage, validateBase64Image } = require('./storageService');
const { calcularEmbedding } = require('./embeddingService');
const { getEtiquetasObligatorias } = require('./etiquetaService');

/**
 * Crea el perfil de un adoptante de forma atómica.
 * - Valida que no exista perfil previo
 * - Valida rol adoptante
 * - Valida tags obligatorios
 * - Sube foto a Cloudinary si se proporciona
 * - Calcula embedding vectorial
 * - Guarda perfil, tags y actualiza estado_cuenta
 * - Registra en log_auditoria
 */
const crearPerfilAdoptante = async ({ idUsuario, telefono, ciudad, direccion, tagIds, fotoBase64, ip }) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verificar rol adoptante
        const userResult = await client.query(
            `SELECT u.id_usuario, r.nombre_rol
             FROM usuario u
             JOIN rol r ON u.id_rol = r.id_rol
             WHERE u.id_usuario = $1`,
            [idUsuario]
        );

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 404, message: 'Usuario no encontrado.' };
        }

        if (userResult.rows[0].nombre_rol !== 'adoptante') {
            await client.query('ROLLBACK');
            return {
                success: false,
                status: 403,
                message: 'Solo los usuarios con rol adoptante pueden crear un perfil de adoptante.',
            };
        }

        // 2. Verificar que no tenga perfil creado
        const perfilExistente = await client.query(
            'SELECT id_perfil FROM perfil_adoptante WHERE id_usuario = $1',
            [idUsuario]
        );

        if (perfilExistente.rows.length > 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 409, message: 'Ya tienes un perfil de adoptante creado.' };
        }

        // 3. Validar tags obligatorios
        const obligatorias = await getEtiquetasObligatorias(client);
        const tagSet = new Set(tagIds.map(Number));
        const faltantes = obligatorias.filter(id => !tagSet.has(id));

        if (faltantes.length > 0) {
            await client.query('ROLLBACK');
            return {
                success: false,
                status: 400,
                message: 'Debes seleccionar todas las etiquetas obligatorias.',
                data: { tags_faltantes: faltantes },
            };
        }

        // 4. Validar que los tag IDs existen en el catálogo
        if (tagIds.length > 0) {
            const validTagsResult = await client.query(
                'SELECT COUNT(*) AS total FROM etiqueta WHERE id_etiqueta = ANY($1)',
                [tagIds]
            );
            if (parseInt(validTagsResult.rows[0].total) !== tagIds.length) {
                await client.query('ROLLBACK');
                return { success: false, status: 400, message: 'Uno o más tags seleccionados no existen.' };
            }
        }

        // 5. Validar y subir foto si se proporciona
        let fotoUrl = null;
        if (fotoBase64) {
            const validacion = validateBase64Image(fotoBase64);
            if (!validacion.valid) {
                await client.query('ROLLBACK');
                return { success: false, status: 400, message: validacion.message };
            }
            fotoUrl = await uploadImage(fotoBase64, 'adoptantes');
        }

        // 6. Calcular embedding vectorial basado en tags seleccionados
        const embedding = await calcularEmbedding(tagIds);

        // 7. Crear perfil_adoptante
        const perfilResult = await client.query(
            `INSERT INTO perfil_adoptante (id_usuario, telefono, ciudad, direccion, foto_url, embedding, fecha_creacion)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING id_perfil`,
            [idUsuario, telefono.trim(), ciudad.trim(), direccion.trim(), fotoUrl, embedding]
        );

        const idPerfil = perfilResult.rows[0].id_perfil;

        // 8. Guardar tags en adoptante_tag
        if (tagIds.length > 0) {
            const placeholders = tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
            await client.query(
                `INSERT INTO adoptante_tag (id_usuario, id_etiqueta) VALUES ${placeholders}`,
                [idUsuario, ...tagIds]
            );
        }

        // 9. Actualizar estado_cuenta a 'completo'
        await client.query(
            "UPDATE usuario SET estado_cuenta = 'completo' WHERE id_usuario = $1",
            [idUsuario]
        );

        // 10. Log de auditoría
        await client.query(
            `INSERT INTO log_auditoria (id_autor, accion, entidad_afectada, id_registro_afectado, ip, fecha)
             VALUES ($1, 'CREACION_PERFIL_ADOPTANTE', 'perfil_adoptante', $2, $3, NOW())`,
            [idUsuario, idPerfil, ip]
        );

        await client.query('COMMIT');

        return {
            success: true,
            data: {
                id_perfil: idPerfil,
                telefono: telefono.trim(),
                ciudad: ciudad.trim(),
                direccion: direccion.trim(),
                foto_url: fotoUrl,
                tags: tagIds,
            },
        };

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[adoptante.service] crearPerfil:', err.message);
        throw err;
    } finally {
        client.release();
    }
};

module.exports = { crearPerfilAdoptante };
