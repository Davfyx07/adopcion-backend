const prisma = require('../config/prisma');

/**
 * Obtiene el catálogo completo de opciones de tags disponibles.
 * Hace JOIN entre Opcion_Tag y Tag para obtener la categoría y si es obligatorio.
 *
 * @returns {Promise<Array>} Lista de opciones con id, valor, categoria y si el tag padre es obligatorio
 */
const getEtiquetas = async () => {
    // Usamos $queryRaw porque Prisma no soporta ORDER BY sobre columnas de tablas
    // relacionadas con `include`. La query original hace JOIN Tag + OpcionTag
    // y ordena por t.categoria ASC, ot.valor ASC.
    const result = await prisma.$queryRaw`
        SELECT ot.id_opcion, ot.valor, t.nombre_tag AS categoria, t.es_filtro_absoluto AS es_obligatoria
        FROM opcion_tag ot
        JOIN tag t ON ot.id_tag = t.id_tag
        WHERE t.estado = 'activo'
        ORDER BY t.categoria ASC, ot.valor ASC
    `;
    return result;
};

/**
 * Obtiene los IDs de Tags (categorías) marcados como obligatorios (es_filtro_absoluto = TRUE).
 * El adoptante debe seleccionar al menos una opción de cada Tag obligatorio.
 *
 * @param {Object} _client - (Sin uso en Prisma) Se mantiene el parámetro por compatibilidad
 *                           de interfaz mientras se migran los llamadores.
 * @returns {Promise<number[]>} IDs de Tags obligatorios
 */
const getTagsObligatorios = async (_client) => {
    const tags = await prisma.tag.findMany({
        where: { es_filtro_absoluto: true, estado: 'activo' },
        select: { id_tag: true }
    });
    return tags.map(t => t.id_tag);
};

/**
 * Valida que el adoptante haya seleccionado al menos una opción de cada Tag obligatorio.
 *
 * @param {number[]} opcionIds - IDs de las opciones seleccionadas por el adoptante
 * @param {Object} _client - (Sin uso en Prisma) Se mantiene el parámetro por compatibilidad
 * @returns {Promise<{ valid: boolean, tagsFaltantes?: number[] }>}
 */
const validarTagsObligatorios = async (opcionIds, _client) => {
    const tagsObligatorios = await getTagsObligatorios();

    if (tagsObligatorios.length === 0) return { valid: true };

    // Obtener a qué Tags pertenecen las opciones seleccionadas
    const opciones = await prisma.opcion_tag.findMany({
        where: {
            id_opcion: { in: opcionIds },
            tag: { es_filtro_absoluto: true }
        },
        select: { id_tag: true },
        distinct: ['id_tag']
    });

    const tagsCubiertos = new Set(opciones.map(o => o.id_tag));
    const tagsFaltantes = tagsObligatorios.filter(id => !tagsCubiertos.has(id));

    if (tagsFaltantes.length > 0) {
        return { valid: false, tagsFaltantes };
    }
    return { valid: true };
};

module.exports = { getEtiquetas, getTagsObligatorios, validarTagsObligatorios };
