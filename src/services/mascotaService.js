const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const { uploadImage, deleteImage } = require('./storageService');
const { calcularEmbedding } = require('./embeddingService');

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

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
            reordenadas: fotosReordenadas,
        };
    }

    return changes;
};

// ──────────────────────────────────────────────
// HU-PM-01: Publicar Mascota
// ──────────────────────────────────────────────

const crearMascota = async (idAlbergue, authUserId, { nombre, descripcion, fotos, tagsIds }, clientIp) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // 1. Insertar mascota
            const mascota = await tx.mascota.create({
                data: {
                    id_albergue: idAlbergue,
                    nombre,
                    descripcion,
                    estado_adopcion: 'disponible',
                }
            });

            const idMascota = mascota.id_mascota;

            // 2. Subir y guardar fotos
            const fotosUrls = [];
            for (let i = 0; i < fotos.length; i++) {
                const urlSegura = await uploadImage(fotos[i], 'adopcion/mascotas');
                await tx.mascota_foto.create({
                    data: {
                        id_mascota: idMascota,
                        url_foto: urlSegura,
                        orden: i,
                    }
                });
                fotosUrls.push({ url: urlSegura, orden: i });
            }

            // 3. Validar y guardar tags
            if (tagsIds && tagsIds.length > 0) {
                const tagsValidos = await tx.opcion_tag.count({
                    where: { id_opcion: { in: tagsIds } }
                });

                if (tagsValidos !== tagsIds.length) {
                    throw new Error('Uno o más tagsIds proporcionados no son válidos o no existen.');
                }

                await tx.mascota_tag.createMany({
                    data: tagsIds.map(id_opcion => ({
                        id_mascota: idMascota,
                        id_opcion,
                    })),
                });
            }

            // 4. Calcular embedding
            const vectorEmbedding = await calcularEmbedding(tagsIds || []);

            // 5. Log de auditoría
            await tx.log_auditoria.create({
                data: {
                    id_autor: authUserId,
                    accion: 'creacion_mascota',
                    entidad_afectada: 'Mascota',
                    id_registro_afectado: idMascota,
                    valor_nuevo: JSON.stringify({
                        nombre,
                        id_albergue: idAlbergue,
                        tags_asociados: (tagsIds || []).length,
                        fotos: fotos.length,
                        vector_calculado: vectorEmbedding.length > 0,
                    }),
                    ip: clientIp,
                }
            });

            return {
                id_mascota: idMascota,
                nombre,
                descripcion,
                estado_adopcion: 'disponible',
                fotos: fotosUrls,
            };
        });
    } catch (error) {
        console.error('[mascotaService] Error en crearMascota:', error);
        throw error;
    }
};

// ──────────────────────────────────────────────
// HU-PM-02: Obtener detalle de mascota
// ──────────────────────────────────────────────

const obtenerMascotaPorId = async (idMascota) => {
    try {
        const mascota = await prisma.mascota.findUnique({
            where: { id_mascota: idMascota },
            include: {
                albergue: {
                    select: {
                        id_usuario: true,
                        nombre_albergue: true,
                        logo: true,
                    }
                },
                mascota_foto: {
                    orderBy: { orden: 'asc' },
                    select: { id_foto: true, url_foto: true, orden: true }
                },
                mascota_tag: {
                    include: {
                        opcion_tag: {
                            include: {
                                tag: true
                            }
                        }
                    }
                }
            }
        });

        if (!mascota) {
            return null;
        }

        return {
            id_mascota: mascota.id_mascota,
            nombre: mascota.nombre,
            descripcion: mascota.descripcion,
            estado_adopcion: mascota.estado_adopcion,
            fecha_publicacion: mascota.fecha_publicacion,
            id_albergue: mascota.albergue.id_usuario,
            nombre_albergue: mascota.albergue.nombre_albergue,
            logo: mascota.albergue.logo,
            fotos: mascota.mascota_foto,
            tags: mascota.mascota_tag.map(mt => ({
                id_opcion: mt.id_opcion,
                valor: mt.opcion_tag.valor,
                nombre_tag: mt.opcion_tag.tag.nombre_tag,
                categoria: mt.opcion_tag.tag.categoria,
            })),
        };
    } catch (err) {
        console.error('[mascotaService] obtenerMascotaPorId:', err.message);
        throw err;
    }
};

