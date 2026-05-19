const prisma = require('../config/prisma');

/**
 * Retorna estadísticas KPI para el dashboard de administrador.
 * Cubre: usuarios, mascotas, matching y ranking de albergues.
 *
 * @returns {Promise<Object>} Objeto con las métricas del sistema
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
        // Adoptantes: usuarios con rol 'adoptante'
        prisma.usuario.count({
            where: {
                usuario_rol: { some: { rol: { nombre: 'adoptante' } } },
            },
        }),
        prisma.usuario.count({
            where: {
                estado: 'activo',
                usuario_rol: { some: { rol: { nombre: 'adoptante' } } },
            },
        }),
        prisma.usuario.count({
            where: {
                estado: 'inactivo',
                usuario_rol: { some: { rol: { nombre: 'adoptante' } } },
            },
        }),
        // Albergues: usuarios con rol 'albergue'
        prisma.usuario.count({
            where: {
                usuario_rol: { some: { rol: { nombre: 'albergue' } } },
            },
        }),
        prisma.usuario.count({
            where: {
                estado: 'activo',
                usuario_rol: { some: { rol: { nombre: 'albergue' } } },
            },
        }),
        // Suspendidos (cualquier rol)
        prisma.usuario.count({ where: { estado: 'suspendido' } }),
        // Usuarios con perfil completo (estado != 'perfil_incompleto')
        prisma.usuario.count({
            where: { estado: { not: 'perfil_incompleto' } },
        }),
        // Total usuarios (para tasa de completitud)
        prisma.usuario.count(),
    ]);

    const tasaCompletitud =
        totalUsuarios > 0
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
        prisma.mascota.count({ where: { estado: 'disponible' } }),
        prisma.mascota.count({ where: { estado: 'en_proceso' } }),
        prisma.mascota.count({ where: { estado: 'adoptado' } }),
        prisma.mascota.count({ where: { estado: 'archivado' } }),
    ]);

    // ── MATCHING ──────────────────────────────────────────────────
    const [totalMatches, totalAdopciones] = await Promise.all([
        prisma.match.count(),
        prisma.adopcion.count(),
    ]);

    // Adopciones por mes — últimos 6 meses
    // $queryRaw retorna filas con { mes: Date, total: BigInt }
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

    // ── RANKING ALBERGUES (top 5 por adopciones completadas) ──────
    const rawRanking = await prisma.$queryRaw`
        SELECT
            al.nombre                  AS nombre,
            COUNT(ad.id_adopcion)::int AS adopciones
        FROM albergue AS al
        JOIN mascota  AS ma ON ma.id_albergue = al.id_albergue
        JOIN adopcion AS ad ON ad.id_mascota   = ma.id_mascota
        GROUP BY al.id_albergue, al.nombre
        ORDER BY adopciones DESC
        LIMIT 5
    `;

    const alberguesRanking = rawRanking.map((row) => ({
        nombre: row.nombre,
        adopciones: Number(row.adopciones),
    }));

    // ── RESULTADO ─────────────────────────────────────────────────
    return {
        usuarios: {
            total_adoptantes: totalAdoptantes,
            adoptantes_activos: adoptantesActivos,
            adoptantes_inactivos: adoptantesInactivos,
            total_albergues: totalAlbergues,
            albergues_activos: alberguesActivos,
            suspendidos,
            tasa_completitud: tasaCompletitud,
        },
        mascotas: {
            total: totalMascotas,
            por_estado: {
                disponible,
                en_proceso,
                adoptado,
                archivado,
            },
        },
        matching: {
            total_matches: totalMatches,
            total_adopciones: totalAdopciones,
            adopciones_por_mes: adopcionesPorMes,
        },
        albergues_ranking: alberguesRanking,
    };
};

module.exports = { getEstadisticas };
