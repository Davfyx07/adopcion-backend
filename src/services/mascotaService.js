const pool = require('../config/db');
const { uploadImage, deleteImage } = require('./storageService');
const { calcularEmbedding } = require('./embeddingService');

const normalizeIsoDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date.toISOString();
};

const arrayEquals = (a = [], b = []) => {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
};

const computeUpdatedFields = ({ mascotaAntes, data, fotosAntes, fotosDespues, tagsAntes, tagsDespues }) => {
    const changes = {};

    if (data.nombre !== undefined && data.nombre !== mascotaAntes.nombre) {
        changes.nombre = { anterior: mascotaAntes.nombre, nuevo: data.nombre };
    }
    if (data.descripcion !== undefined && data.descripcion !== mascotaAntes.descripcion) {
        changes.descripcion = { anterior: mascotaAntes.descripcion, nuevo: data.descripcion };
    }
    if (data.estado_adopcion !== undefined && data.estado_adopcion !== mascotaAntes.estado_adopcion) {
        changes.estado_adopcion = { anterior: mascotaAntes.estado_adopcion, nuevo: data.estado_adopcion };
    }

    const sortedTagsAntes = [...tagsAntes].sort();
    const sortedTagsDespues = [...tagsDespues].sort();
    if (!arrayEquals(sortedTagsAntes, sortedTagsDespues)) {
        changes.tagsIds = { anterior: sortedTagsAntes, nuevo: sortedTagsDespues };
    }

    const fotosAntesMap = new Map(fotosAntes.map((foto) => [foto.id_foto, foto.orden]));
    const fotosDespuesMap = new Map(fotosDespues.map((foto) => [foto.id_foto, foto.orden]));

    const fotosAgregadas = fotosDespues.filter((foto) => !fotosAntesMap.has(foto.id_foto));
    const fotosEliminadas = fotosAntes.filter((foto) => !fotosDespuesMap.has(foto.id_foto));
    const fotosReordenadas = fotosDespues
        .filter((foto) => fotosAntesMap.has(foto.id_foto) && fotosAntesMap.get(foto.id_foto) !== foto.orden)
        .map((foto) => ({ id_foto: foto.id_foto, orden_anterior: fotosAntesMap.get(foto.id_foto), orden_nuevo: foto.orden }));

    if (fotosAgregadas.length > 0 || fotosEliminadas.length > 0 || fotosReordenadas.length > 0) {
        changes.fotos = {
            agregadas: fotosAgregadas.map((foto) => ({ id_foto: foto.id_foto, orden: foto.orden })),
            eliminadas: fotosEliminadas.map((foto) => ({ id_foto: foto.id_foto, orden: foto.orden })),
            reordenadas: fotosReordenadas
        };
    }

    return changes;
};

/**
 * Crea una nueva mascota transaccionalmente:
 * 1. Inserta la mascota.
 * 2. Sube las fotos a Cloudinary e inserta sus URLs.
 * 3. Valida y asocia los tags.
 * 4. Calcula el embedding.
 * 5. Registra auditoría.
 */
