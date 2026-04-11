const pool = require('../config/db');

/**
 * Obtiene el catálogo completo de etiquetas disponibles.
 * @returns {Promise<Array>} Lista de etiquetas con id, nombre, categoria y si es obligatoria
 */
const getEtiquetas = async () => {
    const result = await pool.query(
        `SELECT id_etiqueta, nombre, categoria, es_obligatoria
         FROM etiqueta
         ORDER BY categoria ASC, nombre ASC`
    );
    return result.rows;
};

/**
 * Obtiene únicamente las etiquetas marcadas como obligatorias.
 * @returns {Promise<number[]>} IDs de etiquetas obligatorias
 */
const getEtiquetasObligatorias = async (client) => {
    const result = await client.query(
        'SELECT id_etiqueta FROM etiqueta WHERE es_obligatoria = TRUE'
    );
    return result.rows.map(r => r.id_etiqueta);
};

module.exports = { getEtiquetas, getEtiquetasObligatorias };
