const pool = require('../config/db');
const { uploadImage, deleteImage } = require('./storageService');
const { calcularEmbedding } = require('./embeddingService');

const normalizeIsoDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
};

const arrayEquals = (a = [], b = []) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
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

const crearMascota = async (idAlbergue, authUserId, { nombre, descripcion, fotos, tagsIds }, clientIp) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const resMascota = await client.query(
            `INSERT INTO Mascota (id_albergue, nombre, descripcion, estado_adopcion)
             VALUES ($1, $2, $3, 'disponible')
             RETURNING id_mascota`,
            [idAlbergue, nombre, descripcion]
        );
        const idMascota = resMascota.rows[0].id_mascota;

        const fotosUrls = [];
        for (let i = 0; i < fotos.length; i++) {
            const urlSegura = await uploadImage(fotos[i], 'adopcion/mascotas');
            await client.query(
                'INSERT INTO Mascota_Foto (id_mascota, url_foto, orden) VALUES ($1, $2, $3)',
                [idMascota, urlSegura, i]
            );
            fotosUrls.push({ url: urlSegura, orden: i });
        }

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
                'INSERT INTO Mascota_Tag (id_mascota, id_opcion) VALUES ($1, $2)',
                [idMascota, tag.id_opcion]
            );
        }

        const vectorEmbedding = await calcularEmbedding(tagsIds);

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

const obtenerMascotaPorId = async (idMascota) => {
    const mascotaRes = await pool.query(
        `SELECT m.id_mascota, m.nombre, m.descripcion, m.estado_adopcion, m.fecha_publicacion,
                a.id_usuario AS id_albergue, a.nombre_albergue, a.logo
         FROM Mascota m
         JOIN Albergue a ON m.id_albergue = a.id_usuario
         WHERE m.id_mascota = $1 AND m.deleted_at IS NULL`,
        [idMascota]
    );

    if (mascotaRes.rows.length === 0) {
        return null;
    }

    const mascota = mascotaRes.rows[0];

    const fotosRes = await pool.query(
        `SELECT id_foto, url_foto, orden
         FROM Mascota_Foto
         WHERE id_mascota = $1
         ORDER BY orden ASC`,
        [idMascota]
    );
    mascota.fotos = fotosRes.rows;

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

const actualizarMascota = async ({ id_mascota, id_albergue, data, ip }) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const mascotaRes = await client.query(
            'SELECT * FROM Mascota WHERE id_mascota = $1 AND deleted_at IS NULL FOR UPDATE',
            [id_mascota]
        );

        if (mascotaRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, status: 404, message: 'Mascota no encontrada.' };
        }

        const mascota = mascotaRes.rows[0];

        if (mascota.id_albergue !== id_albergue) {
            await client.query('ROLLBACK');
            return { success: false, status: 403, message: 'No tienes permiso para editar esta mascota.' };
        }

        if (mascota.estado_adopcion === 'adoptado') {
            await client.query('ROLLBACK');
            return { success: false, status: 400, message: 'No se puede editar una mascota que ya fue adoptada.' };
        }

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

        if (data.fotos_eliminadas && data.fotos_eliminadas.length > 0) {
            for (const foto of fotosEliminadasValidas) {
                await deleteImage(foto.url_foto, 'adopcion/mascotas');
            }

            await client.query(
                'DELETE FROM Mascota_Foto WHERE id_foto = ANY($1) AND id_mascota = $2',
                [data.fotos_eliminadas, id_mascota]
            );
        }

        if (data.fotos && data.fotos.length > 0) {
            for (const foto of data.fotos) {
                if (foto.base64) {
                    const secureUrl = await uploadImage(foto.base64, 'adopcion/mascotas');
                    await client.query(
                        'INSERT INTO Mascota_Foto (id_mascota, url_foto, orden) VALUES ($1, $2, $3)',
                        [id_mascota, secureUrl, foto.orden]
                    );
                } else if (foto.id_foto) {
                    await client.query(
                        'UPDATE Mascota_Foto SET orden = $1 WHERE id_foto = $2 AND id_mascota = $3',
                        [foto.orden, foto.id_foto, id_mascota]
                    );
                }
            }
        }

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
            await client.query('DELETE FROM Mascota_Tag WHERE id_mascota = $1', [id_mascota]);

            if (tagsUnicos.length > 0) {
                const placeholders = tagsUnicos.map((_, i) => `($1, $${i + 2})`).join(', ');
                await client.query(
                    `INSERT INTO Mascota_Tag (id_mascota, id_opcion) VALUES ${placeholders}`,
                    [id_mascota, ...tagsUnicos]
                );
            }

            if (!arrayEquals([...tagsAntes].sort(), [...tagsDespues].sort())) {
                await calcularEmbedding(tagsUnicos);
                embeddingRecalculado = true;
            }
        }

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