const crearMascota = async (idAlbergue, authUserId, { nombre, descripcion, fotos, tagsIds }, clientIp) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Insertar mascota
        const resMascota = await client.query(
            `INSERT INTO Mascota (id_albergue, nombre, descripcion, estado_adopcion)
             VALUES ($1, $2, $3, 'disponible')
             RETURNING id_mascota`,
            [idAlbergue, nombre, descripcion]
        );
        const idMascota = resMascota.rows[0].id_mascota;

        // 2. Subir fotos a Cloudinary e insertar
        const fotosUrls = [];
        for (let i = 0; i < fotos.length; i++) {
            const urlSegura = await uploadImage(fotos[i], 'adopcion/mascotas');
            await client.query(
                `INSERT INTO Mascota_Foto (id_mascota, url_foto, orden) VALUES ($1, $2, $3)`,
                [idMascota, urlSegura, i]
            );
            fotosUrls.push({ url: urlSegura, orden: i });
        }

        // 3. Validar tags y asociarlos
        // Verificamos si los tags proporcionados existen
        const placeholders = tagsIds.map((_, i) => `$${i + 1}`).join(', ');
        const resTags = await client.query(
            `SELECT id_opcion FROM Opcion_Tag WHERE id_opcion IN (${placeholders})`,
            tagsIds
        );

        if (resTags.rows.length !== tagsIds.length) {
            throw new Error('Uno o más tagsIds proporcionados no son válidos o no existen.');
        }

        for (const tag of resTags.rows) {
            await client.query(
                `INSERT INTO Mascota_Tag (id_mascota, id_opcion) VALUES ($1, $2)`,
                [idMascota, tag.id_opcion]
            );
        }

        // 4. Calcular embedding (solicitado según requerimientos calculo, pero no guarda en bd aún)
        const vectorEmbedding = await calcularEmbedding(tagsIds);
        // Aquí se guardaría el embedding si la columna existiera, por ej:
        // await client.query(`UPDATE Mascota SET embedding = $1 WHERE id_mascota = $2`, [vectorEmbedding, idMascota]);

        // 5. Auditoría
        await client.query(
            `INSERT INTO Log_Auditoria 
                (id_autor, accion, entidad_afectada, id_registro_afectado, valor_nuevo, ip)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                authUserId,
                'creacion_mascota',
                'Mascota',
                idMascota,
                { nombre, id_albergue: idAlbergue, tags_asociados: tagsIds.length, fotos: fotos.length, vector_calculado: vectorEmbedding.length > 0 },
                clientIp
            ]
        );

        await client.query('COMMIT');

        return {
            id_mascota: idMascota,
            nombre,
            descripcion,
            estado_adopcion: 'disponible',
            fotos: fotosUrls
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[mascotaService] Error en crearMascota:', error);
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Obtener detalle de mascota (Previsualización Pública)
 */
const obtenerMascotaPorId = async (idMascota) => {
    // Info principal de la mascota con su albergue
    const mascotaRes = await pool.query(
        `SELECT m.id_mascota, m.nombre, m.descripcion, m.estado_adopcion, m.fecha_publicacion,
                a.id_usuario AS id_albergue, a.nombre_albergue, a.logo
         FROM Mascota m
         JOIN Albergue a ON m.id_albergue = a.id_usuario
         WHERE m.id_mascota = $1 AND m.deleted_at IS NULL`,
        [idMascota]
    );

    if (mascotaRes.rows.length === 0) {
        return null; // No existe o fue borrada
    }

    const mascota = mascotaRes.rows[0];

    // Obtener fotos
    const fotosRes = await pool.query(
        `SELECT id_foto, url_foto, orden 
         FROM Mascota_Foto 
         WHERE id_mascota = $1 
         ORDER BY orden ASC`,
        [idMascota]
    );
    mascota.fotos = fotosRes.rows;

    // Obtener tags
    const tagsRes = await pool.query(
        `SELECT o.id_opcion, o.valor, t.nombre_tag, t.categoria 
         FROM Mascota_Tag mt
         JOIN Opcion_Tag o ON mt.id_opcion = o.id_opcion
         JOIN Tag t ON o.id_tag = t.id_tag
         WHERE mt.id_mascota = $1`,
        [idMascota]
    );
    mascota.tags = tagsRes.rows;

    return mascota;
};

/**
 * HU-MA-02: Actualización completa de mascota con Bloqueo Optimista
 * IMPORTANTE: Requiere que se agregue la columna 'updated_at' a la tabla Mascota.
 */
const actualizarMascota = async ({ id_mascota, id_albergue, data, ip }) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Obtener mascota FOR UPDATE
        const mascotaRes = await client.query(
            `SELECT * FROM Mascota WHERE id_mascota = $1 AND deleted_at IS NULL FOR UPDATE`,
            [id_mascota]
        );

        if (mascotaRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 404, message: 'Mascota no encontrada.' };
        }

        const mascota = mascotaRes.rows[0];

        // 2. Validar pertenencia al albergue
        if (mascota.id_albergue !== id_albergue) {
            await client.query('ROLLBACK');
            return { success: false, status: 403, message: 'No tienes permiso para editar esta mascota.' };
        }

        // 3. Validar estado (No se puede editar si está adoptado)
        if (mascota.estado_adopcion === 'adoptado') {
            await client.query('ROLLBACK');
            return { success: false, status: 400, message: 'No se puede editar una mascota que ya fue adoptada.' };
        }

        // 4. Bloqueo Optimista (Optimistic Concurrency Control)
        const dbUpdatedAt = normalizeIsoDate(mascota.updated_at);
        const clientUpdatedAt = normalizeIsoDate(data.updated_at);
        if (!clientUpdatedAt) {
            await client.query('ROLLBACK');
            return { success: false, status: 400, message: 'El campo updated_at es inválido.' };
        }

        if (dbUpdatedAt !== clientUpdatedAt) {
            await client.query('ROLLBACK');
            return {
                success: false,
                status: 409,
                message: 'Este perfil fue modificado por otro usuario. Actualiza la información antes de guardar nuevamente.'
            };
        }

        const tagsActualesRes = await client.query('SELECT id_opcion FROM Mascota_Tag WHERE id_mascota = $1', [id_mascota]);
        const tagsAntes = tagsActualesRes.rows.map((row) => row.id_opcion);

        // 5. Gestión de Fotos
        const fotosActualesRes = await client.query('SELECT id_foto, url_foto, orden FROM Mascota_Foto WHERE id_mascota = $1', [id_mascota]);
        const fotosActuales = fotosActualesRes.rows;

        const fotosEliminadasValidas = Array.isArray(data.fotos_eliminadas)
            ? fotosActuales.filter((foto) => data.fotos_eliminadas.includes(foto.id_foto))
            : [];
        const cantFotosTrasEliminar = fotosActuales.length - fotosEliminadasValidas.length;
        const nuevasFotos = Array.isArray(data.fotos) ? data.fotos.filter((foto) => foto.base64) : [];

        if ((cantFotosTrasEliminar + nuevasFotos.length) < 1) {
            await client.query('ROLLBACK');
            return { success: false, status: 400, message: 'La mascota debe tener al menos una foto.' };
        }

        // Eliminar fotos si se solicita
        if (data.fotos_eliminadas && data.fotos_eliminadas.length > 0) {
            const fotosABorrar = fotosEliminadasValidas;
            
            for (const foto of fotosABorrar) {
                await deleteImage(foto.url_foto, 'adopcion/mascotas');
            }

            await client.query(
                'DELETE FROM Mascota_Foto WHERE id_foto = ANY($1) AND id_mascota = $2',
                [data.fotos_eliminadas, id_mascota]
            );
        }

        // Procesar fotos recibidas en el body (nuevas en base64 o reordenamiento de existentes)
        if (data.fotos && data.fotos.length > 0) {
            for (const foto of data.fotos) {
                if (foto.base64) {
                    // Es una foto nueva
                    const secureUrl = await uploadImage(foto.base64, 'adopcion/mascotas');
                    await client.query(
                        'INSERT INTO Mascota_Foto (id_mascota, url_foto, orden) VALUES ($1, $2, $3)',
                        [id_mascota, secureUrl, foto.orden]
                    );
                } else if (foto.id_foto) {
                    // Es una foto existente, solo actualiza el orden
                    await client.query(
                        'UPDATE Mascota_Foto SET orden = $1 WHERE id_foto = $2 AND id_mascota = $3',
                        [foto.orden, foto.id_foto, id_mascota]
                    );
                }
            }
        }

        // 6. Actualización de Tags y recálculo de Embedding
        let tagsDespues = tagsAntes;
        let embeddingRecalculado = false;
        if (data.tagsIds) {
            const tagsUnicos = [...new Set(data.tagsIds)];

            if (tagsUnicos.length > 0) {
                const placeholders = tagsUnicos.map((_, i) => `$${i + 1}`).join(', ');
                const tagsValidosRes = await client.query(
                    `SELECT id_opcion FROM Opcion_Tag WHERE id_opcion IN (${placeholders})`,
                    tagsUnicos
                );

                if (tagsValidosRes.rows.length !== tagsUnicos.length) {
                    await client.query('ROLLBACK');
                    return { success: false, status: 400, message: 'Uno o más tagsIds proporcionados no son válidos o no existen.' };
                }
            }

            tagsDespues = tagsUnicos;

            // Eliminar actuales
            await client.query('DELETE FROM Mascota_Tag WHERE id_mascota = $1', [id_mascota]);
            
            // Insertar nuevos
            if (tagsUnicos.length > 0) {
                const placeholders = tagsUnicos.map((_, i) => `($1, $${i + 2})`).join(', ');
                await client.query(
                    `INSERT INTO Mascota_Tag (id_mascota, id_opcion) VALUES ${placeholders}`,
                    [id_mascota, ...tagsUnicos]
                );
            }

            const tagsAntesOrdenados = [...tagsAntes].sort();
            const tagsDespuesOrdenados = [...tagsDespues].sort();
            if (!arrayEquals(tagsAntesOrdenados, tagsDespuesOrdenados)) {
                await calcularEmbedding(tagsUnicos);
                embeddingRecalculado = true;
            }
        }

        // 7. Actualizar datos base de la mascota
        const updatedRes = await client.query(
            `UPDATE Mascota SET 
                nombre = COALESCE($1, nombre),
                descripcion = COALESCE($2, descripcion),
                estado_adopcion = COALESCE($3, estado_adopcion),
                updated_at = NOW()
             WHERE id_mascota = $4 RETURNING *`,
            [
                data.nombre ?? null, 
                data.descripcion ?? null, 
                data.estado_adopcion ?? null, 
                id_mascota
            ]
        );
        const mascotaActualizada = updatedRes.rows[0];

        const fotosFinalesRes = await client.query(
            'SELECT id_foto, orden FROM Mascota_Foto WHERE id_mascota = $1 ORDER BY orden ASC',
            [id_mascota]
        );

        const camposModificados = computeUpdatedFields({
            mascotaAntes: mascota,
            data,
            fotosAntes: fotosActuales,
            fotosDespues: fotosFinalesRes.rows,
            tagsAntes,
            tagsDespues
        });

        // 8. Auditoría
        await client.query(
            `INSERT INTO Log_Auditoria (id_autor, accion, entidad_afectada, id_registro_afectado, valor_anterior, valor_nuevo, ip, fecha)
             VALUES ($1, 'UPDATE_MASCOTA', 'Mascota', $2, $3, $4, $5, NOW())`,
            [
                id_albergue, 
                id_mascota, 
                JSON.stringify({
                    nombre: mascota.nombre,
                    descripcion: mascota.descripcion,
                    estado_adopcion: mascota.estado_adopcion,
                    updated_at: mascota.updated_at,
                    tagsIds: tagsAntes,
                    fotos: fotosActuales.map((foto) => ({ id_foto: foto.id_foto, orden: foto.orden }))
                }),
                JSON.stringify({
                    nombre: mascotaActualizada.nombre,
                    descripcion: mascotaActualizada.descripcion,
                    estado_adopcion: mascotaActualizada.estado_adopcion,
                    updated_at: mascotaActualizada.updated_at,
                    tagsIds: tagsDespues,
                    fotos: fotosFinalesRes.rows,
                    campos_modificados: Object.keys(camposModificados),
                    diff: camposModificados,
                    embedding_recalculado: embeddingRecalculado
                }),
                ip
            ]
        );

        await client.query('COMMIT');
        return { success: true, data: mascotaActualizada };

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[mascotaService] actualizarMascota:', err.message);
        throw err;
    } finally {
        client.release();
    }
};

module.exports = { crearMascota, obtenerMascotaPorId, actualizarMascota };
