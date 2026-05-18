const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');

const redis = require('../config/redis');

const calcularCompatibilidad = async (idAdoptante, tipoAnimal = null) => {
    const cacheKey = `match:db:${idAdoptante}:${tipoAnimal || 'all'}`;
    if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached) {
            return typeof cached === 'string' ? JSON.parse(cached) : cached;
        }
    }

    // Verificar si el adoptante tiene embedding
    const adoptanteRes = await prisma.$queryRaw`
        SELECT id_usuario FROM adoptante
        WHERE id_usuario = ${idAdoptante} AND embedding IS NOT NULL
    `;

    if (!adoptanteRes || adoptanteRes.length === 0) {
        await limpiarMatchesPendientes(idAdoptante);
        return [];
    }

    const idsDescartadosRaw = await prisma.descarte.findMany({
        where: { id_adoptante: idAdoptante },
        select: { id_mascota: true }
    });
    const idsDescartados = idsDescartadosRaw.map(r => r.id_mascota);

    const discardCondition = idsDescartados.length > 0
        ? Prisma.sql`AND m.id_mascota NOT IN (${Prisma.join(idsDescartados)})`
        : Prisma.empty;

    const tipoCondition = tipoAnimal
        ? Prisma.sql`AND EXISTS (
            SELECT 1 FROM mascota_tag mt2
            JOIN opcion_tag o2 ON mt2.id_opcion = o2.id_opcion
            JOIN tag t2 ON o2.id_tag = t2.id_tag
            WHERE mt2.id_mascota = m.id_mascota
              AND t2.nombre_tag = 'Tipo de animal'
              AND o2.valor = ${tipoAnimal}
        )`
        : Prisma.empty;

    // Calcular match usando pgvector y compatibilidad >= umbral configurable
    const UMBRAL = parseFloat(process.env.MATCH_UMBRAL_COMPATIBILIDAD) || 30;
    const mascotasMatch = await prisma.$queryRaw`
        SELECT
            m.id_mascota,
            m.nombre,
            m.descripcion,
            a.id_usuario AS id_albergue,
            a.nombre_albergue,
            ROUND((1 - (m.embedding <=> (SELECT embedding FROM adoptante WHERE id_usuario = ${idAdoptante})))::numeric * 100) AS compatibilidad
        FROM mascota m
        JOIN albergue a ON m.id_albergue = a.id_usuario
        WHERE m.estado_adopcion = 'disponible'
          AND m.deleted_at IS NULL
          AND m.embedding IS NOT NULL
          ${discardCondition}
          ${tipoCondition}
          AND ROUND((1 - (m.embedding <=> (SELECT embedding FROM adoptante WHERE id_usuario = ${idAdoptante})))::numeric * 100) >= ${UMBRAL}
        ORDER BY m.embedding <=> (SELECT embedding FROM adoptante WHERE id_usuario = ${idAdoptante}) ASC
    `;

    if (mascotasMatch.length === 0) {
        await limpiarMatchesPendientes(idAdoptante);
        return [];
    }

    const mascotaIds = mascotasMatch.map(m => m.id_mascota);

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

    const resultados = mascotasMatch.map(mascota => ({
        id_mascota: mascota.id_mascota,
        nombre: mascota.nombre,
        descripcion: mascota.descripcion,
        id_albergue: mascota.id_albergue,
        nombre_albergue: mascota.nombre_albergue,
        foto: fotosMap.get(mascota.id_mascota) || null,
        compatibilidad: Number(mascota.compatibilidad),
        tags: tagsDetallePorMascota.get(mascota.id_mascota) || [],
    }));

    // Recrear matches pendientes
    await prisma.$transaction(async (tx) => {
        await tx.match.deleteMany({
            where: {
                id_adoptante: idAdoptante,
                estado: 'pendiente',
            }
        });

        if (resultados.length > 0) {
            await tx.match.createMany({
                data: resultados.map(r => ({
                    id_adoptante: idAdoptante,
                    id_mascota: r.id_mascota,
                    puntaje: r.compatibilidad,
                    estado: 'pendiente',
                })),
            });
        }
    });

    if (redis) {
        await redis.set(cacheKey, JSON.stringify(resultados), { ex: 3600 });
    }

    return resultados;
};