// ──────────────────────────────────────────────
// HU-PM-03: Actualizar Mascota
//
// DECISIÓN TÉCNICA — Concurrencia (Fase 5.3):
//
// El código original usaba SELECT ... FOR UPDATE + optimistic locking
// con updated_at. Prisma no soporta FOR UPDATE nativamente.
// Opciones consideradas:
//   (a) $queryRaw con FOR UPDATE — simple, mantiene el lock pesimista
//   (b) Optimistic locking con updated_at — evita raw queries
//
// Se eligió la opción (b) — Optimistic Locking:
//   - La función ya tenía el chequeo de updated_at del lado cliente
//   - El cliente envía el updated_at que conoce, el servidor verifica
//     que coincida con la BD antes de escribir
//   - Si no coincide → 409 Conflict (modificado por otro usuario)
//   - La transacción de Prisma con isolation Read Committed es
//     suficiente porque la validación de updated_at actúa como guarda
//   - Se evita SQL crudo innecesario, el código permanece en Prisma puro
//
// Para funciones con máquina de estados (cambiarEstadoMascota) se usa
// FOR UPDATE con $queryRaw porque la integridad de la transición de
// estados es crítica.
// ──────────────────────────────────────────────

const actualizarMascota = async ({ id_mascota, id_albergue, data, ip }) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // Leer mascota (sin FOR UPDATE — usamos optimistic locking)
            const mascota = await tx.mascota.findUnique({
                where: { id_mascota: id_mascota }
            });

            if (!mascota) {
                return { success: false, status: 404, message: 'Mascota no encontrada.' };
            }

            if (mascota.id_albergue !== id_albergue) {
                return { success: false, status: 403, message: 'No tienes permiso para editar esta mascota.' };
            }

            if (mascota.estado_adopcion === 'adoptado') {
                return { success: false, status: 400, message: 'No se puede editar una mascota que ya fue adoptada.' };
            }

            // Optimistic locking: verificar updated_at
            const dbUpdatedAt = normalizeIsoDate(mascota.updated_at);
            const clientUpdatedAt = normalizeIsoDate(data.updated_at);
            if (!clientUpdatedAt) {
                return { success: false, status: 400, message: 'El campo updated_at es inválido.' };
            }

            if (dbUpdatedAt !== clientUpdatedAt) {
                return {
                    success: false,
                    status: 409,
                    message: 'Este perfil fue modificado por otro usuario. Actualiza la información antes de guardar nuevamente.',
                };
            }

            // Tags actuales
            const tagsActualesRes = await tx.mascota_tag.findMany({
                where: { id_mascota: id_mascota },
                select: { id_opcion: true }
            });
            const tagsAntes = tagsActualesRes.map((row) => row.id_opcion);

            // Fotos actuales
            const fotosActuales = await tx.mascota_foto.findMany({
                where: { id_mascota: id_mascota },
                orderBy: { orden: 'asc' }
            });

            // Procesar eliminación de fotos
            const fotosEliminadasValidas = Array.isArray(data.fotos_eliminadas)
                ? fotosActuales.filter((foto) => data.fotos_eliminadas.includes(foto.id_foto))
                : [];
            const cantFotosTrasEliminar = fotosActuales.length - fotosEliminadasValidas.length;
            const nuevasFotos = Array.isArray(data.fotos) ? data.fotos.filter((foto) => foto.base64) : [];

            if ((cantFotosTrasEliminar + nuevasFotos.length) < 1) {
                return { success: false, status: 400, message: 'La mascota debe tener al menos una foto.' };
            }

            // Eliminar fotos marcadas
            if (data.fotos_eliminadas && data.fotos_eliminadas.length > 0) {
                for (const foto of fotosEliminadasValidas) {
                    await deleteImage(foto.url_foto, 'adopcion/mascotas');
                }

                await tx.mascota_foto.deleteMany({
                    where: {
                        id_foto: { in: data.fotos_eliminadas },
                        id_mascota: id_mascota,
                    }
                });
            }

            // Agregar/reordenar fotos
            if (data.fotos && data.fotos.length > 0) {
                for (const foto of data.fotos) {
                    if (foto.base64) {
                        const secureUrl = await uploadImage(foto.base64, 'adopcion/mascotas');
                        await tx.mascota_foto.create({
                            data: {
                                id_mascota: id_mascota,
                                url_foto: secureUrl,
                                orden: foto.orden,
                            }
                        });
                    } else if (foto.id_foto) {
                        await tx.mascota_foto.updateMany({
                            where: { id_foto: foto.id_foto, id_mascota: id_mascota },
                            data: { orden: foto.orden },
                        });
                    }
                }
            }

            // Procesar tags
            let tagsDespues = tagsAntes;
            let embeddingRecalculado = false;
            if (data.tagsIds) {
                const tagsUnicos = [...new Set(data.tagsIds)];

                if (tagsUnicos.length > 0) {
                    const tagsValidos = await tx.opcion_tag.count({
                        where: { id_opcion: { in: tagsUnicos } }
                    });
                    if (tagsValidos !== tagsUnicos.length) {
                        return { success: false, status: 400, message: 'Uno o más tagsIds proporcionados no son válidos o no existen.' };
                    }
                }

                tagsDespues = tagsUnicos;
                await tx.mascota_tag.deleteMany({
                    where: { id_mascota: id_mascota }
                });

                if (tagsUnicos.length > 0) {
                    await tx.mascota_tag.createMany({
                        data: tagsUnicos.map(id_opcion => ({
                            id_mascota: id_mascota,
                            id_opcion,
                        })),
                    });
                }

                if (!arrayEquals([...tagsAntes].sort(), [...tagsDespues].sort())) {
                    await calcularEmbedding(tagsUnicos);
                    embeddingRecalculado = true;
                }
            }

            // Update mascota con COALESCE-like
            const updateData = {};
            if (data.nombre !== undefined) updateData.nombre = data.nombre;
            if (data.descripcion !== undefined) updateData.descripcion = data.descripcion;
            if (data.estado_adopcion !== undefined) updateData.estado_adopcion = data.estado_adopcion;
            updateData.updated_at = new Date();

            const mascotaActualizada = await tx.mascota.update({
                where: { id_mascota: id_mascota },
                data: updateData,
            });

            // Fotos finales para auditoría
            const fotosFinales = await tx.mascota_foto.findMany({
                where: { id_mascota: id_mascota },
                orderBy: { orden: 'asc' }
            });

            const camposModificados = computeUpdatedFields({
                mascotaAntes: mascota,
                data,
                fotosAntes: fotosActuales,
                fotosDespues: fotosFinales,
                tagsAntes,
                tagsDespues,
            });

            // auditoría
            await tx.log_auditoria.create({
                data: {
                    id_autor: id_albergue,
                    accion: 'UPDATE_MASCOTA',
                    entidad_afectada: 'Mascota',
                    id_registro_afectado: id_mascota,
                    valor_anterior: JSON.stringify({
                        nombre: mascota.nombre,
                        descripcion: mascota.descripcion,
                        estado_adopcion: mascota.estado_adopcion,
                        updated_at: mascota.updated_at,
                        tagsIds: tagsAntes,
                        fotos: fotosActuales.map((foto) => ({ id_foto: foto.id_foto, orden: foto.orden })),
                    }),
                    valor_nuevo: JSON.stringify({
                        nombre: mascotaActualizada.nombre,
                        descripcion: mascotaActualizada.descripcion,
                        estado_adopcion: mascotaActualizada.estado_adopcion,
                        updated_at: mascotaActualizada.updated_at,
                        tagsIds: tagsDespues,
                        fotos: fotosFinales.map((foto) => ({ id_foto: foto.id_foto, orden: foto.orden })),
                        campos_modificados: Object.keys(camposModificados),
                        diff: camposModificados,
                        embedding_recalculado: embeddingRecalculado,
                    }),
                    ip: ip,
                }
            });

            return { success: true, data: mascotaActualizada };
        });
    } catch (err) {
        console.error('[mascotaService] actualizarMascota:', err.message);
        throw err;
    }
};

