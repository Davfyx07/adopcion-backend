const prisma = require('../config/prisma');

/**
 * Calcula un vector de embedding basado en las opciones de tags seleccionadas.
 * Para Adoptante: usa los pesos configurados en la tabla Tag.
 * Para Mascota: usa 1.0 para indicar presencia.
 *
 * @param {number[]} opcionIds - IDs de las opciones seleccionadas
 * @param {string} tipo - 'adoptante' o 'mascota'
 * @returns {Promise<number[]>} Vector de embedding
 */
const calcularEmbedding = async (opcionIds, tipo = 'mascota') => {
    // Obtenemos todas las opciones junto con el peso de su tag
    const opciones = await prisma.opcionTag.findMany({
        orderBy: { id_opcion: 'asc' },
        include: { tag: true }
    });

    if (opciones.length === 0) {
        return [];
    }

    const selectedSet = new Set(opcionIds);

    return opciones.map(row => {
        if (!selectedSet.has(row.id_opcion)) {
            return 0.0;
        }
        
        if (tipo === 'adoptante') {
            return Number(row.tag.peso_matching || 0);
        }
        
        return 1.0;
    });
};

module.exports = { calcularEmbedding };
