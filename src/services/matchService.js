const prisma = require('../config/prisma');

const calcularCompatibilidad = async (idAdoptante) => {
    const adoptante_tags = await prisma.adoptanteTag.findMany({
        where: { id_usuario: idAdoptante },
        select: { id_opcion: true }
    });

    if (adoptante_tags.length === 0) {
        return [];
    }

    const adoptante_opcion_ids = adoptante_tags.map(r => r.id_opcion);

    const tagsDetalleAdoptanteRaw = await prisma.$queryRaw`
        SELECT ot.id_opcion, ot.id_tag, t.peso_matching, t.es_filtro_absoluto
        FROM adoptante_tag at
        JOIN opcion_tag ot ON at.id_opcion = ot.id_opcion
        JOIN tag t ON ot.id_tag = t.id_tag
        WHERE at.id_usuario = ${idAdoptante}
    `;

    const tagsAdoptanteMap = new Map();
    let sumaTotalPesos = 0;
    for (const row of tagsDetalleAdoptanteRaw) {
        const peso = Number(row.peso_matching) || 0;
        tagsAdoptanteMap.set(row.id_opcion, {
            id_tag: row.id_tag,
            peso_matching: peso,
            es_filtro_absoluto: row.es_filtro_absoluto,
        });
        sumaTotalPesos += peso;
    }

    const idsDescartadosRaw = await prisma.match.findMany({
        where: { id_adoptante: idAdoptante, tipo_interaccion: 'descarte' },
        select: { id_mascota: true }
    });
    const idsDescartados = new Set(idsDescartadosRaw.map(r => r.id_mascota));

    const mascotas = await prisma.mascota.findMany({
        where: {
            estado_adopcion: 'disponible',
            id_mascota: { notIn: Array.from(idsDescartados) },
        },
        select: { id_mascota: true, nombre: true, descripcion: true }
    });

    if (mascotas.length === 0) {
        await limpiarMatchesPendientes(idAdoptante);
        return [];
    }

    const mascotaIds = mascotas.map(m => m.id_mascota);

    const mascotaTagsRaw = await prisma.$queryRaw`
        SELECT mt.id_mascota, mt.id_opcion, ot.id_tag
        FROM mascota_tag mt
        JOIN opcion_tag ot ON mt.id_opcion = ot.id_opcion
        WHERE mt.id_mascota = ANY(${mascotaIds})
    `;

    const tagsPorMascota = new Map();
    for (const row of mascotaTagsRaw) {
        if (!tagsPorMascota.has(row.id_mascota)) {
            tagsPorMascota.set(row.id_mascota, []);
        }
        tagsPorMascota.get(row.id_mascota).push({
            id_opcion: row.id_opcion,
            id_tag: row.id_tag,
        });
    }

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

    const tagsDetalleMascotaRaw = await prisma.$queryRaw`
        SELECT mt.id_mascota, o.valor, t.nombre_tag, t.categoria
        FROM mascota_tag mt
        JOIN opcion_tag o ON mt.id_opcion = o.id_opcion
        JOIN tag t ON o.id_tag = t.id_tag
        WHERE mt.id_mascota = ANY(${mascotaIds})
    `;
    const tagsDetallePorMascota = new Map();
    for (const t of tagsDetalleMascotaRaw) {
        if (!tagsDetallePorMascota.has(t.id_mascota)) {
            tagsDetallePorMascota.set(t.id_mascota, []);
        }
        tagsDetallePorMascota.get(t.id_mascota).push({
            valor: t.valor,
            nombre_tag: t.nombre_tag,
            categoria: t.categoria,
        });
    }

    const resultados = [];
    for (const mascota of mascotas) {
        const mascota_tags = tagsPorMascota.get(mascota.id_mascota) || [];
        const mascota_opcion_ids = new Set(mascota_tags.map(t => t.id_opcion));
        const mascota_tag_ids = new Set(mascota_tags.map(t => t.id_tag));

        let pasaFiltrosAbsolutos = true;
        for (const [id_opcion, info] of tagsAdoptanteMap) {
            if (info.es_filtro_absoluto) {
                if (!mascota_tag_ids.has(info.id_tag)) {
                    pasaFiltrosAbsolutos = false;
                    break;
                }
            }
        }

        if (!pasaFiltrosAbsolutos) continue;

        let sumaObtenida = 0;
        for (const [id_opcion, info] of tagsAdoptanteMap) {
            if (info.es_filtro_absoluto) continue;
            if (mascota_opcion_ids.has(id_opcion)) {
                sumaObtenida += info.peso_matching;
            }
        }

        const compatibilidad = sumaTotalPesos > 0
            ? Math.round((sumaObtenida / sumaTotalPesos) * 100)
            : 0;

        if (compatibilidad >= 30) {
            resultados.push({
                id_mascota: mascota.id_mascota,
                nombre: mascota.nombre,
                descripcion: mascota.descripcion,
                foto: fotosMap.get(mascota.id_mascota) || null,
                compatibilidad,
                tags: tagsDetallePorMascota.get(mascota.id_mascota) || [],
            });
        }
    }

    resultados.sort((a, b) => b.compatibilidad - a.compatibilidad);

    await prisma.$transaction(async (tx) => {
        await tx.match.deleteMany({
            where: {
                id_adoptante: idAdoptante,
                tipo_interaccion: 'recomendacion',
            }
        });

        if (resultados.length > 0) {
            await tx.match.createMany({
                data: resultados.map(r => ({
                    id_adoptante: idAdoptante,
                    id_mascota: r.id_mascota,
                    score_compatibilidad: r.compatibilidad,
                    tipo_interaccion: 'recomendacion',
                })),
            });
        }
    });

    return resultados;
};