const limpiarMatchesPendientes = async (idAdoptante) => {
    await prisma.match.deleteMany({
        where: {
            id_adoptante: idAdoptante,
            estado: 'pendiente',
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

            const match = await tx.match.create({
                data: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                    puntaje: puntaje || null,
                    estado: 'pendiente',
                }
            });

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
        console.error('[matchService] registrarMatch:', err.message);
        throw err;
    }
};

const obtenerMatches = async (idAdoptante, filters = {}) => {
    try {

        const {
            estado,
            fecha_desde,
            fecha_hasta,
            limit = 20,
            offset = 0,
        } = filters;

        const where = {
            id_adoptante: idAdoptante,
        };

        // filtro estado
        if (estado) {
            where.estado = estado;
        }

        // filtro fechas
        if (fecha_desde || fecha_hasta) {
            where.fecha = {};

            if (fecha_desde) {
                where.fecha.gte = new Date(fecha_desde);
            }

            if (fecha_hasta) {
                where.fecha.lte = new Date(fecha_hasta);
            }
        }

        const matches = await prisma.match.findMany({
            where,

            orderBy: {
                fecha: 'desc'
            },

            skip: Number(offset),

            take: Number(limit),

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
                            orderBy: {
                                orden: 'asc'
                            },
                            take: 1,
                            select: {
                                url_foto: true
                            }
                        }
                    }
                }
            }
        });

        const total = await prisma.match.count({
            where
        });

        const data = matches.map(m => ({
            id_match: m.id_match,
            estado: m.estado,
            puntaje: m.puntaje,
            fecha: m.fecha,

            mascota: {
                id_mascota: m.mascota.id_mascota,
                nombre: m.mascota.nombre,
                descripcion: m.mascota.descripcion,
                estado_adopcion: m.mascota.estado_adopcion,
                foto: m.mascota.mascota_foto[0]?.url_foto || null,
            },

            albergue: {
                id_usuario: m.mascota.albergue.id_usuario,
                nombre_albergue: m.mascota.albergue.nombre_albergue,
                whatsapp: m.mascota.albergue.whatsapp_actual,
            }
        }));

        return {
            success: true,
            pagination: {
                total,
                limit: Number(limit),
                offset: Number(offset),
            },
            data
        };

    } catch (err) {
        console.error('[matchService] obtenerMatches:', err.message);
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

            const existente = await tx.descarte.findUnique({
                where: {
                    id_adoptante_id_mascota: {
                        id_adoptante: idAdoptante,
                        id_mascota: idMascota,
                    }
                }
            });

            if (existente) {
                return { success: false, status: 409, message: 'Esta mascota ya fue descartada.' };
            }

            await tx.descarte.create({
                data: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                }
            });

            await tx.match.deleteMany({
                where: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                }
            });

            return { success: true, message: 'Mascota descartada exitosamente.' };
        });
    } catch (err) {
        console.error('[matchService] descartarMascota:', err.message);
        throw err;
    }
};

const obtenerDetalleMatch = async (idMatch, idAdoptante) => {

    try {

  const match = await prisma.match.findFirst({
      where: {
        id_match: idMatch,
        id_adoptante: idAdoptante,
      },

      include: {

        contacto_whatsapp: {
          orderBy: { fecha_contacto: 'desc' },
        },

        mascota: {

                    include: {

                        mascota_foto: {
                            orderBy: {
                                orden: 'asc'
                            }
                        },

                        mascota_tag: {
                            include: {
                                opcion_tag: {
                                    include: {
                                        tag: true
                                    }
                                }
                            }
                        },

                        albergue: {
                            select: {
                                id_usuario: true,
                                nombre_albergue: true,
                                descripcion: true,
                                whatsapp_actual: true,
                                sitio_web: true,
                                logo: true,
                            }
                        }
                    }
                }
            }
        });

        if (!match) {
            return {
                success: false,
                status: 404,
                message: 'Match no encontrado.'
            };
        }

        return {
            success: true,

            data: {

                id_match: match.id_match,

                estado: match.estado,

                puntaje_compatibilidad: match.puntaje,

                fecha_match: match.fecha,

                mascota: {

                    id_mascota: match.mascota.id_mascota,

                    nombre: match.mascota.nombre,

                    descripcion: match.mascota.descripcion,

                    estado_actual: match.mascota.estado_adopcion,

                    fotos: match.mascota.mascota_foto.map(f => ({
                        id_foto: f.id_foto,
                        url: f.url_foto,
                        orden: f.orden,
                    })),

                    tags: match.mascota.mascota_tag.map(t => ({
                        id_tag: t.opcion_tag.tag.id_tag,
                        nombre_tag: t.opcion_tag.tag.nombre_tag,
                        categoria: t.opcion_tag.tag.categoria,
                        valor: t.opcion_tag.valor,
                    })),
                },

      albergue: {
        id_usuario: match.mascota.albergue.id_usuario,
        nombre_albergue: match.mascota.albergue.nombre_albergue,
        descripcion: match.mascota.albergue.descripcion,
        whatsapp: match.mascota.albergue.whatsapp_actual,
        sitio_web: match.mascota.albergue.sitio_web,
        logo: match.mascota.albergue.logo,
      },

      contactos: (match.contacto_whatsapp || []).map(c => ({
        id_contacto: c.id_contacto,
        fecha: c.fecha_contacto,
        mensaje: c.mensaje_enviado,
        estado: c.estado,
      })),
    }
        };

    } catch (err) {
        console.error('[matchService] obtenerDetalleMatch:', err.message);
        throw err;
    }
};

