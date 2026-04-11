const pool = require('../config/db');

/**
 * Obtiene el catálogo completo de opciones de tags disponibles.
 * Hace JOIN entre Opcion_Tag y Tag para obtener la categoría y si es obligatorio.
 * 
 * @returns {Promise<Array>} Lista de opciones con id, valor, categoria y si el tag padre es obligatorio
 */
const getEtiquetas = async () => {
    const result = await pool.query(
        `SELECT ot.id_opcion, ot.valor, t.nombre_tag AS categoria, t.es_filtro_absoluto AS es_obligatoria
         FROM Opcion_Tag ot
         JOIN Tag t ON ot.id_tag = t.id_tag
         WHERE t.estado = 'activo'
         ORDER BY t.categoria ASC, ot.valor ASC`
    );
    return result.rows;
};

/**
 * Obtiene los IDs de Tags (categorías) marcados como obligatorios (es_filtro_absoluto = TRUE).
 * El adoptante debe seleccionar al menos una opción de cada Tag obligatorio.
 * 
 * @param {Object} client - Cliente de transacción PostgreSQL
 * @returns {Promise<string[]>} IDs de Tags obligatorios (UUIDs)
 */
const getTagsObligatorios = async (client) => {
    const result = await client.query(
        "SELECT id_tag FROM Tag WHERE es_filtro_absoluto = TRUE AND estado = 'activo'"
    );
    return result.rows.map(r => r.id_tag);
};

/**
 * Valida que el adoptante haya seleccionado al menos una opción de cada Tag obligatorio.
 * 
 * @param {string[]} opcionIds - UUIDs de las opciones seleccionadas por el adoptante
 * @param {Object} client - Cliente de transacción PostgreSQL
 * @returns {Promise<{ valid: boolean, tagsFaltantes?: string[] }>}
 */
const validarTagsObligatorios = async (opcionIds, client) => {
    const tagsObligatorios = await getTagsObligatorios(client);

    if (tagsObligatorios.length === 0) return { valid: true };

    // Obtener a qué Tags pertenecen las opciones seleccionadas
    const result = await client.query(
        `SELECT DISTINCT t.id_tag 
         FROM Opcion_Tag ot 
         JOIN Tag t ON ot.id_tag = t.id_tag
         WHERE ot.id_opcion = ANY($1) AND t.es_filtro_absoluto = TRUE`,
        [opcionIds]
    );

    const tagsCubiertos = new Set(result.rows.map(r => r.id_tag));
    const tagsFaltantes = tagsObligatorios.filter(id => !tagsCubiertos.has(id));

    if (tagsFaltantes.length > 0) {
        return { valid: false, tagsFaltantes };
    }
    return { valid: true };
};

module.exports = { getEtiquetas, getTagsObligatorios, validarTagsObligatorios };