const limpiarMatchesPendientes = async (idAdoptante) => {
    await prisma.match.deleteMany({
        where: {
            id_adoptante: idAdoptante,
            tipo_interaccion: 'recomendacion',
        }
    });
};

const registrarMatch = async ({ idAdoptante, idMascota, puntaje }) => {
    try {
        return await prisma.$transaction(async (tx) => {
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

            const adoptante = await tx.adoptante.findUnique({
                where: { id_usuario: idAdoptante }
            });

            if (!adoptante) {
                return { success: false, status: 404, message: 'Perfil de adoptante no encontrado.' };
            }

            const matchExistente = await tx.match.findFirst({
                where: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                    tipo_interaccion: 'me_gusta',
                }
            });

            if (matchExistente) {
                return {
                    success: true, // Idempotent
                    status: 200,
                    message: 'Ya existe un match con esta mascota.',
                    data: { id_match: matchExistente.id_match, estado: matchExistente.tipo_interaccion },
                };
            }

            // Eliminar la recomendación previa si existe
            await tx.match.deleteMany({
                where: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                    tipo_interaccion: 'recomendacion',
                }
            });

            const match = await tx.match.create({
                data: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                    score_compatibilidad: puntaje || null,
                    tipo_interaccion: 'me_gusta',
                }
            });

            await tx.notificacion.create({
                data: {
                    id_usuario: mascota.id_albergue,
                    tipo_notificacion: 'nuevo_match',
                    mensaje: `Un adoptante está interesado en ${mascota.nombre}. Revisa los detalles del match.`,
                    recurso_id: match.id_match,
                }
            });

            return {
                success: true,
                data: {
                    id_match: match.id_match,
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                    puntaje: match.score_compatibilidad,
                    estado: match.tipo_interaccion,
                    fecha: match.fecha_match,
                }
            };
        });
    } catch (err) {
        console.error('[matchService] registrarMatch:', err.message);
        throw err;
    }
};

const obtenerMatches = async (idAdoptante, { limit = 10, offset = 0, estado = null } = {}) => {
    try {
        const whereClause = { id_adoptante: idAdoptante, tipo_interaccion: 'me_gusta' };
        
        const total = await prisma.match.count({ where: whereClause });
        
        const matches = await prisma.match.findMany({
            where: whereClause,
            orderBy: { fecha_match: 'desc' },
            skip: offset,
            take: limit,
            include: {
                mascota: {
                    include: {
                        albergue: {
                            select: { id_usuario: true, nombre_albergue: true, whatsapp_actual: true }
                        },
                        mascota_foto: {
                            orderBy: { orden: 'asc' }, take: 1, select: { url_foto: true }
                        },
                        mascota_tag: {
                            include: { opcion_tag: { include: { tag: { select: { nombre_tag: true, categoria: true } } } } }
                        }
                    }
                }
            }
        });

        const data = matches.map(m => {
            let estadoUI = 'pendiente';
            if (m.mascota.estado_adopcion === 'adoptado') estadoUI = 'adoptado';

            return {
                id_match: m.id_match,
                id_adoptante: m.id_adoptante,
                id_mascota: m.id_mascota,
                puntaje: m.score_compatibilidad,
                estado: estadoUI,
                fecha: m.fecha_match,
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
            };
        });

        const filteredData = estado ? data.filter(d => d.estado === estado) : data;

        return { 
            success: true, 
            data: filteredData,
            pagination: { total, limit, offset }
        };
    } catch (err) {
        console.error('[matchService] obtenerMatches:', err.message);
        throw err;
    }
};

