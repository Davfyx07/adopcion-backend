const prisma = require('../config/prisma');

/**
 * Helper interno para calcular el puntaje de compatibilidad entre un adoptante y una mascota.
 */
const calcularPuntajeMatch = (adoptante, mascota, tagsConfig) => {
    let puntajeAcumulado = 0;
    let esValida = true;

    // Organizar tags del adoptante por categoría
    const adoptanteCategorias = {};
    adoptante.adoptante_tag.forEach(at => {
        const idTag = at.opcion_tag?.id_tag || at.id_tag; // Depende de cómo se incluya
        if (!adoptanteCategorias[idTag]) adoptanteCategorias[idTag] = [];
        adoptanteCategorias[idTag].push(at.id_opcion);
    });

    // Organizar tags de la mascota por categoría
    const mascotaCategorias = {};
    mascota.mascota_tag.forEach(mt => {
        const idTag = mt.opcion_tag?.id_tag || mt.id_tag;
        if (!mascotaCategorias[idTag]) mascotaCategorias[idTag] = [];
        mascotaCategorias[idTag].push(mt.id_opcion);
    });

    const sumaTotalPesos = tagsConfig.reduce((acc, tag) => acc + parseFloat(tag.peso_matching || 0), 0);

    for (const tag of tagsConfig) {
        const idTag = tag.id_tag;
        const peso = parseFloat(tag.peso_matching || 0);
        const adoptanteOpciones = adoptanteCategorias[idTag] || [];
        const mascotaOpciones = mascotaCategorias[idTag] || [];

        let matchEnCategoria = false;
        
        // Si el adoptante no tiene preferencias (o no seleccionó nada para este tag), 
        // cuenta como compatibilidad total (según RF-MT-01)
        if (adoptanteOpciones.length === 0) {
            matchEnCategoria = true;
        } else {
            matchEnCategoria = mascotaOpciones.some(id => adoptanteOpciones.includes(id));
        }

        // Filtro absoluto (ej: Tipo de animal)
        if (tag.es_filtro_absoluto && !matchEnCategoria) {
            esValida = false;
            break;
        }

        if (matchEnCategoria) {
            puntajeAcumulado += peso;
        }
    }

    const porcentaje = sumaTotalPesos > 0 
        ? Math.round((puntajeAcumulado / sumaTotalPesos) * 100) 
        : 0;

    return { esValida, porcentaje };
};

/**
 * Obtiene el feed de mascotas recomendadas para un adoptante.
 */
const obtenerRecomendaciones = async (idAdoptante, { limit = 20, offset = 0 } = {}) => {
    try {
        const adoptante = await prisma.adoptante.findUnique({
            where: { id_usuario: idAdoptante },
            include: { adoptante_tag: { include: { opcion_tag: true } } }
        });

        if (!adoptante) throw new Error('Adoptante no encontrado.');

        const matches = await prisma.match.findMany({
            where: { id_adoptante: idAdoptante },
            select: { id_mascota: true }
        });
        const descartes = await prisma.descarte.findMany({
            where: { id_adoptante: idAdoptante },
            select: { id_mascota: true }
        });

        const procesadasIds = [...matches.map(m => m.id_mascota), ...descartes.map(d => d.id_mascota)];

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

        const tagsConfig = await prisma.tag.findMany({ where: { estado: 'activo' } });

        const recomendaciones = mascotas.map(mascota => {
            const { esValida, porcentaje } = calcularPuntajeMatch(adoptante, mascota, tagsConfig);

            if (!esValida || porcentaje < 30) return null;

            return {
                id: mascota.id_mascota,
                id_mascota: mascota.id_mascota,
                nombre: mascota.nombre,
                descripcion: mascota.descripcion,
                foto: mascota.mascota_foto[0]?.url_foto ?? null,   // primera foto para el card
                fotos: mascota.mascota_foto.map(f => f.url_foto),  // todas las fotos
                fecha_publicacion: mascota.fecha_publicacion,
                albergue: {
                    id: mascota.albergue.id_usuario,
                    nombre: mascota.albergue.nombre_albergue,
                    logo: mascota.albergue.logo
                },
                compatibilidad: porcentaje
            };
        }).filter(r => r !== null);

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
        const mascota = await prisma.mascota.findUnique({
            where: { id_mascota: idMascota },
            include: { albergue: true, mascota_tag: { include: { opcion_tag: true } } }
        });
        if (!mascota || mascota.estado_adopcion !== 'disponible') {
            return { success: false, status: 404, message: 'Mascota no disponible.' };
        }

        const existeMatch = await prisma.match.findFirst({
            where: { id_adoptante: idAdoptante, id_mascota: idMascota }
        });
        if (existeMatch) return { success: false, status: 400, message: 'Ya existe un match con esta mascota.' };

        const adoptante = await prisma.adoptante.findUnique({
            where: { id_usuario: idAdoptante },
            include: { adoptante_tag: { include: { opcion_tag: true } } }
        });
        const tagsConfig = await prisma.tag.findMany({ where: { estado: 'activo' } });

        const { porcentaje } = calcularPuntajeMatch(adoptante, mascota, tagsConfig);

        return await prisma.$transaction(async (tx) => {
            const nuevoMatch = await tx.match.create({
                data: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                    estado: 'pendiente',
                    puntaje: porcentaje
                }
            });

            const notif = await tx.notificacion.create({
                data: {
                    id_usuario: mascota.id_albergue,
                    tipo_notificacion: 'match',
                    mensaje: `¡Nuevo interés! Alguien quiere adoptar a ${mascota.nombre}.`,
                    recurso_tipo: 'match',
                    recurso_id: nuevoMatch.id_match
                }
            });

            return { success: true, data: nuevoMatch, notif };
        }).then((result) => {
            // Emit outside transaction so socket fires after DB commit
            const { emitToUser } = require('../socket/socketManager');
            emitToUser(mascota.id_albergue, 'nueva_notificacion', {
                id_notificacion: result.notif.id,
                tipo: 'match',
                mensaje: `¡Nuevo interés! Alguien quiere adoptar a ${mascota.nombre}.`,
                leida: false,
                fecha_creacion: result.notif.fecha_creacion,
            });
            return { success: true, data: result.data };
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
 * Deshace la última acción
 */
const deshacerUltimaAccion = async (idAdoptante) => {
    try {
        const ultimoMatch = await prisma.match.findFirst({
            where: { id_adoptante: idAdoptante },
            orderBy: { fecha: 'desc' }
        });

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
