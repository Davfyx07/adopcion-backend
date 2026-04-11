const pool = require('../config/db');
const { uploadImage, validateBase64Image, deleteImage } = require('./storageService');
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

/**
 * Obtiene el perfil de un adoptante incluyendo sus etiquetas.
 */
const obtenerPerfilAdoptante = async (idUsuario) => {
    const client = await pool.connect();
    try {
        const perfilResult = await client.query(
            'SELECT * FROM perfil_adoptante WHERE id_usuario = $1',
            [idUsuario]
        );

        if (perfilResult.rows.length === 0) {
            return { success: false, status: 404, message: 'Perfil no encontrado.' };
        }

        const perfil = perfilResult.rows[0];

        const tagsResult = await client.query(
            `SELECT e.id_etiqueta, e.nombre, e.categoria 
             FROM adoptante_tag at
             JOIN etiqueta e ON at.id_etiqueta = e.id_etiqueta
             WHERE at.id_usuario = $1`,
            [idUsuario]
        );

        return {
            success: true,
            data: {
                id_perfil: perfil.id_perfil,
                telefono: perfil.telefono,
                ciudad: perfil.ciudad,
                direccion: perfil.direccion,
                foto_url: perfil.foto_url,
                fecha_creacion: perfil.fecha_creacion,
                etiquetas: tagsResult.rows
            }
        };
    } catch (err) {
        console.error('[adoptante.service] obtenerPerfil:', err.message);
        throw err;
    } finally {
        client.release();
    }
};

/**
 * Actualiza los datos básicos del perfil (teléfono, ciudad, dirección, foto).
 */
const actualizarPerfilAdoptante = async ({ idUsuario, telefono, ciudad, direccion, fotoBase64, ip }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const perfilAnteriorResult = await client.query(
            'SELECT * FROM perfil_adoptante WHERE id_usuario = $1 FOR UPDATE',
            [idUsuario]
        );

        if (perfilAnteriorResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 404, message: 'Perfil no encontrado.' };
        }

        const perfilAnterior = perfilAnteriorResult.rows[0];
        let nuevaFotoUrl = perfilAnterior.foto_url;
        let fotoViejaParaBorrar = null;

        if (fotoBase64) {
            const validacion = validateBase64Image(fotoBase64);
            if (!validacion.valid) {
                await client.query('ROLLBACK');
                return { success: false, status: 400, message: validacion.message };
            }
            nuevaFotoUrl = await uploadImage(fotoBase64, 'adoptantes');
            fotoViejaParaBorrar = perfilAnterior.foto_url;
        }

        const result = await client.query(
            `UPDATE perfil_adoptante 
             SET telefono = $1, ciudad = $2, direccion = $3, foto_url = $4
             WHERE id_usuario = $5 RETURNING *`,
            [telefono.trim(), ciudad.trim(), direccion.trim(), nuevaFotoUrl, idUsuario]
        );

        const perfilActualizado = result.rows[0];

        // Auditoría
        await client.query(
            `INSERT INTO log_auditoria (id_autor, accion, entidad_afectada, id_registro_afectado, valor_anterior, valor_nuevo, ip, fecha)
             VALUES ($1, 'ACTUALIZACION_PERFIL_ADOPTANTE', 'perfil_adoptante', $2, $3, $4, $5, NOW())`,
            [
                idUsuario, 
                perfilActualizado.id_perfil, 
                JSON.stringify(perfilAnterior), 
                JSON.stringify(perfilActualizado), 
                ip
            ]
        );

        await client.query('COMMIT');

        // Borrar imagen vieja asincrónamente si existía una nueva
        if (fotoViejaParaBorrar && fotoViejaParaBorrar !== nuevaFotoUrl) {
            deleteImage(fotoViejaParaBorrar, 'adoptantes').catch(e => console.error('Error deleting old image', e));
        }

        return { success: true, data: {
            id_perfil: perfilActualizado.id_perfil,
            telefono: perfilActualizado.telefono,
            ciudad: perfilActualizado.ciudad,
            direccion: perfilActualizado.direccion,
            foto_url: perfilActualizado.foto_url
        }};
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[adoptante.service] actualizarPerfil:', err.message);
        throw err;
    } finally {
        client.release();
    }
};

/**
 * Actualiza únicamente las etiquetas y recalcula el embedding.
 */
const actualizarEtiquetasAdoptante = async ({ idUsuario, tagIds, ip }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const perfilResult = await client.query(
            'SELECT id_perfil FROM perfil_adoptante WHERE id_usuario = $1 FOR UPDATE',
            [idUsuario]
        );

        if (perfilResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 404, message: 'Perfil no encontrado.' };
        }
        const idPerfil = perfilResult.rows[0].id_perfil;

        // Validar tags obligatorios
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

        // Validar que existen en el catálogo
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

        const tagsViejos = await client.query(
            'SELECT id_etiqueta FROM adoptante_tag WHERE id_usuario = $1',
            [idUsuario]
        );
        const viejosIds = tagsViejos.rows.map(r => r.id_etiqueta);

        await client.query('DELETE FROM adoptante_tag WHERE id_usuario = $1', [idUsuario]);

        if (tagIds.length > 0) {
            const placeholders = tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
            await client.query(
                `INSERT INTO adoptante_tag (id_usuario, id_etiqueta) VALUES ${placeholders}`,
                [idUsuario, ...tagIds]
            );
        }

        // Recalcular embedding
        const newEmbedding = await calcularEmbedding(tagIds);
        await client.query(
            'UPDATE perfil_adoptante SET embedding = $1 WHERE id_usuario = $2',
            [newEmbedding, idUsuario]
        );

        // Auditoría
        await client.query(
            `INSERT INTO log_auditoria (id_autor, accion, entidad_afectada, id_registro_afectado, valor_anterior, valor_nuevo, ip, fecha)
             VALUES ($1, 'ACTUALIZACION_ETIQUETAS_ADOPTANTE', 'adoptante_tag', $2, $3, $4, $5, NOW())`,
            [
                idUsuario, 
                idPerfil, 
                JSON.stringify({ tags: viejosIds }), 
                JSON.stringify({ tags: tagIds }), 
                ip
            ]
        );

        await client.query('COMMIT');
        return { success: true, data: { tags: tagIds } };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[adoptante.service] actualizarEtiquetas:', err.message);
        throw err;
    } finally {
        client.release();
    }
};

module.exports = { crearPerfilAdoptante, obtenerPerfilAdoptante, actualizarPerfilAdoptante, actualizarEtiquetasAdoptante };