const obtenerMatchPorId = async (idAdoptante, idMatch) => {
    try {
        const match = await prisma.match.findUnique({
            where: { id_match: idMatch },
            include: {
                mascota: {
                    include: {
                        albergue: {
                            select: { 
                                id_usuario: true, 
                                nombre_albergue: true, 
                                whatsapp_actual: true,
                                usuario: {
                                    select: { correo: true }
                                }
                            }
                        },
                        mascota_foto: {
                            orderBy: { orden: 'asc' }, select: { url_foto: true }
                        },
                        mascota_tag: {
                            include: { opcion_tag: { include: { tag: { select: { nombre_tag: true, categoria: true } } } } }
                        },
                        adopcion: {
                            where: { id_adoptante: idAdoptante },
                            orderBy: { fecha_adopcion: 'desc' },
                            take: 1
                        }
                    }
                }
            }
        });

        if (!match) {
            return { success: false, status: 404, message: 'Match no encontrado.' };
        }

        if (match.id_adoptante !== idAdoptante) {
            return { success: false, status: 403, message: 'No tienes acceso a este match.' };
        }

        let estadoUI = 'pendiente';
        if (match.mascota.estado_adopcion === 'adoptado') {
             estadoUI = 'adoptado';
        }
        
        const data = {
            id_match: match.id_match,
            id_adoptante: match.id_adoptante,
            id_mascota: match.id_mascota,
            puntaje: match.score_compatibilidad,
            estado: estadoUI,
            fecha: match.fecha_match,
            mascota: {
                id_mascota: match.mascota.id_mascota,
                nombre: match.mascota.nombre,
                descripcion: match.mascota.descripcion,
                estado_adopcion: match.mascota.estado_adopcion,
                fotos: match.mascota.mascota_foto.map(f => f.url_foto),
                foto: match.mascota.mascota_foto[0]?.url_foto || null,
                tags: match.mascota.mascota_tag.map(mt => ({
                    valor: mt.opcion_tag.valor,
                    nombre_tag: mt.opcion_tag.tag.nombre_tag,
                    categoria: mt.opcion_tag.tag.categoria,
                })),
                albergue: {
                    id_usuario: match.mascota.albergue.id_usuario,
                    nombre_albergue: match.mascota.albergue.nombre_albergue,
                    nombre_encargado: 'Encargado', 
                    whatsapp: match.mascota.albergue.whatsapp_actual,
                    email: match.mascota.albergue.usuario?.correo || 'No disponible',
                    direccion: 'Dirección no disponible',
                },
            },
            adopcion: match.mascota.adopcion[0] || null
        };

        return { success: true, data };
    } catch (err) {
        console.error('[matchService] obtenerMatchPorId:', err.message);
        throw err;
    }
};

const descartarMascota = async (idAdoptante, idMascota) => {
    try {
        return await prisma.$transaction(async (tx) => {
            const mascota = await tx.mascota.findUnique({
                where: { id_mascota: idMascota },
                select: { id_mascota: true, nombre: true }
            });

            if (!mascota) {
                return { success: false, status: 404, message: 'Mascota no encontrada.' };
            }

            const existente = await tx.match.findFirst({
                where: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                    tipo_interaccion: 'descarte',
                }
            });

            if (existente) {
                return { success: true, status: 200, message: 'Esta mascota ya fue descartada previamente.' };
            }

            // Eliminar cualquier interaccion previa
            await tx.match.deleteMany({
                where: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                }
            });

            await tx.match.create({
                data: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                    tipo_interaccion: 'descarte',
                }
            });

            return { success: true, message: 'Mascota descartada exitosamente.' };
        });
    } catch (err) {
        console.error('[matchService] descartarMascota:', err.message);
        throw err;
    }
};

