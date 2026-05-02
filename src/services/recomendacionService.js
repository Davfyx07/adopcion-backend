const prisma = require('../config/prisma');

/**
 * Obtiene el feed de mascotas recomendadas para un adoptante.
 * @param {number} idAdoptante 
 * @param {Object} options - { limit, offset }
 */
const obtenerRecomendaciones = async (idAdoptante, { limit = 20, offset = 0 } = {}) => {
    try {
        // 1. Obtener datos del adoptante y sus tags
        const adoptante = await prisma.adoptante.findUnique({
            where: { id_usuario: idAdoptante },
            include: { adoptante_tag: { include: { opcion_tag: true } } }
        });

        if (!adoptante) throw new Error('Adoptante no encontrado.');

        const adoptanteTags = adoptante.adoptante_tag.map(at => at.id_opcion);
        const adoptanteCategorias = {}; // { id_tag: [id_opcion, ...] }
        adoptante.adoptante_tag.forEach(at => {
            if (!adoptanteCategorias[at.opcion_tag.id_tag]) adoptanteCategorias[at.opcion_tag.id_tag] = [];
            adoptanteCategorias[at.opcion_tag.id_tag].push(at.id_opcion);
        });

        // 2. Obtener IDs de mascotas ya procesadas (Match o Descarte)
        const matches = await prisma.match.findMany({
            where: { id_adoptante: idAdoptante },
            select: { id_mascota: true }
        });
        const descartes = await prisma.descarte.findMany({
            where: { id_adoptante: idAdoptante },
            select: { id_mascota: true }
        });

        const procesadasIds = [...matches.map(m => m.id_mascota), ...descartes.map(d => d.id_mascota)];

        // 3. Obtener todas las mascotas disponibles
        const mascotas = await prisma.mascota.findMany({
            where: {
                estado_adopcion: 'disponible',
                id_mascota: { notIn: procesadasIds }
            },
            include: {
                mascota_tag: { include: { opcion_tag: true } },
                mascota_foto: { orderBy: { orden: 'asc' } },
                albergue: true
            }
        });

        // 4. Obtener pesos y filtros absolutos de los tags
        const tagsConfig = await prisma.tag.findMany({
            where: { estado: 'activo' }
        });

        const recomendaciones = mascotas.map(mascota => {
            let puntajeTotal = 0;
            let esValida = true;

            // Organizar tags de la mascota por categoría
            const mascotaCategorias = {};
            mascota.mascota_tag.forEach(mt => {
                if (!mascotaCategorias[mt.opcion_tag.id_tag]) mascotaCategorias[mt.opcion_tag.id_tag] = [];
                mascotaCategorias[mt.opcion_tag.id_tag].push(mt.id_opcion);
            });

            for (const tag of tagsConfig) {
                const idTag = tag.id_tag;
                const peso = parseFloat(tag.peso_matching || 0) / 100;
                const adoptanteOpciones = adoptanteCategorias[idTag] || [];
                const mascotaOpciones = mascotaCategorias[idTag] || [];

                // Lógica de compatibilidad para esta categoría
                let matchEnCategoria = false;
                
                // Si el adoptante no tiene preferencias en esta categoría, es 100% (según RF-MT-01)
                if (adoptanteOpciones.length === 0) {
                    matchEnCategoria = true;
                } else {
                    // Verificar si hay intersección entre opciones de adoptante y mascota
                    matchEnCategoria = mascotaOpciones.some(id => adoptanteOpciones.includes(id));
                }

                // Filtro absoluto
                if (tag.es_filtro_absoluto && !matchEnCategoria) {
                    esValida = false;
                    break;
                }

                if (matchEnCategoria) {
                    puntajeTotal += peso;
                }
            }

            const porcentajeCompatibilidad = Math.round(puntajeTotal * 100);

            if (!esValida || porcentajeCompatibilidad < 30) return null;

            return {
                id_mascota: mascota.id_mascota,
                nombre: mascota.nombre,
                descripcion: mascota.descripcion,
                fotos: mascota.mascota_foto.map(f => f.url_foto),
                albergue: {
                    id: mascota.albergue.id_usuario,
                    nombre: mascota.albergue.nombre_albergue,
                    logo: mascota.albergue.logo
                },
                compatibilidad: porcentajeCompatibilidad
            };
        }).filter(r => r !== null);

        // 5. Ordenar y paginar
        recomendaciones.sort((a, b) => b.compatibilidad - a.compatibilidad);
        const paginadas = recomendaciones.slice(offset, offset + limit);

        return {
            success: true,
            data: paginadas,
            total: recomendaciones.length
        };

    } catch (err) {
        console.error('[recomendacion.service] obtenerRecomendaciones:', err.message);
        throw err;
    }
};

