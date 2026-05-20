/**
 * adminConfigService.js — HU-ADM-CONFIG
 *
 * Gestión de configuración del sistema (tabla configuracion_sistema).
 *   - getConfiguracion:        retorna todos los registros agrupados por grupo
 *   - getConfiguracionGrupo:   retorna los registros de un grupo específico
 *   - updateConfiguracionGrupo: upsert de todos los pares clave/valor de un grupo
 */

const prisma = require('../config/prisma');

/**
 * Retorna todos los registros de configuracion_sistema agrupados por `grupo`.
 *
 * @returns {Promise<Record<string, Record<string, string>>>}
 * Ej: { publicacion: { limite_mascotas: "50", ... }, matching: { ... } }
 */
const getConfiguracion = async () => {
    const rows = await prisma.configuracionSistema.findMany({
        orderBy: [{ grupo: 'asc' }, { clave: 'asc' }],
    });

    return rows.reduce((acc, row) => {
        const grupo = row.grupo || 'general';
        // Extract the key suffix after the dot (e.g. "publicacion.limite_mascotas" → "limite_mascotas")
        const keyParts = row.clave.split('.');
        const shortKey = keyParts.length > 1 ? keyParts.slice(1).join('.') : row.clave;

        if (!acc[grupo]) acc[grupo] = {};
        acc[grupo][shortKey] = row.valor;
        return acc;
    }, {});
};

/**
 * Retorna los registros de un grupo específico como objeto plano { shortKey: valor }.
 *
 * @param {string} grupo
 * @returns {Promise<Record<string, string>>}
 */
const getConfiguracionGrupo = async (grupo) => {
    const rows = await prisma.configuracionSistema.findMany({
        where: { grupo },
        orderBy: { clave: 'asc' },
    });

    return rows.reduce((acc, row) => {
        const keyParts = row.clave.split('.');
        const shortKey = keyParts.length > 1 ? keyParts.slice(1).join('.') : row.clave;
        acc[shortKey] = row.valor;
        return acc;
    }, {});
};

/**
 * Upsert de todos los pares clave/valor de un grupo.
 * Las claves del body son los sufijos (e.g. "limite_mascotas"),
 * y se expanden a "grupo.shortKey" para buscarlas en la BD.
 *
 * @param {string} grupo
 * @param {Record<string, string|number>} values  - { shortKey: valor }
 * @returns {Promise<Record<string, string>>}
 */
const updateConfiguracionGrupo = async (grupo, values) => {
    const updates = Object.entries(values).map(([shortKey, valor]) => {
        const clave = `${grupo}.${shortKey}`;
        return prisma.configuracionSistema.upsert({
            where: { clave },
            update: { valor: String(valor) },
            create: {
                clave,
                valor: String(valor),
                grupo,
            },
        });
    });

    await Promise.all(updates);
    return getConfiguracionGrupo(grupo);
};

module.exports = {
    getConfiguracion,
    getConfiguracionGrupo,
    updateConfiguracionGrupo,
};
