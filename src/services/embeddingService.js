const prisma = require('../config/prisma');

/**
 * Calcula un vector de embedding binario basado en las opciones de tags seleccionadas.
 * El vector tiene longitud igual al número total de opciones en el catálogo,
 * donde cada posición vale 1.0 si la opción fue seleccionada, 0.0 si no.
 * El orden de posiciones es determinístico: opciones ordenadas por id_opcion ASC.
 *
 * NOTA: El esquema actual de BD no tiene columna 'embedding' en la tabla Adoptante.
 * Este servicio está listo para cuando se agregue dicha columna al esquema.
 *
 * @param {number[]} opcionIds - IDs de las opciones seleccionadas por el usuario
 * @returns {Promise<number[]>} Vector de embedding
 */
const calcularEmbedding = async (opcionIds) => {
    const opciones = await prisma.opcionTag.findMany({
        orderBy: { id_opcion: 'asc' }
    });

    if (opciones.length === 0) {
        return [];
    }

    const selectedSet = new Set(opcionIds);
    return opciones.map(row => (selectedSet.has(row.id_opcion) ? 1.0 : 0.0));
};

module.exports = { calcularEmbedding };
