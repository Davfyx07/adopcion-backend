const pool = require('../config/db');
const { uploadImage } = require('./storageService');
const { calcularEmbedding } = require('./embeddingService');

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
 * Cambiar el estado de una mascota y manejar la lógica de notificaciones y matches
 */
const cambiarEstadoMascota = async (idMascota, idAlbergue, nuevoEstado, motivo, clientIp) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Obtener mascota y verificar propiedad
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

        // 2. Validar transición
        const transicionesPermitidas = {
            'disponible': ['en_proceso', 'oculto', 'inactivo', 'archivado'],
            'en_proceso': ['adoptado', 'disponible', 'oculto', 'inactivo', 'archivado'],
            'adoptado': ['oculto'], // No puede volver a disponible, registro inmutable para historial
            'oculto': ['disponible', 'en_proceso', 'adoptado'], // Puede restaurarse
            'inactivo': ['disponible'],
            'archivado': ['disponible']
        };

        if (estadoActual === nuevoEstado) {
            await client.query('ROLLBACK');
            return { id_mascota: idMascota, estado: estadoActual, message: 'La mascota ya se encuentra en ese estado' };
        }

        const permitidos = transicionesPermitidas[estadoActual] || [];
        if (!permitidos.includes(nuevoEstado)) {
            // Permitimos "Cualquiera -> Oculto/Inactivo/Archivado" como regla general si no está explícito
            if (!['oculto', 'inactivo', 'archivado'].includes(nuevoEstado)) {
                throw new Error(`Transición de estado no permitida: de '${estadoActual}' a '${nuevoEstado}'.`);
            }
        }

        // 3. Actualizar estado de la mascota
        await client.query(
            `UPDATE Mascota SET estado_adopcion = $1, updated_at = NOW() WHERE id_mascota = $2`,
            [nuevoEstado, idMascota]
        );

        // 4. Lógica de adopción (Notificaciones y Matches)
        if (nuevoEstado === 'adoptado') {
            // Buscamos matches pendientes o en proceso
            // Asumimos existencia de tabla Match_Adopcion o similar (ajustar nombre si difiere)
            // Para prevenir errores si la tabla no existe en la BD actual, capturamos la excepción específica de BD si es necesario, pero lo ideal es ejecutarlo si existe.
            try {
                const matchesRes = await client.query(
                    `SELECT id_match, id_adoptante 
                     FROM Match_Adopcion 
                     WHERE id_mascota = $1 AND estado IN ('pendiente', 'en_proceso')`,
                    [idMascota]
                );

                if (matchesRes.rows.length > 0) {
                    const idsAdoptantes = matchesRes.rows.map(m => m.id_adoptante);
                    
                    // Actualizar estado de matches a cancelado
                    await client.query(
                        `UPDATE Match_Adopcion SET estado = 'cancelado', updated_at = NOW() WHERE id_mascota = $1 AND estado IN ('pendiente', 'en_proceso')`,
                        [idMascota]
                    );

                    // Insertar notificaciones
                    for (const idAdoptante of idsAdoptantes) {
                        // TODO: Reemplazar con Event Emitter (Socket.io) para notificaciones en tiempo real
                        await client.query(
                            `INSERT INTO Notificacion (id_usuario, titulo, mensaje, tipo, leido) 
                             VALUES ($1, $2, $3, $4, false)`,
                            [
                                idAdoptante,
                                'Mascota Adoptada',
                                `La mascota ${mascota.nombre} que te interesaba ha sido adoptada por otra familia.`,
                                'sistema'
                            ]
                        );
                    }
                }
            } catch (dbError) {
                // Si la tabla Match_Adopcion o Notificacion no existe aún en la base de datos de desarrollo
                if (dbError.code === '42P01') {
                    console.warn('[mascotaService] Tablas de Match o Notificacion no encontradas, ignorando notificaciones.', dbError.message);
                } else {
                    throw dbError; // Otro error de BD
                }
            }
        }

        // 5. Registro de Auditoría
        await client.query(
            `INSERT INTO Log_Auditoria 
                (id_autor, accion, entidad_afectada, id_registro_afectado, valor_anterior, valor_nuevo, ip)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                idAlbergue, // autor
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

module.exports = { crearMascota, obtenerMascotaPorId, cambiarEstadoMascota };
