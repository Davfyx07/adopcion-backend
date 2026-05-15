const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');

// ──────────────────────────────────────────────
// HU-HIS-02: Historial de adopciones del albergue
// ──────────────────────────────────────────────

/**
 * Listar adopciones de las mascotas del albergue.
 * Filtros: fecha_desde, fecha_hasta, estado, busqueda (nombre adoptante/mascota)
 */
const listarAdopcionesAlbergue = async (idAlbergue, {
    fecha_desde,
    fecha_hasta,
    estado,
    busqueda,
    page = 1,
    limit = 20,
} = {}) => {
    try {
        const offset = (page - 1) * limit;

        const conditions = [
            Prisma.sql`m.id_albergue = ${idAlbergue}`,
            Prisma.sql`m.deleted_at IS NULL`,
        ];

        if (estado) {
            conditions.push(Prisma.sql`a.estado = ${estado}`);
        }
        if (fecha_desde) {
            conditions.push(Prisma.sql`a.fecha >= ${new Date(fecha_desde)}`);
        }
        if (fecha_hasta) {
            conditions.push(Prisma.sql`a.fecha <= ${new Date(fecha_hasta)}`);
        }
        if (busqueda) {
            const q = `%${busqueda}%`;
            conditions.push(Prisma.sql`(m.nombre ILIKE ${q} OR ad.nombre_completo ILIKE ${q})`);
        }

        const whereClause = Prisma.join(conditions, ' AND ');

        const [{ total }] = await prisma.$queryRaw`
            SELECT COUNT(*)::int AS total
            FROM adopcion a
            JOIN mascota m ON a.id_mascota = m.id_mascota
            JOIN adoptante ad ON a.id_adoptante = ad.id_usuario
            WHERE ${whereClause}
        `;

        if (total === 0) {
            return {
                success: true,
                data: [],
                meta: { page, limit, total: 0, pages: 0 },
            };
        }

        const adopciones = await prisma.$queryRaw`
            SELECT
                a.id_adopcion,
                m.nombre AS nombre_mascota,
                ad.nombre_completo AS nombre_adoptante,
                a.fecha AS fecha_adopcion,
                a.estado,
                a.porcentaje_compatibilidad
            FROM adopcion a
            JOIN mascota m ON a.id_mascota = m.id_mascota
            JOIN adoptante ad ON a.id_adoptante = ad.id_usuario
            WHERE ${whereClause}
            ORDER BY a.fecha DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        return {
            success: true,
            data: adopciones,
            meta: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    } catch (err) {
        console.error('[adopcionService] listarAdopcionesAlbergue:', err.message);
        throw err;
    }
};

/**
 * HU-HIS-02: Detalle de una adopción. Solo accesible por el albergue dueño.
 */
const obtenerDetalleAdopcion = async (idAdopcion, idAlbergue) => {
    try {
        const adopcion = await prisma.adopcion.findUnique({
            where: { id_adopcion: idAdopcion },
            include: {
                mascota: {
                    include: {
                        albergue: { select: { id_usuario: true, nombre_albergue: true } },
                        mascota_foto: { orderBy: { orden: 'asc' }, take: 1 },
                    },
                },
                adoptante: {
                    include: {
                        usuario: { select: { correo: true } },
                    },
                },
            },
        });

        if (!adopcion) {
            return { success: false, status: 404, message: 'Adopción no encontrada.' };
        }

        if (adopcion.mascota.id_albergue !== idAlbergue) {
            return { success: false, status: 403, message: 'No tienes permiso para ver esta adopción.' };
        }

        return {
            success: true,
            data: {
                id_adopcion: adopcion.id_adopcion,
                fecha: adopcion.fecha,
                estado: adopcion.estado,
                observaciones: adopcion.observaciones,
                fecha_match: adopcion.fecha_match,
                fecha_contacto: adopcion.fecha_contacto,
                porcentaje_compatibilidad: adopcion.porcentaje_compatibilidad,
                mascota: {
                    id_mascota: adopcion.mascota.id_mascota,
                    nombre: adopcion.mascota.nombre,
                    foto: adopcion.mascota.mascota_foto[0]?.url_foto || null,
                },
                adoptante: {
                    id_usuario: adopcion.adoptante.id_usuario,
                    nombre_completo: adopcion.adoptante.nombre_completo,
                    whatsapp: adopcion.adoptante.whatsapp_adoptante,
                    correo: adopcion.adoptante.usuario?.correo,
                },
            },
        };
    } catch (err) {
        console.error('[adopcionService] obtenerDetalleAdopcion:', err.message);
        throw err;
    }
};

/**
 * HU-HIS-02: Exportar adopciones del albergue en CSV.
 * Máximo 10,000 registros.
 */
const exportarAdopcionesCSV = async (idAlbergue, {
    fecha_desde,
    fecha_hasta,
    estado,
    busqueda,
} = {}) => {
    try {
        const conditions = [
            Prisma.sql`m.id_albergue = ${idAlbergue}`,
            Prisma.sql`m.deleted_at IS NULL`,
        ];

        if (estado) conditions.push(Prisma.sql`a.estado = ${estado}`);
        if (fecha_desde) conditions.push(Prisma.sql`a.fecha >= ${new Date(fecha_desde)}`);
        if (fecha_hasta) conditions.push(Prisma.sql`a.fecha <= ${new Date(fecha_hasta)}`);
        if (busqueda) {
            const q = `%${busqueda}%`;
            conditions.push(Prisma.sql`(m.nombre ILIKE ${q} OR ad.nombre_completo ILIKE ${q})`);
        }

        const whereClause = Prisma.join(conditions, ' AND ');

        const rows = await prisma.$queryRaw`
            SELECT
                a.fecha AS "Fecha",
                m.nombre AS "Mascota",
                ad.nombre_completo AS "Adoptante",
                u.correo AS "Email",
                a.porcentaje_compatibilidad AS "Porcentaje",
                a.estado AS "Estado",
                a.observaciones AS "Observaciones"
            FROM adopcion a
            JOIN mascota m ON a.id_mascota = m.id_mascota
            JOIN adoptante ad ON a.id_adoptante = ad.id_usuario
            JOIN usuario u ON ad.id_usuario = u.id_usuario
            WHERE ${whereClause}
            ORDER BY a.fecha DESC
            LIMIT 10000
        `;

        if (rows.length === 0) {
            return { success: false, status: 404, message: 'No hay adopciones para exportar.' };
        }

        // Generar CSV
        const headers = ['Fecha', 'Mascota', 'Adoptante', 'Email', 'Porcentaje', 'Estado', 'Observaciones'];
        const csvRows = [headers.join(',')];

        for (const row of rows) {
            const values = headers.map(h => {
                const val = row[h];
                if (val === null || val === undefined) return '';
                const str = String(val);
                // Escapar comillas en CSV
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            });
            csvRows.push(values.join(','));
        }

        return {
            success: true,
            csv: csvRows.join('\n'),
            total: rows.length,
        };
    } catch (err) {
        console.error('[adopcionService] exportarAdopcionesCSV:', err.message);
        throw err;
    }
};

module.exports = {
    listarAdopcionesAlbergue,
    obtenerDetalleAdopcion,
    exportarAdopcionesCSV,
};