const cambiarEstadoMascota = async (idMascota, idAlbergue, nuevoEstado, motivo, clientIp) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const mascotaRes = await client.query(
            `SELECT id_mascota, id_albergue, estado_adopcion, nombre
             FROM Mascota
             WHERE id_mascota = $1 AND deleted_at IS NULL FOR UPDATE`,
            [idMascota]
        );

        if (mascotaRes.rows.length === 0) {
            throw new Error('Mascota no encontrada o ha sido eliminada.');
        }

        const mascota = mascotaRes.rows[0];

        if (mascota.id_albergue !== idAlbergue) {
            throw new Error('No tienes permiso para modificar esta mascota.');
        }

        const estadoActual = mascota.estado_adopcion;
        const transicionesPermitidas = {
            disponible: ['en_proceso', 'oculto', 'inactivo', 'archivado'],
            en_proceso: ['adoptado', 'disponible', 'oculto', 'inactivo', 'archivado'],
            adoptado: ['oculto'],
            oculto: ['disponible', 'en_proceso', 'adoptado'],
            inactivo: ['disponible'],
            archivado: ['disponible']
        };

        if (estadoActual === nuevoEstado) {
            await client.query('ROLLBACK');
            return { id_mascota: idMascota, estado: estadoActual, message: 'La mascota ya se encuentra en ese estado' };
        }

        const permitidos = transicionesPermitidas[estadoActual] || [];
        if (!permitidos.includes(nuevoEstado) && !['oculto', 'inactivo', 'archivado'].includes(nuevoEstado)) {
            throw new Error(`Transición de estado no permitida: de '${estadoActual}' a '${nuevoEstado}'.`);
        }

        await client.query(
            'UPDATE Mascota SET estado_adopcion = $1, updated_at = NOW() WHERE id_mascota = $2',
            [nuevoEstado, idMascota]
        );

        if (nuevoEstado === 'adoptado') {
            const adoptantesRes = await client.query(
                'SELECT DISTINCT id_adoptante FROM Match WHERE id_mascota = $1',
                [idMascota]
            );

            for (const row of adoptantesRes.rows) {
                await client.query(
                    `INSERT INTO Notificacion (id_usuario, tipo_notificacion, mensaje, recurso_id)
                     VALUES ($1, $2, $3, $4)`,
                    [
                        row.id_adoptante,
                        'mascota_adoptada',
                        `La mascota ${mascota.nombre} ya encontró un hogar.`,
                        idMascota
                    ]
                );
            }
        }

        await client.query(
            `INSERT INTO Log_Auditoria
                (id_autor, accion, entidad_afectada, id_registro_afectado, valor_anterior, valor_nuevo, ip)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                idAlbergue,
                'cambio_estado_mascota',
                'Mascota',
                idMascota,
                { estado: estadoActual },
                { estado: nuevoEstado, motivo: motivo || null },
                clientIp
            ]
        );

        await client.query('COMMIT');
        return {
            id_mascota: idMascota,
            estado_anterior: estadoActual,
            nuevo_estado: nuevoEstado
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[mascotaService] Error en cambiarEstadoMascota:', error);
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    crearMascota,
    obtenerMascotaPorId,
    actualizarMascota,
    cambiarEstadoMascota
};
