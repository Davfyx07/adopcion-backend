const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');

// ──────────────────────────────────────────────
// HU-MCH-01: Listar matches del albergue
// ──────────────────────────────────────────────

/**
 * Retorna todos los matches asociados a las mascotas del albergue.
 * Soporta filtros por estado, fecha, id_mascota; paginación y ordenamiento.
 */
const listarMatchesAlbergue = async (idAlbergue, {
    estado,
    fecha_desde,
    fecha_hasta,
    id_mascota,
    order_by = 'fecha',
    limit = 20,
    offset = 0,
} = {}) => {
    try {
        const where = {
            mascota: {
                id_albergue: idAlbergue,
                deleted_at: null,
            },
        };

        if (estado) where.estado = estado;
        if (id_mascota) where.id_mascota = id_mascota;
        if (fecha_desde || fecha_hasta) {
            where.fecha = {};
            if (fecha_desde) where.fecha.gte = new Date(fecha_desde);
            if (fecha_hasta) where.fecha.lte = new Date(fecha_hasta);
        }

        const orderByMap = {
            puntaje: { puntaje: 'desc' },
            fecha: { fecha: 'desc' },
        };
        const orderBy = orderByMap[order_by] || { fecha: 'desc' };

        const [matches, total, pendientes] = await Promise.all([
            prisma.match.findMany({
                where,
                orderBy,
                skip: Number(offset),
                take: Number(limit),
                include: {
                    mascota: {
                        select: {
                            id_mascota: true,
                            nombre: true,
                            estado_adopcion: true,
                            mascota_foto: {
                                orderBy: { orden: 'asc' },
                                take: 1,
                                select: { url_foto: true },
                            },
                        },
                    },
                    adoptante: {
                        select: {
                            id_usuario: true,
                            nombre_completo: true,
                            foto_perfil: true,
                            ciudad: true,
                        },
                    },
                },
            }),
            prisma.match.count({ where }),
            prisma.match.count({
                where: {
                    ...where,
                    estado: 'pendiente',
                },
            }),
        ]);

        const data = matches.map(m => ({
            id_match: m.id_match,
            estado: m.estado,
            puntaje: m.puntaje,
            fecha: m.fecha,
            mascota: {
                id_mascota: m.mascota.id_mascota,
                nombre: m.mascota.nombre,
                estado_adopcion: m.mascota.estado_adopcion,
                foto: m.mascota.mascota_foto[0]?.url_foto || null,
            },
            adoptante: {
                id_usuario: m.adoptante.id_usuario,
                nombre_completo: m.adoptante.nombre_completo,
                foto_perfil: m.adoptante.foto_perfil,
                ciudad: m.adoptante.ciudad,
            },
        }));

        return {
            success: true,
            matches_pendientes: pendientes,
            pagination: { total, limit: Number(limit), offset: Number(offset) },
            data,
        };
    } catch (err) {
        console.error('[albergueMatchService] listarMatchesAlbergue:', err.message);
        throw err;
    }
};

/**
 * HU-MCH-01: Detalle de un match para el albergue.
 * Incluye datos del adoptante (perfil, tags, preferencias) e historial de contactos.
 */
const obtenerDetalleMatchAlbergue = async (idMatch, idAlbergue) => {
    try {
        const match = await prisma.match.findFirst({
            where: {
                id_match: idMatch,
                mascota: { id_albergue: idAlbergue },
            },
            include: {
                mascota: {
                    include: {
                        mascota_foto: { orderBy: { orden: 'asc' } },
                        mascota_tag: {
                            include: {
                                opcion_tag: { include: { tag: true } },
                            },
                        },
                    },
                },
                adoptante: {
                    include: {
                        adoptante_tag: {
                            include: {
                                opcion_tag: { include: { tag: true } },
                            },
                        },
                    },
                },
                contacto_whatsapp: {
                    orderBy: { fecha_contacto: 'desc' },
                    select: {
                        id_contacto: true,
                        fecha_contacto: true,
                        id_albergue: true,
                    },
                },
            },
        });

        if (!match) {
            return { success: false, status: 404, message: 'Match no encontrado.' };
        }

        return {
            success: true,
            data: {
                id_match: match.id_match,
                estado: match.estado,
                puntaje_compatibilidad: match.puntaje,
                fecha_match: match.fecha,
                adoptante: {
                    id_usuario: match.adoptante.id_usuario,
                    nombre_completo: match.adoptante.nombre_completo,
                    foto_perfil: match.adoptante.foto_perfil,
                    whatsapp: match.adoptante.whatsapp_adoptante,
                    ciudad: match.adoptante.ciudad,
                    tags: match.adoptante.adoptante_tag.map(t => ({
                        id_tag: t.opcion_tag.tag.id_tag,
                        nombre_tag: t.opcion_tag.tag.nombre_tag,
                        categoria: t.opcion_tag.tag.categoria,
                        valor: t.opcion_tag.valor,
                    })),
                },
                mascota: {
                    id_mascota: match.mascota.id_mascota,
                    nombre: match.mascota.nombre,
                    estado_adopcion: match.mascota.estado_adopcion,
                    fotos: match.mascota.mascota_foto.map(f => ({
                        id_foto: f.id_foto,
                        url: f.url_foto,
                        orden: f.orden,
                    })),
                    tags: match.mascota.mascota_tag.map(t => ({
                        id_tag: t.opcion_tag.tag.id_tag,
                        nombre_tag: t.opcion_tag.tag.nombre_tag,
                        valor: t.opcion_tag.valor,
                    })),
                },
                historial_contactos: match.contacto_whatsapp.map(c => ({
                    id_contacto: c.id_contacto,
                    fecha_contacto: c.fecha_contacto,
                })),
            },
        };
    } catch (err) {
        console.error('[albergueMatchService] obtenerDetalleMatchAlbergue:', err.message);
        throw err;
    }
};

module.exports = {
    listarMatchesAlbergue,
    obtenerDetalleMatchAlbergue,
};
