const prisma = require('../config/prisma');

const getEstadisticas = async () => {
  // === USUARIOS ===
  // Obtener roles primero para saber los IDs
  const roles = await prisma.rol.findMany();
  const rolAdoptanteId = roles.find(r => r.nombre_rol === 'adoptante')?.id_rol;
  const rolAlbergueId = roles.find(r => r.nombre_rol === 'albergue')?.id_rol;

  // Realizamos una consulta agrupada de usuarios por rol y estado
  const usuariosAgrupados = await prisma.usuario.groupBy({
    by: ['id_rol', 'estado_cuenta'],
    _count: { id_usuario: true }
  });

  let total_adoptantes = 0;
  let adoptantes_activos = 0;
  let adoptantes_inactivos = 0;
  
  let total_albergues = 0;
  let albergues_activos = 0;
  
  let suspendidos = 0;
  let total_usuarios_perfil_completo = 0;
  let total_usuarios_general = 0;

  for (const grupo of usuariosAgrupados) {
    const count = grupo._count.id_usuario;
    total_usuarios_general += count;

    if (grupo.estado_cuenta !== 'perfil_incompleto') {
      total_usuarios_perfil_completo += count;
    }

    if (grupo.estado_cuenta === 'suspendido') {
      suspendidos += count;
    }

    if (grupo.id_rol === rolAdoptanteId) {
      total_adoptantes += count;
      if (grupo.estado_cuenta === 'activo') adoptantes_activos += count;
      else adoptantes_inactivos += count;
    } else if (grupo.id_rol === rolAlbergueId) {
      total_albergues += count;
      if (grupo.estado_cuenta === 'activo') albergues_activos += count;
    }
  }

  const tasa_completitud = total_usuarios_general > 0 
    ? Math.round((total_usuarios_perfil_completo / total_usuarios_general) * 100) 
    : 0;

  // === MASCOTAS ===
  const mascotasAgrupadas = await prisma.mascota.groupBy({
    by: ['estado_adopcion'],
    _count: { id_mascota: true }
  });

  let total_mascotas = 0;
  const mascotas_por_estado = {
    disponible: 0,
    en_proceso: 0,
    adoptado: 0,
    archivado: 0
  };

  for (const grupo of mascotasAgrupadas) {
    const count = grupo._count.id_mascota;
    const estado = grupo.estado_adopcion || 'archivado';
    total_mascotas += count;
    if (mascotas_por_estado[estado] !== undefined) {
      mascotas_por_estado[estado] += count;
    } else {
      // Por si hay algún estado que no coincida exactamente
      mascotas_por_estado.archivado += count;
    }
  }

  // === MATCHING & ADOPCIONES ===
  const total_matches = await prisma.match.count();
  const total_adopciones = await prisma.adopcion.count();

  // Adopciones por mes (últimos 6 meses)
  // Usamos queryRaw para extraer y agrupar por mes
  const adopcionesMesRaw = await prisma.$queryRaw`
    SELECT 
      TO_CHAR(fecha_adopcion, 'YYYY-MM') as mes,
      CAST(COUNT(id_adopcion) AS INTEGER) as total
    FROM adopcion
    WHERE fecha_adopcion >= NOW() - INTERVAL '6 months'
    GROUP BY TO_CHAR(fecha_adopcion, 'YYYY-MM')
    ORDER BY mes ASC
  `;
  
  const adopciones_por_mes = adopcionesMesRaw.map(row => ({
    mes: row.mes,
    total: row.total
  }));

  // === TOP ALBERGUES ===
  const alberguesRanking = await prisma.adopcion.groupBy({
    by: ['id_albergue'],
    _count: { id_adopcion: true },
    orderBy: {
      _count: { id_adopcion: 'desc' }
    },
    take: 5
  });

  const top_albergues = [];
  for (const item of alberguesRanking) {
    const albergueInfo = await prisma.albergue.findUnique({
      where: { id_usuario: item.id_albergue },
      select: { nombre_albergue: true }
    });
    top_albergues.push({
      nombre: albergueInfo?.nombre_albergue || 'Albergue Desconocido',
      adopciones: item._count.id_adopcion
    });
  }

  return {
    usuarios: {
      total_adoptantes,
      adoptantes_activos,
      adoptantes_inactivos,
      total_albergues,
      albergues_activos,
      suspendidos,
      tasa_completitud
    },
    mascotas: {
      total: total_mascotas,
      por_estado: mascotas_por_estado
    },
    matching: {
      total_matches,
      total_adopciones,
      adopciones_por_mes
    },
    albergues_ranking: top_albergues
  };
};

module.exports = {
  getEstadisticas
};