// ──────────────────────────────────────────────
// HU-PM-04: Cambiar Estado de Mascota
//
// Usa $queryRaw con FOR UPDATE porque la máquina de
// estados necesita aislamiento estricto. Sin FOR UPDATE
// dos requests concurrentes podrían leer el mismo estado
// y hacer transiciones inválidas que se pisen entre sí.
// ──────────────────────────────────────────────

const cambiarEstadoMascota = async (idMascota, idAlbergue, nuevoEstado, motivo, clientIp) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // FOR UPDATE: bloquear fila para integridad de la máquina de estados
            const rows = await tx.$queryRaw`
                SELECT id_mascota, id_albergue, estado_adopcion, nombre
                FROM mascota
                WHERE id_mascota = ${idMascota} AND deleted_at IS NULL
                FOR UPDATE
            `;

            if (!rows || rows.length === 0) {
                throw new Error('Mascota no encontrada o ha sido eliminada.');
            }

            const mascota = rows[0];

            if (mascota.id_albergue !== idAlbergue) {
                throw new Error('No tienes permiso para modificar esta mascota.');
            }

            const estadoActual = mascota.estado_adopcion;
            const transicionesPermitidas = {
                disponible: ['en_proceso', 'oculto', 'inactivo', 'archivado', 'pausado'],
                en_proceso: ['adoptado', 'disponible', 'oculto', 'inactivo', 'archivado', 'pausado'],
                adoptado: ['oculto'],
                oculto: ['disponible', 'en_proceso', 'adoptado'],
                inactivo: ['disponible'],
                archivado: ['disponible'],
                pausado: ['disponible', 'en_proceso'],
            };

            if (estadoActual === nuevoEstado) {
                return {
                    id_mascota: idMascota,
                    estado: estadoActual,
                    message: 'La mascota ya se encuentra en ese estado',
                };
            }

            const permitidos = transicionesPermitidas[estadoActual] || [];
            if (!permitidos.includes(nuevoEstado) && !['oculto', 'inactivo', 'archivado'].includes(nuevoEstado)) {
                throw new Error(`Transición de estado no permitida: de '${estadoActual}' a '${nuevoEstado}'.`);
            }

            await tx.mascota.update({
                where: { id_mascota: idMascota },
                data: {
                    estado_adopcion: nuevoEstado,
                    updated_at: new Date(),
                }
            });

            // Si la mascota fue adoptada, notificar a los adoptantes con match
            if (nuevoEstado === 'adoptado') {
                const matches = await tx.match.findMany({
                    where: { id_mascota: idMascota },
                    select: { id_adoptante: true },
                    distinct: ['id_adoptante'],
                });

                for (const match of matches) {
                    await tx.notificacion.create({
                        data: {
                            id_usuario: match.id_adoptante,
                            tipo_notificacion: 'mascota_adoptada',
                            mensaje: `La mascota ${mascota.nombre} ya encontró un hogar.`,
                            recurso_id: idMascota,
                        }
                    });
                }
            }

            // Auditoría
            await tx.log_auditoria.create({
                data: {
                    id_autor: idAlbergue,
                    accion: 'cambio_estado_mascota',
                    entidad_afectada: 'Mascota',
                    id_registro_afectado: idMascota,
                    valor_anterior: JSON.stringify({ estado: estadoActual }),
                    valor_nuevo: JSON.stringify({ estado: nuevoEstado, motivo: motivo || null }),
                    ip: clientIp,
                }
            });

            return {
                id_mascota: idMascota,
                estado_anterior: estadoActual,
                nuevo_estado: nuevoEstado,
            };
        });
    } catch (error) {
        console.error('[mascotaService] Error en cambiarEstadoMascota:', error);
        throw error;
    }
};

