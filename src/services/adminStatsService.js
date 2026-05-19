const prisma = require('../config/prisma');

/**
 * Retorna estadísticas KPI para el dashboard de administrador.
 * Usa los nombres de campo reales del schema Prisma:
 *   - usuario.id_rol (1=adoptante, 2=albergue, 3=administrador)
 *   - usuario.estado_cuenta ('activo', 'suspendido', 'perfil_incompleto', etc.)
 *   - mascota.estado_adopcion ('disponible', 'en_proceso', 'adoptado', 'archivado')
 *   - albergue.nombre_albergue
 */
const getEstadisticas = async () => {
    // ── USUARIOS ──────────────────────────────────────────────────
    const [
        totalAdoptantes,
        adoptantesActivos,
        adoptantesInactivos,
        totalAlbergues,
        alberguesActivos,
        suspendidos,
        totalConPerfil,
        totalUsuarios,
    ] = await Promise.all([
        // id_rol 1 = adoptante
        prisma.usuario.count({ where: { id_rol: 1 } }),
        prisma.usuario.count({ where: { id_rol: 1, estado_cuenta: 'activo' } }),
        prisma.usuario.count({ where: { id_rol: 1, estado_cuenta: { notIn: ['activo', 'suspendido'] } } }),
        // id_rol 2 = albergue
        prisma.usuario.count({ where: { id_rol: 2 } }),
        prisma.usuario.count({ where: { id_rol: 2, estado_cuenta: 'activo' } }),
        // Suspendidos (cualquier rol)
        prisma.usuario.count({ where: { estado_cuenta: 'suspendido' } }),
        // Perfil completo = estado_cuenta != 'perfil_incompleto'
        prisma.usuario.count({ where: { estado_cuenta: { not: 'perfil_incompleto' } } }),
        prisma.usuario.count(),
    ]);

    const tasaCompletitud = totalUsuarios > 0
        ? Math.round((totalConPerfil / totalUsuarios) * 100)
        : 0;

    // ── MASCOTAS ──────────────────────────────────────────────────
    const [
        totalMascotas,
        disponible,
        en_proceso,
        adoptado,
        archivado,
    ] = await Promise.all([
        prisma.mascota.count(),
        prisma.mascota.count({ where: { estado_adopcion: 'disponible' } }),
        prisma.mascota.count({ where: { estado_adopcion: 'en_proceso' } }),
        prisma.mascota.count({ where: { estado_adopcion: 'adoptado' } }),
        prisma.mascota.count({ where: { estado_adopcion: 'archivado' } }),
    ]);

    // ── MATCHING ──────────────────────────────────────────────────
    const [totalMatches, totalAdopciones] = await Promise.all([
        prisma.match.count(),
        prisma.adopcion.count(),
    ]);

    // Adopciones por mes — últimos 6 meses
    const rawMeses = await prisma.$queryRaw`
        SELECT
            DATE_TRUNC('month', fecha) AS mes,
            COUNT(*)::int              AS total
        FROM adopcion
        WHERE fecha >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', fecha)
        ORDER BY mes ASC
    `;

    const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                         'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const adopcionesPorMes = rawMeses.map((row) => ({
        mes: MONTH_NAMES[new Date(row.mes).getUTCMonth()],
        total: Number(row.total),
    }));

    // ── RANKING ALBERGUES (top 5 por adopciones) ──────────────────
    const rawRanking = await prisma.$queryRaw`
        SELECT
            al.nombre_albergue             AS nombre,
            COUNT(ad.id_adopcion)::int     AS adopciones
        FROM albergue AS al
        JOIN mascota  AS ma ON ma.id_albergue = al.id_usuario
        JOIN adopcion AS ad ON ad.id_mascota  = ma.id_mascota
        GROUP BY al.id_usuario, al.nombre_albergue
        ORDER BY adopciones DESC
        LIMIT 5
    `;

    const alberguesRanking = rawRanking.map((row) => ({
        nombre: row.nombre,
        adopciones: Number(row.adopciones),
    }));

    return {
        usuarios: {
            total_adoptantes:    totalAdoptantes,
            adoptantes_activos:  adoptantesActivos,
            adoptantes_inactivos: adoptantesInactivos,
            total_albergues:     totalAlbergues,
            albergues_activos:   alberguesActivos,
            suspendidos,
            tasa_completitud:    tasaCompletitud,
        },
        mascotas: {
            total: totalMascotas,
            por_estado: { disponible, en_proceso, adoptado, archivado },
        },
        matching: {
            total_matches:        totalMatches,
            total_adopciones:     totalAdopciones,
            adopciones_por_mes:   adopcionesPorMes,
        },
        albergues_ranking: alberguesRanking,
    };
};

module.exports = { getEstadisticas };