/**
 * Registra interés (Swipe derecho)
 */
const registrarInteres = async (idAdoptante, idMascota) => {
    try {
        // 1. Validar mascota
        const mascota = await prisma.mascota.findUnique({
            where: { id_mascota: idMascota },
            include: { albergue: true }
        });
        if (!mascota || mascota.estado_adopcion !== 'disponible') {
            return { success: false, status: 404, message: 'Mascota no disponible.' };
        }

        // 2. Validar duplicado
        const existeMatch = await prisma.match.findFirst({
            where: { id_adoptante: idAdoptante, id_mascota: idMascota }
        });
        if (existeMatch) return { success: false, status: 400, message: 'Ya existe un match con esta mascota.' };

        // 3. Crear Match y Notificación (Transaccional)
        return await prisma.$transaction(async (tx) => {
            const nuevoMatch = await tx.match.create({
                data: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                    estado: 'pendiente'
                }
            });

            await tx.notificacion.create({
                data: {
                    id_usuario: mascota.id_albergue,
                    tipo_notificacion: 'match',
                    mensaje: `¡Nuevo interés! Alguien quiere adoptar a ${mascota.nombre}.`,
                    recurso_tipo: 'match',
                    recurso_id: nuevoMatch.id_match
                }
            });

            return { success: true, data: nuevoMatch };
        });
    } catch (err) {
        console.error('[recomendacion.service] registrarInteres:', err.message);
        throw err;
    }
};

/**
 * Registra descarte (Swipe izquierdo)
 */
const registrarDescarte = async (idAdoptante, idMascota) => {
    try {
        const existe = await prisma.descarte.findUnique({
            where: { id_adoptante_id_mascota: { id_adoptante: idAdoptante, id_mascota: idMascota } }
        });
        if (existe) return { success: false, status: 400, message: 'Ya has descartado esta mascota.' };

        const descarte = await prisma.descarte.create({
            data: { id_adoptante: idAdoptante, id_mascota: idMascota }
        });

        return { success: true, data: descarte };
    } catch (err) {
        console.error('[recomendacion.service] registrarDescarte:', err.message);
        throw err;
    }
};

/**
 * Deshace la última acción (Match o Descarte)
 */
const deshacerUltimaAccion = async (idAdoptante) => {
    try {
        // Buscar último Match
        const ultimoMatch = await prisma.match.findFirst({
            where: { id_adoptante: idAdoptante },
            orderBy: { fecha: 'desc' }
        });

        // Buscar último Descarte
        const ultimoDescarte = await prisma.descarte.findFirst({
            where: { id_adoptante: idAdoptante },
            orderBy: { fecha: 'desc' }
        });

        let ultimaAccion = null;

        if (ultimoMatch && ultimoDescarte) {
            ultimaAccion = ultimoMatch.fecha > ultimoDescarte.fecha 
                ? { type: 'match', data: ultimoMatch } 
                : { type: 'descarte', data: ultimoDescarte };
        } else if (ultimoMatch) {
            ultimaAccion = { type: 'match', data: ultimoMatch };
        } else if (ultimoDescarte) {
            ultimaAccion = { type: 'descarte', data: ultimoDescarte };
        }

        if (!ultimaAccion) {
            return { success: false, status: 404, message: 'No hay acciones para deshacer.' };
        }

        const idMascota = ultimaAccion.data.id_mascota;

        if (ultimaAccion.type === 'match') {
            await prisma.match.delete({ where: { id_match: ultimaAccion.data.id_match } });
        } else {
            await prisma.descarte.delete({ 
                where: { id_adoptante_id_mascota: { id_adoptante: idAdoptante, id_mascota: idMascota } } 
            });
        }

        const mascota = await prisma.mascota.findUnique({
            where: { id_mascota: idMascota },
            select: { id_mascota: true, nombre: true }
        });

        return { success: true, message: 'Acción deshecha correctamente.', data: mascota };

    } catch (err) {
        console.error('[recomendacion.service] deshacer:', err.message);
        throw err;
    }
};

module.exports = {
    obtenerRecomendaciones,
    registrarInteres,
    registrarDescarte,
    deshacerUltimaAccion
};