const obtenerMatchesAlbergue = async (idAlbergue, { idMascota = null, limit = 10, offset = 0 } = {}) => {
    try {
        const whereClause = {
            tipo_interaccion: 'me_gusta',
            mascota: { id_albergue: idAlbergue }
        };

        if (idMascota) {
            whereClause.id_mascota = idMascota;
        }

        const total = await prisma.match.count({ where: whereClause });

        const matches = await prisma.match.findMany({
            where: whereClause,
            orderBy: { fecha_match: 'desc' },
            skip: offset,
            take: limit,
            include: {
                adoptante: {
                    select: {
                        id_usuario: true,
                        nombre_completo: true,
                        ciudad: true,
                        whatsapp_adoptante: true,
                        foto_perfil: true,
                    }
                },
                mascota: {
                    select: {
                        id_mascota: true,
                        nombre: true,
                        estado_adopcion: true,
                        mascota_foto: {
                            orderBy: { orden: 'asc' }, take: 1, select: { url_foto: true }
                        }
                    }
                }
            }
        });

        const data = matches.map(m => ({
            id_match: m.id_match,
            id_adoptante: m.id_adoptante,
            id_mascota: m.id_mascota,
            puntaje: m.score_compatibilidad,
            fecha: m.fecha_match,
            adoptante: m.adoptante,
            mascota: {
                id_mascota: m.mascota.id_mascota,
                nombre: m.mascota.nombre,
                estado_adopcion: m.mascota.estado_adopcion,
                foto: m.mascota.mascota_foto[0]?.url_foto || null,
            }
        }));

        return {
            success: true,
            data,
            pagination: { total, limit, offset }
        };
    } catch (err) {
        console.error('[matchService] obtenerMatchesAlbergue:', err.message);
        throw err;
    }
};

const contactarAdoptante = async (idAlbergue, idMatch) => {
    try {
        return await prisma.$transaction(async (tx) => {
            const match = await tx.match.findUnique({
                where: { id_match: idMatch },
                include: { mascota: true }
            });

            if (!match) {
                return { success: false, status: 404, message: 'Match no encontrado.' };
            }

            if (match.mascota.id_albergue !== idAlbergue) {
                return { success: false, status: 403, message: 'No tienes acceso a este match.' };
            }

            await tx.match.update({
                where: { id_match: idMatch },
                data: { tipo_interaccion: 'contactado' }
            });

            const contacto = await tx.contacto_whatsapp.create({
                data: {
                    id_albergue: idAlbergue,
                    id_adoptante: match.id_adoptante,
                    id_mascota: match.id_mascota,
                }
            });

            return { success: true, data: contacto, message: 'Contacto registrado exitosamente.' };
        });
    } catch (err) {
        console.error('[matchService] contactarAdoptante:', err.message);
        throw err;
    }
};

const obtenerHistorialContactos = async (idAlbergue, idMatch) => {
    try {
        const match = await prisma.match.findUnique({
            where: { id_match: idMatch },
            include: { mascota: true }
        });

        if (!match) {
            return { success: false, status: 404, message: 'Match no encontrado.' };
        }

        if (match.mascota.id_albergue !== idAlbergue) {
            return { success: false, status: 403, message: 'No tienes acceso a este match.' };
        }

        const contactos = await prisma.contacto_whatsapp.findMany({
            where: {
                id_albergue: idAlbergue,
                id_adoptante: match.id_adoptante,
                id_mascota: match.id_mascota,
            },
            orderBy: { fecha_hora: 'desc' }
        });

        return { success: true, data: contactos };
    } catch (err) {
        console.error('[matchService] obtenerHistorialContactos:', err.message);
        throw err;
    }
};

module.exports = {
    calcularCompatibilidad,
    limpiarMatchesPendientes,
    registrarMatch,
    obtenerMatches,
    obtenerMatchPorId,
    descartarMascota,
    obtenerMatchesAlbergue,
    contactarAdoptante,
    obtenerHistorialContactos,
};