// ──────────────────────────────────────────────
// HU-PM-05: Feed de exploración
//
// CRÍTICO: Usa $queryRaw con SQL dinámicamente construido
// porque los filtros con EXISTS anidados son imposibles de
// expresar con la API de Prisma (`findMany` con `some` anidado
// generaría JOINs y subqueries ineficientes).
//
// La query se construye concatenando condiciones de forma segura
// con Prisma.sql + Prisma.join. Los valores de filtro se pasan
// como parámetros vinculados ($1, $2...) — nunca se concatenan
// directamente en el SQL.
// ──────────────────────────────────────────────

const listarFeed = async ({ tipo, tamaño, edad, ciudad, page, limit }) => {
    const offset = (page - 1) * limit;

    // Construir condiciones dinámicas con Prisma.sql (seguro — valores como placeholders)
    const conditions = [
        Prisma.sql`m.estado_adopcion = 'disponible'`,
        Prisma.sql`m.deleted_at IS NULL`,
    ];

    if (tipo) {
        conditions.push(Prisma.sql`EXISTS (
            SELECT 1 FROM mascota_tag mt2
            JOIN opcion_tag o2 ON mt2.id_opcion = o2.id_opcion
            JOIN tag t2 ON o2.id_tag = t2.id_tag
            WHERE mt2.id_mascota = m.id_mascota
              AND t2.nombre_tag = 'Tipo de animal'
              AND o2.valor = ${tipo}
        )`);
    }

    if (tamaño) {
        conditions.push(Prisma.sql`EXISTS (
            SELECT 1 FROM mascota_tag mt3
            JOIN opcion_tag o3 ON mt3.id_opcion = o3.id_opcion
            JOIN tag t3 ON o3.id_tag = t3.id_tag
            WHERE mt3.id_mascota = m.id_mascota
              AND t3.nombre_tag = 'Tamaño'
              AND o3.valor = ${tamaño}
        )`);
    }

    if (edad) {
        conditions.push(Prisma.sql`EXISTS (
            SELECT 1 FROM mascota_tag mt4
            JOIN opcion_tag o4 ON mt4.id_opcion = o4.id_opcion
            JOIN tag t4 ON o4.id_tag = t4.id_tag
            WHERE mt4.id_mascota = m.id_mascota
              AND t4.nombre_tag = 'Rango de edad'
              AND o4.valor = ${edad}
        )`);
    }

    if (ciudad) {
        conditions.push(Prisma.sql`a.nombre_albergue ILIKE ${'%' + ciudad + '%'}`);
    }

    const whereClause = Prisma.join(conditions, ' AND ');

    // Count total (con los mismos filtros)
    const [{ total }] = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS total
        FROM mascota m
        JOIN albergue a ON m.id_albergue = a.id_usuario
        WHERE ${whereClause}
    `;

    // Si no hay resultados, devolver vacío rápido
    if (total === 0) {
        return {
            data: [],
            meta: { page, limit, total: 0, pages: 0 },
        };
    }

    // Feed query principal
    const mascotas = await prisma.$queryRaw`
        SELECT m.id_mascota, m.nombre, m.descripcion, m.fecha_publicacion,
               a.id_usuario AS id_albergue, a.nombre_albergue
        FROM mascota m
        JOIN albergue a ON m.id_albergue = a.id_usuario
        WHERE ${whereClause}
        ORDER BY m.fecha_publicacion DESC
        LIMIT ${limit} OFFSET ${offset}
    `;

    // Batch: obtener primera foto de cada mascota
    const mascotaIds = mascotas.map(m => m.id_mascota);
    const fotosMap = new Map();

    if (mascotaIds.length > 0) {
        const fotos = await prisma.$queryRaw`
            SELECT DISTINCT ON (id_mascota) id_mascota, url_foto
            FROM mascota_foto
            WHERE id_mascota = ANY(${mascotaIds})
            ORDER BY id_mascota, orden ASC
        `;
        for (const f of fotos) {
            fotosMap.set(f.id_mascota, f.url_foto);
        }
    }

    // Batch: obtener tags de cada mascota
    const tagsMap = new Map();
    if (mascotaIds.length > 0) {
        const tags = await prisma.$queryRaw`
            SELECT mt.id_mascota, o.valor, t.nombre_tag
            FROM mascota_tag mt
            JOIN opcion_tag o ON mt.id_opcion = o.id_opcion
            JOIN tag t ON o.id_tag = t.id_tag
            WHERE mt.id_mascota = ANY(${mascotaIds})
        `;
        for (const t of tags) {
            if (!tagsMap.has(t.id_mascota)) {
                tagsMap.set(t.id_mascota, []);
            }
            tagsMap.get(t.id_mascota).push({ valor: t.valor, nombre_tag: t.nombre_tag });
        }
    }

    // Ensamblar resultado
    const data = mascotas.map(m => ({
        ...m,
        foto: fotosMap.get(m.id_mascota) || null,
        tags: tagsMap.get(m.id_mascota) || [],
    }));

    return {
        data,
        meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
};

// ──────────────────────────────────────────────
// Listar mascotas de un albergue (paginado)
// ──────────────────────────────────────────────

const listarMisMascotas = async (idAlbergue, { page, limit }) => {
    const offset = (page - 1) * limit;

    const total = await prisma.mascota.count({
        where: { id_albergue: idAlbergue }
    });

    if (total === 0) {
        return {
            data: [],
            meta: { page, limit, total: 0, pages: 0 },
        };
    }

    const mascotas = await prisma.mascota.findMany({
        where: { id_albergue: idAlbergue },
        orderBy: { fecha_publicacion: 'desc' },
        skip: offset,
        take: limit,
        select: {
            id_mascota: true,
            nombre: true,
            descripcion: true,
            estado_adopcion: true,
            fecha_publicacion: true,
        }
    });

    // Batch: primera foto de cada mascota
    const mascotaIds = mascotas.map(m => m.id_mascota);
    const fotosMap = new Map();

    if (mascotaIds.length > 0) {
        const fotos = await prisma.$queryRaw`
            SELECT DISTINCT ON (id_mascota) id_mascota, url_foto
            FROM mascota_foto
            WHERE id_mascota = ANY(${mascotaIds})
            ORDER BY id_mascota, orden ASC
        `;
        for (const f of fotos) {
            fotosMap.set(f.id_mascota, f.url_foto);
        }
    }

    const data = mascotas.map(m => ({
        ...m,
        foto: fotosMap.get(m.id_mascota) || null,
    }));

    return {
        data,
        meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
};

// ──────────────────────────────────────────────
// HU-PM-06: Calcular compatibilidad (matching)
// ──────────────────────────────────────────────

const calcularCompatibilidad = async (idAdoptante) => {
    // Tags del adoptante
    const adoptanteTagsRows = await prisma.adoptante_tag.findMany({
        where: { id_usuario: idAdoptante },
        select: { id_opcion: true }
    });
    const adoptanteTags = adoptanteTagsRows.map(r => r.id_opcion);

    if (adoptanteTags.length === 0) {
        return [];
    }

    // Mascotas disponibles
    const mascotasRes = await prisma.mascota.findMany({
        where: {
            estado_adopcion: 'disponible',
        },
        select: {
            id_mascota: true,
            nombre: true,
            descripcion: true,
            albergue: {
                select: { id_usuario: true, nombre_albergue: true }
            }
        }
    });

    if (mascotasRes.length === 0) {
        return [];
    }

    const mascotaIds = mascotasRes.map(m => m.id_mascota);

    // Tags de todas las mascotas (batch)
    const allTagsRows = await prisma.mascota_tag.findMany({
        where: { id_mascota: { in: mascotaIds } },
        select: { id_mascota: true, id_opcion: true }
    });

    const tagsPorMascota = new Map();
    for (const row of allTagsRows) {
        if (!tagsPorMascota.has(row.id_mascota)) {
            tagsPorMascota.set(row.id_mascota, []);
        }
        tagsPorMascota.get(row.id_mascota).push(row.id_opcion);
    }

    // Foto principal de cada mascota (batch)
    const fotosMap = new Map();
    if (mascotaIds.length > 0) {
        const fotos = await prisma.$queryRaw`
            SELECT DISTINCT ON (id_mascota) id_mascota, url_foto
            FROM mascota_foto
            WHERE id_mascota = ANY(${mascotaIds})
            ORDER BY id_mascota, orden ASC
        `;
        for (const f of fotos) {
            fotosMap.set(f.id_mascota, f.url_foto);
        }
    }

    // Tags detalle de todas las mascotas (batch)
    const allTagsDetalle = await prisma.$queryRaw`
        SELECT mt.id_mascota, o.valor, t.nombre_tag
        FROM mascota_tag mt
        JOIN opcion_tag o ON mt.id_opcion = o.id_opcion
        JOIN tag t ON o.id_tag = t.id_tag
        WHERE mt.id_mascota = ANY(${mascotaIds})
    `;
    const tagsDetallePorMascota = new Map();
    for (const t of allTagsDetalle) {
        if (!tagsDetallePorMascota.has(t.id_mascota)) {
            tagsDetallePorMascota.set(t.id_mascota, []);
        }
        tagsDetallePorMascota.get(t.id_mascota).push({ valor: t.valor, nombre_tag: t.nombre_tag });
    }

    const resultados = [];
    for (const mascota of mascotasRes) {
        const mascotaTags = tagsPorMascota.get(mascota.id_mascota) || [];

        const comunes = adoptanteTags.filter(t => mascotaTags.includes(t));
        const todosUnicos = [...new Set([...adoptanteTags, ...mascotaTags])];
        const score = todosUnicos.length > 0 ? Math.round((comunes.length / todosUnicos.length) * 100) : 0;

        if (score > 0) {
            resultados.push({
                id_mascota: mascota.id_mascota,
                nombre: mascota.nombre,
                descripcion: mascota.descripcion,
                id_albergue: mascota.albergue.id_usuario,
                nombre_albergue: mascota.albergue.nombre_albergue,
                foto: fotosMap.get(mascota.id_mascota) || null,
                compatibilidad: score,
                tags: tagsDetallePorMascota.get(mascota.id_mascota) || [],
            });
        }
    }

    return resultados.sort((a, b) => b.compatibilidad - a.compatibilidad).slice(0, 10);
};

// ──────────────────────────────────────────────
// Soft Delete de Mascota
// ──────────────────────────────────────────────

const eliminarMascota = async (idMascota, idAlbergue, motivo) => {
    try {
        return await prisma.$transaction(async (tx) => {
            const mascota = await tx.mascota.findUnique({
                where: { id_mascota: idMascota }
            });

            if (!mascota) {
                return { success: false, status: 404, message: 'Mascota no encontrada.' };
            }

            if (mascota.id_albergue !== idAlbergue) {
                return { success: false, status: 403, message: 'No tienes permiso para eliminar esta mascota.' };
            }

            await tx.mascota.update({
                where: { id_mascota: idMascota },
                data: {
                    deleted_at: new Date(),
                    motivo_eliminacion: motivo || null,
                    estado_adopcion: 'inactivo',
                }
            });

            await tx.log_auditoria.create({
                data: {
                    id_autor: idAlbergue,
                    accion: 'ELIMINACION_MASCOTA',
                    entidad_afectada: 'Mascota',
                    id_registro_afectado: idMascota,
                    valor_anterior: JSON.stringify({
                        nombre: mascota.nombre,
                        estado: mascota.estado_adopcion,
                    }),
                    valor_nuevo: JSON.stringify({
                        motivo: motivo || null,
                        deleted_at: new Date().toISOString(),
                    }),
                }
            });

            return { success: true, message: 'Mascota eliminada exitosamente.' };
        });
    } catch (err) {
        console.error('[mascotaService] eliminarMascota:', err.message);
        throw err;
    }
};

// ──────────────────────────────────────────────
// Registrar Match (desde el adoptante)
// ──────────────────────────────────────────────

const registrarMatch = async ({ idAdoptante, idMascota, puntaje }) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // Verificar que la mascota existe y está disponible
            const mascota = await tx.mascota.findUnique({
                where: { id_mascota: idMascota },
                select: {
                    id_mascota: true,
                    estado_adopcion: true,
                    id_albergue: true,
                    nombre: true,
                    albergue: { select: { nombre_albergue: true } }
                }
            });

            if (!mascota) {
                return { success: false, status: 404, message: 'Mascota no encontrada.' };
            }

            if (mascota.estado_adopcion !== 'disponible') {
                return { success: false, status: 400, message: 'La mascota no está disponible para adopción.' };
            }

            // Verificar que el adoptante existe
            const adoptante = await tx.adoptante.findUnique({
                where: { id_usuario: idAdoptante }
            });

            if (!adoptante) {
                return { success: false, status: 404, message: 'Perfil de adoptante no encontrado.' };
            }

            // Verificar que no exista un match previo (evitar duplicados)
            const matchExistente = await tx.match.findFirst({
                where: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                }
            });

            if (matchExistente) {
                return {
                    success: false,
                    status: 409,
                    message: 'Ya existe un match con esta mascota.',
                    data: { id_match: matchExistente.id_match, estado: matchExistente.estado },
                };
            }

            // Crear match
            const match = await tx.match.create({
                data: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                    puntaje: puntaje || null,
                    estado: 'pendiente',
                }
            });

            // Notificar al albergue
            await tx.notificacion.create({
                data: {
                    id_usuario: mascota.id_albergue,
                    tipo_notificacion: 'nuevo_match',
                    mensaje: `Un adoptante está interesado en ${mascota.nombre}. Revisa los detalles del match.`,
                    recurso_tipo: 'match',
                    recurso_id: match.id_match,
                }
            });

            return {
                success: true,
                data: {
                    id_match: match.id_match,
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                    puntaje: match.puntaje,
                    estado: match.estado,
                    fecha: match.fecha,
                }
            };
        });
    } catch (err) {
        console.error('[mascotaService] registrarMatch:', err.message);
        throw err;
    }
};

// ──────────────────────────────────────────────
// Obtener matches de un adoptante
// ──────────────────────────────────────────────

const obtenerMatches = async (idAdoptante) => {
    try {
        const matches = await prisma.match.findMany({
            where: { id_adoptante: idAdoptante },
            orderBy: { fecha: 'desc' },
            include: {
                mascota: {
                    include: {
                        albergue: {
                            select: {
                                id_usuario: true,
                                nombre_albergue: true,
                                whatsapp_actual: true,
                            }
                        },
                        mascota_foto: {
                            orderBy: { orden: 'asc' },
                            take: 1,
                            select: { url_foto: true }
                        },
                        mascota_tag: {
                            include: {
                                opcion_tag: {
                                    include: {
                                        tag: {
                                            select: { nombre_tag: true, categoria: true }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        const data = matches.map(m => ({
            id_match: m.id_match,
            id_adoptante: m.id_adoptante,
            id_mascota: m.id_mascota,
            puntaje: m.puntaje,
            estado: m.estado,
            fecha: m.fecha,
            mascota: {
                id_mascota: m.mascota.id_mascota,
                nombre: m.mascota.nombre,
                descripcion: m.mascota.descripcion,
                estado_adopcion: m.mascota.estado_adopcion,
                foto: m.mascota.mascota_foto[0]?.url_foto || null,
                tags: m.mascota.mascota_tag.map(mt => ({
                    valor: mt.opcion_tag.valor,
                    nombre_tag: mt.opcion_tag.tag.nombre_tag,
                    categoria: mt.opcion_tag.tag.categoria,
                })),
                albergue: {
                    id_usuario: m.mascota.albergue.id_usuario,
                    nombre_albergue: m.mascota.albergue.nombre_albergue,
                    whatsapp: m.mascota.albergue.whatsapp_actual,
                },
            },
        }));

        return { success: true, data };
    } catch (err) {
        console.error('[mascotaService] obtenerMatches:', err.message);
        throw err;
    }
};

// ──────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────

module.exports = {
    crearMascota,
    obtenerMascotaPorId,
    actualizarMascota,
    cambiarEstadoMascota,
    listarFeed,
    listarMisMascotas,
    calcularCompatibilidad,
    eliminarMascota,
    registrarMatch,
    obtenerMatches,
};
