const pool = require('../config/db');
const { uploadImage, validateBase64Image, deleteImage } = require('./storageService');
const { validarTagsObligatorios } = require('./etiquetaService');

/**
 * HU-US-01: Crea el perfil de un adoptante de forma atómica.
 * 
 * Adaptado al esquema real de BD:
 *   - Tabla: Adoptante (PK compartida con Usuario via id_usuario UUID)
 *   - Columnas: nombre_completo, foto_perfil, whatsapp_adoptante, ciudad
 *   - Tags: Adoptante_Tag (id_usuario, id_opcion) → referencia Opcion_Tag
 */
const crearPerfilAdoptante = async ({ idUsuario, nombre_completo, whatsapp, ciudad, tagIds, fotoBase64, ip }) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verificar rol adoptante
        const userResult = await client.query(
            `SELECT u.id_usuario, u.estado_cuenta, r.nombre_rol
             FROM Usuario u
             JOIN Rol r ON u.id_rol = r.id_rol
             WHERE u.id_usuario = $1 AND u.deleted_at IS NULL`,
            [idUsuario]
        );

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 404, message: 'Usuario no encontrado.' };
        }

        const user = userResult.rows[0];

        if (user.nombre_rol.toLowerCase() !== 'adoptante') {
            await client.query('ROLLBACK');
            return {
                success: false,
                status: 403,
                message: 'Solo los usuarios con rol adoptante pueden crear un perfil de adoptante.',
            };
        }

        if (user.estado_cuenta !== 'perfil_incompleto') {
            await client.query('ROLLBACK');
            return { success: false, status: 409, message: 'Tu perfil ya fue completado anteriormente.' };
        }

        // 2. Verificar que no tenga perfil creado (doble check)
        const perfilExistente = await client.query(
            'SELECT id_usuario FROM Adoptante WHERE id_usuario = $1',
            [idUsuario]
        );

        if (perfilExistente.rows.length > 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 409, message: 'Ya tienes un perfil de adoptante creado.' };
        }

        // 3. Validar tags obligatorios (al menos 1 opción por cada Tag con es_filtro_absoluto)
        if (tagIds && tagIds.length > 0) {
            const validacion = await validarTagsObligatorios(tagIds, client);
            if (!validacion.valid) {
                await client.query('ROLLBACK');
                return {
                    success: false,
                    status: 400,
                    message: 'Debes seleccionar al menos una opción de cada categoría obligatoria.',
                    data: { tags_faltantes: validacion.tagsFaltantes },
                };
            }

            // 4. Validar que los IDs de opciones existen en Opcion_Tag
            const validTagsResult = await client.query(
                'SELECT COUNT(*) AS total FROM Opcion_Tag WHERE id_opcion = ANY($1)',
                [tagIds]
            );
            if (parseInt(validTagsResult.rows[0].total) !== tagIds.length) {
                await client.query('ROLLBACK');
                return { success: false, status: 400, message: 'Una o más opciones seleccionadas no existen.' };
            }
        }

        // 5. Validar y subir foto si se proporciona
        let fotoUrl = null;
        if (fotoBase64) {
            const validacionFoto = validateBase64Image(fotoBase64);
            if (!validacionFoto.valid) {
                await client.query('ROLLBACK');
                return { success: false, status: 400, message: validacionFoto.message };
            }
            fotoUrl = await uploadImage(fotoBase64, 'adopcion/adoptantes');
        }

        // 6. Crear registro en tabla Adoptante (PK compartida con Usuario)
        await client.query(
            `INSERT INTO Adoptante (id_usuario, nombre_completo, foto_perfil, whatsapp_adoptante, ciudad)
             VALUES ($1, $2, $3, $4, $5)`,
            [idUsuario, nombre_completo.trim(), fotoUrl, whatsapp.trim(), ciudad.trim()]
        );

        // 7. Guardar tags en Adoptante_Tag
        if (tagIds && tagIds.length > 0) {
            const placeholders = tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
            await client.query(
                `INSERT INTO Adoptante_Tag (id_usuario, id_opcion) VALUES ${placeholders}`,
                [idUsuario, ...tagIds]
            );
        }

        // 8. Actualizar estado_cuenta a 'activo'
        await client.query(
            "UPDATE Usuario SET estado_cuenta = 'activo' WHERE id_usuario = $1",
            [idUsuario]
        );

        // 9. Log de auditoría
        await client.query(
            `INSERT INTO Log_Auditoria (id_autor, accion, entidad_afectada, id_registro_afectado, ip, fecha)
             VALUES ($1, 'CREACION_PERFIL_ADOPTANTE', 'Adoptante', $1, $2, NOW())`,
            [idUsuario, ip]
        );

        await client.query('COMMIT');

        return {
            success: true,
            data: {
                id_usuario: idUsuario,
                nombre_completo: nombre_completo.trim(),
                whatsapp: whatsapp.trim(),
                ciudad: ciudad.trim(),
                foto_url: fotoUrl,
                tags: tagIds || [],
                estado_cuenta: 'activo',
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
 * HU-US-02: Obtiene el perfil de un adoptante incluyendo sus etiquetas.
 */
const obtenerPerfilAdoptante = async (idUsuario) => {
    const client = await pool.connect();
    try {
        const perfilResult = await client.query(
            'SELECT * FROM Adoptante WHERE id_usuario = $1',
            [idUsuario]
        );

        if (perfilResult.rows.length === 0) {
            return { success: false, status: 404, message: 'Perfil no encontrado.' };
        }

        const perfil = perfilResult.rows[0];

        const tagsResult = await client.query(
            `SELECT ot.id_opcion, ot.valor, t.nombre_tag AS categoria
             FROM Adoptante_Tag at_table
             JOIN Opcion_Tag ot ON at_table.id_opcion = ot.id_opcion
             JOIN Tag t ON ot.id_tag = t.id_tag
             WHERE at_table.id_usuario = $1`,
            [idUsuario]
        );

        return {
            success: true,
            data: {
                id_usuario: perfil.id_usuario,
                nombre_completo: perfil.nombre_completo,
                whatsapp: perfil.whatsapp_adoptante,
                ciudad: perfil.ciudad,
                foto_url: perfil.foto_perfil,
                etiquetas: tagsResult.rows,
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
 * HU-US-02: Actualiza los datos básicos del perfil (nombre, whatsapp, ciudad, foto).
 */
const actualizarPerfilAdoptante = async ({ idUsuario, nombre_completo, whatsapp, ciudad, fotoBase64, ip }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const perfilAnteriorResult = await client.query(
            'SELECT * FROM Adoptante WHERE id_usuario = $1 FOR UPDATE',
            [idUsuario]
        );

        if (perfilAnteriorResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 404, message: 'Perfil no encontrado.' };
        }

        const perfilAnterior = perfilAnteriorResult.rows[0];
        let nuevaFotoUrl = perfilAnterior.foto_perfil;
        let fotoViejaParaBorrar = null;

        if (fotoBase64) {
            const validacion = validateBase64Image(fotoBase64);
            if (!validacion.valid) {
                await client.query('ROLLBACK');
                return { success: false, status: 400, message: validacion.message };
            }
            nuevaFotoUrl = await uploadImage(fotoBase64, 'adopcion/adoptantes');
            fotoViejaParaBorrar = perfilAnterior.foto_perfil;
        }

        const result = await client.query(
            `UPDATE Adoptante 
             SET nombre_completo = $1, whatsapp_adoptante = $2, ciudad = $3, foto_perfil = $4
             WHERE id_usuario = $5 RETURNING *`,
            [nombre_completo.trim(), whatsapp.trim(), ciudad.trim(), nuevaFotoUrl, idUsuario]
        );

        const perfilActualizado = result.rows[0];

        // Auditoría con valor anterior y nuevo
        await client.query(
            `INSERT INTO Log_Auditoria (id_autor, accion, entidad_afectada, id_registro_afectado, valor_anterior, valor_nuevo, ip, fecha)
             VALUES ($1, 'ACTUALIZACION_PERFIL_ADOPTANTE', 'Adoptante', $1, $2, $3, $4, NOW())`,
            [
                idUsuario,
                JSON.stringify(perfilAnterior),
                JSON.stringify(perfilActualizado),
                ip
            ]
        );

        await client.query('COMMIT');

        // Borrar imagen vieja asincrónamente si se cambió
        if (fotoViejaParaBorrar && fotoViejaParaBorrar !== nuevaFotoUrl) {
            deleteImage(fotoViejaParaBorrar, 'adopcion/adoptantes').catch(e => console.error('Error deleting old image', e));
        }

        return { success: true, data: {
            id_usuario: perfilActualizado.id_usuario,
            nombre_completo: perfilActualizado.nombre_completo,
            whatsapp: perfilActualizado.whatsapp_adoptante,
            ciudad: perfilActualizado.ciudad,
            foto_url: perfilActualizado.foto_perfil,
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
 * HU-US-02: Actualiza únicamente las etiquetas (opciones de tags).
 */
const actualizarEtiquetasAdoptante = async ({ idUsuario, tagIds, ip }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const perfilResult = await client.query(
            'SELECT id_usuario FROM Adoptante WHERE id_usuario = $1 FOR UPDATE',
            [idUsuario]
        );

        if (perfilResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 404, message: 'Perfil no encontrado.' };
        }

        // Validar tags obligatorios
        const validacion = await validarTagsObligatorios(tagIds, client);
        if (!validacion.valid) {
            await client.query('ROLLBACK');
            return {
                success: false,
                status: 400,
                message: 'Debes seleccionar al menos una opción de cada categoría obligatoria.',
                data: { tags_faltantes: validacion.tagsFaltantes },
            };
        }

        // Validar que existen en el catálogo
        if (tagIds.length > 0) {
            const validTagsResult = await client.query(
                'SELECT COUNT(*) AS total FROM Opcion_Tag WHERE id_opcion = ANY($1)',
                [tagIds]
            );
            if (parseInt(validTagsResult.rows[0].total) !== tagIds.length) {
                await client.query('ROLLBACK');
                return { success: false, status: 400, message: 'Una o más opciones seleccionadas no existen.' };
            }
        }

        // Guardar tags anteriores para auditoría
        const tagsViejos = await client.query(
            'SELECT id_opcion FROM Adoptante_Tag WHERE id_usuario = $1',
            [idUsuario]
        );
        const viejosIds = tagsViejos.rows.map(r => r.id_opcion);

        // Borrar tags existentes y re-insertar
        await client.query('DELETE FROM Adoptante_Tag WHERE id_usuario = $1', [idUsuario]);

        if (tagIds.length > 0) {
            const placeholders = tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
            await client.query(
                `INSERT INTO Adoptante_Tag (id_usuario, id_opcion) VALUES ${placeholders}`,
                [idUsuario, ...tagIds]
            );
        }

        // Auditoría
        await client.query(
            `INSERT INTO Log_Auditoria (id_autor, accion, entidad_afectada, id_registro_afectado, valor_anterior, valor_nuevo, ip, fecha)
             VALUES ($1, 'ACTUALIZACION_ETIQUETAS_ADOPTANTE', 'Adoptante_Tag', $1, $2, $3, $4, NOW())`,
            [
                idUsuario,
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
