const prisma = require('../config/prisma');

const getConfiguracion = async () => {
  const configs = await prisma.configuracionSistema.findMany();
  
  const grouped = {};
  for (const row of configs) {
    const grupo = row.grupo || 'general';
    if (!grouped[grupo]) {
      grouped[grupo] = {};
    }
    grouped[grupo][row.clave] = row.valor;
  }
  
  return grouped;
};

const updateConfiguracionGrupo = async (grupo, values, adminId, ip) => {
  return prisma.$transaction(async (tx) => {
    // Obtener valores anteriores para auditoría
    const previousConfigs = await tx.configuracionSistema.findMany({
      where: { grupo }
    });
    
    const oldValues = {};
    for (const c of previousConfigs) {
      oldValues[c.clave] = c.valor;
    }

    // Actualizar o crear cada clave de configuración enviada
    const promises = Object.entries(values).map(([clave, valor]) => {
      return tx.configuracionSistema.upsert({
        where: { clave },
        update: { valor: String(valor), grupo },
        create: { clave, valor: String(valor), grupo }
      });
    });

    await Promise.all(promises);

    // Registrar auditoría
    await tx.logAuditoria.create({
      data: {
        id_autor: adminId,
        accion: 'UPDATE_CONFIG',
        entidad_afectada: 'configuracion_sistema',
        valor_anterior: JSON.stringify(oldValues),
        valor_nuevo: JSON.stringify(values),
        motivo: `Actualización de configuración del grupo: ${grupo}`,
        ip: ip
      }
    });

    return { success: true };
  });
};

module.exports = {
  getConfiguracion,
  updateConfiguracionGrupo
};
