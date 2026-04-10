const pool = require('../config/db');

/**
 * Calcula un vector de embedding binario basado en los tags seleccionados.
 * El vector tiene longitud igual al número total de etiquetas en el catálogo,
 * donde cada posición vale 1.0 si el tag fue seleccionado, 0.0 si no.
 * El orden de posiciones es determinístico: etiquetas ordenadas por id_etiqueta ASC.
 *
 * @param {number[]} tagIds - IDs de las etiquetas seleccionadas por el usuario
 * @returns {Promise<number[]>} Vector de embedding
 */
const calcularEmbedding = async (tagIds) => {
    const result = await pool.query(
        'SELECT id_etiqueta FROM etiqueta ORDER BY id_etiqueta ASC'
    );

    if (result.rows.length === 0) {
        return [];
    }

    const tagSet = new Set(tagIds.map(Number));
    return result.rows.map(row => (tagSet.has(row.id_etiqueta) ? 1.0 : 0.0));
};

module.exports = { calcularEmbedding };