const contactarAdoptante = async (idAlbergue, idMatch) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // 1. Buscar match e incluir relaciones necesarias
            const match = await tx.match.findUnique({
                where: { id_match: idMatch },
                include: {
                    mascota: { select: { nombre: true, id_albergue: true } },
                    adoptante: { select: { nombre_completo: true, whatsapp_adoptante: true, id_usuario: true } },
                }
            });

            if (!match) {
                return { success: false, status: 404, message: 'Match no encontrado.' };
            }

            // 2. Validar que la mascota del match pertenezca al albergue autenticado
            if (match.mascota.id_albergue !== idAlbergue) {
                return { success: false, status: 403, message: 'No tienes permiso para contactar este match.' };
            }

            // 3. Obtener datos del albergue para el mensaje
            const albergue = await tx.albergue.findUnique({
                where: { id_usuario: idAlbergue },
                select: { nombre_albergue: true }
            });

            // 4. Validar que el adoptante tenga WhatsApp
            const numWhatsapp = match.adoptante.whatsapp_adoptante;
            if (!numWhatsapp) {
                return { success: false, status: 400, message: 'El adoptante no tiene un número de WhatsApp registrado.' };
            }

            // 5. Verificar si ya fue contactado (previene duplicidad de notificaciones)
            const yaContactado = match.estado === 'contactado';

            // Construir mensaje predefinido
            const nombreAdoptante = match.adoptante.nombre_completo || 'Adoptante';
            const mensaje = `!Hola ${nombreAdoptante}! Somos ${albergue.nombre_albergue} y vimos que hiciste match con ${match.mascota.nombre}. Nos gustaria conversar contigo sobre el proceso de adopcion.`;
            const mensajeCodificado = encodeURIComponent(mensaje);
            // Formatear el numero removiendo '+' y caracteres no numericos, WhatsApp API prefiere solo numeros
            const numeroFormateado = numWhatsapp.replace(/\D/g, '');
            const enlaceWhatsapp = `https://wa.me/${numeroFormateado}?text=${mensajeCodificado}`;

            if (!yaContactado) {
                // Actualizar estado del match
                await tx.match.update({
                    where: { id_match: idMatch },
                    data: { estado: 'contactado' }
                });

                // Crear notificacion para el adoptante
                await tx.notificacion.create({
                    data: {
                        id_usuario: match.adoptante.id_usuario,
                        tipo_notificacion: 'contacto_albergue',
                        mensaje: `El albergue ${albergue.nombre_albergue} ha iniciado el proceso de contacto para la adopcion de ${match.mascota.nombre}. !Revisa tu WhatsApp!`,
                        recurso_tipo: 'match',
                        recurso_id: idMatch,
                    }
                });
            }

            // Registrar el evento de contacto en la tabla de auditoría (siempre registra un nuevo enlace generado)
            await tx.contactoWhatsapp.create({
                data: {
                    id_match: idMatch,
                    id_albergue: idAlbergue
                }
            });

            return {
                success: true,
                data: {
                    enlace_whatsapp: enlaceWhatsapp,
                    estado: yaContactado ? 'contactado' : 'contactado_actualizado'
                }
            };
        });
    } catch (err) {
        console.error('[matchService] contactarAdoptante:', err.message);
        throw err;
    }
};
module.exports = {
    calcularCompatibilidad,
    limpiarMatchesPendientes,
    registrarMatch,
    obtenerMatches,
    descartarMascota,
    obtenerDetalleMatch,
    contactarAdoptante,
};
