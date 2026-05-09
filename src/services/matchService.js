const prisma = require('../config/prisma');

const calcularCompatibilidad = async (idAdoptante) => {
    const adoptante_tags = await prisma.adoptanteTag.findMany({
        where: { id_usuario: idAdoptante },
        select: { id_opcion: true }
    });

    if (adoptante_tags.length === 0) {
        return [];
    }

    const adoptante_opcion_ids = adoptante_tags.map(r => r.id_opcion);

    const tagsDetalleAdoptanteRaw = await prisma.$queryRaw`
        SELECT ot.id_opcion, ot.id_tag, t.peso_matching, t.es_filtro_absoluto
        FROM adoptante_tag at
        JOIN opcion_tag ot ON at.id_opcion = ot.id_opcion
        JOIN tag t ON ot.id_tag = t.id_tag
        WHERE at.id_usuario = ${idAdoptante}
    `;

    const tagsAdoptanteMap = new Map();
    let sumaTotalPesos = 0;
    for (const row of tagsDetalleAdoptanteRaw) {
        const peso = Number(row.peso_matching) || 0;
        tagsAdoptanteMap.set(row.id_opcion, {
            id_tag: row.id_tag,
            peso_matching: peso,
            es_filtro_absoluto: row.es_filtro_absoluto,
        });
        sumaTotalPesos += peso;
    }

    const idsDescartadosRaw = await prisma.descarte.findMany({
        where: { id_adoptante: idAdoptante },
        select: { id_mascota: true }
    });
    const idsDescartados = new Set(idsDescartadosRaw.map(r => r.id_mascota));

    const mascotas = await prisma.mascota.findMany({
        where: {
            estado_adopcion: 'disponible',
            id_mascota: { notIn: Array.from(idsDescartados) },
        },
        select: { id_mascota: true, nombre: true, descripcion: true }
    });

    if (mascotas.length === 0) {
        await limpiarMatchesPendientes(idAdoptante);
        return [];
    }

    const mascotaIds = mascotas.map(m => m.id_mascota);

    const mascotaTagsRaw = await prisma.$queryRaw`
        SELECT mt.id_mascota, mt.id_opcion, ot.id_tag
        FROM mascota_tag mt
        JOIN opcion_tag ot ON mt.id_opcion = ot.id_opcion
        WHERE mt.id_mascota = ANY(${mascotaIds})
    `;

    const tagsPorMascota = new Map();
    for (const row of mascotaTagsRaw) {
        if (!tagsPorMascota.has(row.id_mascota)) {
            tagsPorMascota.set(row.id_mascota, []);
        }
        tagsPorMascota.get(row.id_mascota).push({
            id_opcion: row.id_opcion,
            id_tag: row.id_tag,
        });
    }

    const fotosMap = new Map();
    if (mascotaIds.length > 0) {
        const fotos = await prisma.$queryRaw`
            SELECT DISTINCT ON (id_mascota) id_mascota, url_foto
            FROM mascota_foto
            WHERE id_mascota = ANY(${mascotaIds})
            ORDER BY id_mascota, orden ASC
        `;
        for (const f of fotos) {
            fotosMap.set(f.id_mascota, f.url_foto);
        }
    }

    const tagsDetalleMascotaRaw = await prisma.$queryRaw`
        SELECT mt.id_mascota, o.valor, t.nombre_tag, t.categoria
        FROM mascota_tag mt
        JOIN opcion_tag o ON mt.id_opcion = o.id_opcion
        JOIN tag t ON o.id_tag = t.id_tag
        WHERE mt.id_mascota = ANY(${mascotaIds})
    `;
    const tagsDetallePorMascota = new Map();
    for (const t of tagsDetalleMascotaRaw) {
        if (!tagsDetallePorMascota.has(t.id_mascota)) {
            tagsDetallePorMascota.set(t.id_mascota, []);
        }
        tagsDetallePorMascota.get(t.id_mascota).push({
            valor: t.valor,
            nombre_tag: t.nombre_tag,
            categoria: t.categoria,
        });
    }

    const resultados = [];
    for (const mascota of mascotas) {
        const mascota_tags = tagsPorMascota.get(mascota.id_mascota) || [];
        const mascota_opcion_ids = new Set(mascota_tags.map(t => t.id_opcion));
        const mascota_tag_ids = new Set(mascota_tags.map(t => t.id_tag));

        let pasaFiltrosAbsolutos = true;
        for (const [id_opcion, info] of tagsAdoptanteMap) {
            if (info.es_filtro_absoluto) {
                if (!mascota_tag_ids.has(info.id_tag)) {
                    pasaFiltrosAbsolutos = false;
                    break;
                }
            }
        }

        if (!pasaFiltrosAbsolutos) continue;

        let sumaObtenida = 0;
        for (const [id_opcion, info] of tagsAdoptanteMap) {
            if (info.es_filtro_absoluto) continue;
            if (mascota_opcion_ids.has(id_opcion)) {
                sumaObtenida += info.peso_matching;
            }
        }

        const compatibilidad = sumaTotalPesos > 0
            ? Math.round((sumaObtenida / sumaTotalPesos) * 100)
            : 0;

        if (compatibilidad >= 30) {
            resultados.push({
                id_mascota: mascota.id_mascota,
                nombre: mascota.nombre,
                descripcion: mascota.descripcion,
                foto: fotosMap.get(mascota.id_mascota) || null,
                compatibilidad,
                tags: tagsDetallePorMascota.get(mascota.id_mascota) || [],
            });
        }
    }

    resultados.sort((a, b) => b.compatibilidad - a.compatibilidad);

    await prisma.$transaction(async (tx) => {
        await tx.match.deleteMany({
            where: {
                id_adoptante: idAdoptante,
                estado: 'pendiente',
            }
        });

        if (resultados.length > 0) {
            await tx.match.createMany({
                data: resultados.map(r => ({
                    id_adoptante: idAdoptante,
                    id_mascota: r.id_mascota,
                    puntaje: r.compatibilidad,
                    estado: 'pendiente',
                })),
            });
        }
    });

    return resultados;
};

const limpiarMatchesPendientes = async (idAdoptante) => {
    await prisma.match.deleteMany({
        where: {
            id_adoptante: idAdoptante,
            estado: 'pendiente',
        }
    });
};

const registrarMatch = async ({ idAdoptante, idMascota, puntaje }) => {
    try {
        return await prisma.$transaction(async (tx) => {
            const mascota = await tx.mascota.findUnique({
                where: { id_mascota: idMascota },
                select: {
                    id_mascota: true,
                    estado_adopcion: true,
                    id_albergue: true,
                    nombre: true,
                    albergue: { select: { nombre_albergue: true } }
                }
            });

            if (!mascota) {
                return { success: false, status: 404, message: 'Mascota no encontrada.' };
            }

            if (mascota.estado_adopcion !== 'disponible') {
                return { success: false, status: 400, message: 'La mascota no está disponible para adopción.' };
            }

            const adoptante = await tx.adoptante.findUnique({
                where: { id_usuario: idAdoptante }
            });

            if (!adoptante) {
                return { success: false, status: 404, message: 'Perfil de adoptante no encontrado.' };
            }

            const matchExistente = await tx.match.findFirst({
                where: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                }
            });

            if (matchExistente) {
                return {
                    success: false,
                    status: 409,
                    message: 'Ya existe un match con esta mascota.',
                    data: { id_match: matchExistente.id_match, estado: matchExistente.estado },
                };
            }

            const match = await tx.match.create({
                data: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                    puntaje: puntaje || null,
                    estado: 'pendiente',
                }
            });

            await tx.notificacion.create({
                data: {
                    id_usuario: mascota.id_albergue,
                    tipo_notificacion: 'nuevo_match',
                    mensaje: `Un adoptante está interesado en ${mascota.nombre}. Revisa los detalles del match.`,
                    recurso_tipo: 'match',
                    recurso_id: match.id_match,
                }
            });

            return {
                success: true,
                data: {
                    id_match: match.id_match,
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                    puntaje: match.puntaje,
                    estado: match.estado,
                    fecha: match.fecha,
                }
            };
        });
    } catch (err) {
        console.error('[matchService] registrarMatch:', err.message);
        throw err;
    }
};

const obtenerMatches = async (idAdoptante) => {
    try {
        const matches = await prisma.match.findMany({
            where: { id_adoptante: idAdoptante },
            orderBy: { fecha: 'desc' },
            include: {
                mascota: {
                    include: {
                        albergue: {
                            select: {
                                id_usuario: true,
                                nombre_albergue: true,
                                whatsapp_actual: true,
                            }
                        },
                        mascota_foto: {
                            orderBy: { orden: 'asc' },
                            take: 1,
                            select: { url_foto: true }
                        },
                        mascota_tag: {
                            include: {
                                opcion_tag: {
                                    include: {
                                        tag: {
                                            select: { nombre_tag: true, categoria: true }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        const data = matches.map(m => ({
            id_match: m.id_match,
            id_adoptante: m.id_adoptante,
            id_mascota: m.id_mascota,
            puntaje: m.puntaje,
            estado: m.estado,
            fecha: m.fecha,
            mascota: {
                id_mascota: m.mascota.id_mascota,
                nombre: m.mascota.nombre,
                descripcion: m.mascota.descripcion,
                estado_adopcion: m.mascota.estado_adopcion,
                foto: m.mascota.mascota_foto[0]?.url_foto || null,
                tags: m.mascota.mascota_tag.map(mt => ({
                    valor: mt.opcion_tag.valor,
                    nombre_tag: mt.opcion_tag.tag.nombre_tag,
                    categoria: mt.opcion_tag.tag.categoria,
                })),
                albergue: {
                    id_usuario: m.mascota.albergue.id_usuario,
                    nombre_albergue: m.mascota.albergue.nombre_albergue,
                    whatsapp: m.mascota.albergue.whatsapp_actual,
                },
            },
        }));

        return { success: true, data };
    } catch (err) {
        console.error('[matchService] obtenerMatches:', err.message);
        throw err;
    }
};

const descartarMascota = async (idAdoptante, idMascota) => {
    try {
        return await prisma.$transaction(async (tx) => {
            const mascota = await tx.mascota.findUnique({
                where: { id_mascota: idMascota },
                select: { id_mascota: true, nombre: true }
            });

            if (!mascota) {
                return { success: false, status: 404, message: 'Mascota no encontrada.' };
            }

            const existente = await tx.descarte.findUnique({
                where: {
                    id_adoptante_id_mascota: {
                        id_adoptante: idAdoptante,
                        id_mascota: idMascota,
                    }
                }
            });

            if (existente) {
                return { success: false, status: 409, message: 'Esta mascota ya fue descartada.' };
            }

            await tx.descarte.create({
                data: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                }
            });

            await tx.match.deleteMany({
                where: {
                    id_adoptante: idAdoptante,
                    id_mascota: idMascota,
                }
            });

            return { success: true, message: 'Mascota descartada exitosamente.' };
        });
    } catch (err) {
        console.error('[matchService] descartarMascota:', err.message);
        throw err;
    }
};

const contactarAdoptante = async (idAlbergue, idMatch) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // 1. Buscar match e incluir relaciones necesarias
            const match = await tx.match.findUnique({
                where: { id_match: idMatch },
                include: {
                    mascota: { select: { nombre: true, id_albergue: true } },
                    adoptante: { select: { nombre_completo: true, whatsapp_adoptante: true, id_usuario: true } },
                }
            });

            if (!match) {
                return { success: false, status: 404, message: 'Match no encontrado.' };
            }

            // 2. Validar que la mascota del match pertenezca al albergue autenticado
            if (match.mascota.id_albergue !== idAlbergue) {
                return { success: false, status: 403, message: 'No tienes permiso para contactar este match.' };
            }

            // 3. Obtener datos del albergue para el mensaje
            const albergue = await tx.albergue.findUnique({
                where: { id_usuario: idAlbergue },
                select: { nombre_albergue: true }
            });

            // 4. Validar que el adoptante tenga WhatsApp
            const numWhatsapp = match.adoptante.whatsapp_adoptante;
            if (!numWhatsapp) {
                return { success: false, status: 400, message: 'El adoptante no tiene un número de WhatsApp registrado.' };
            }

            // 5. Verificar si ya fue contactado (previene duplicidad de notificaciones)
            const yaContactado = match.estado === 'contactado';
            
            // Construir mensaje predefinido
            const nombreAdoptante = match.adoptante.nombre_completo || 'Adoptante';
            const mensaje = `!Hola ${nombreAdoptante}! Somos ${albergue.nombre_albergue} y vimos que hiciste match con ${match.mascota.nombre}. Nos gustaria conversar contigo sobre el proceso de adopcion.`;
            const mensajeCodificado = encodeURIComponent(mensaje);
            // Formatear el numero removiendo '+' y caracteres no numericos, WhatsApp API prefiere solo numeros
            const numeroFormateado = numWhatsapp.replace(/\D/g, '');
            const enlaceWhatsapp = `https://wa.me/${numeroFormateado}?text=${mensajeCodificado}`;

            if (!yaContactado) {
                // Actualizar estado del match
                await tx.match.update({
                    where: { id_match: idMatch },
                    data: { estado: 'contactado' }
                });

                // Crear notificacion para el adoptante
                await tx.notificacion.create({
                    data: {
                        id_usuario: match.adoptante.id_usuario,
                        tipo_notificacion: 'contacto_albergue',
                        mensaje: `El albergue ${albergue.nombre_albergue} ha iniciado el proceso de contacto para la adopcion de ${match.mascota.nombre}. !Revisa tu WhatsApp!`,
                        recurso_tipo: 'match',
                        recurso_id: idMatch,
                    }
                });
            }

            // Registrar el evento de contacto en la tabla de auditoría (siempre registra un nuevo enlace generado)
            await tx.contactoWhatsapp.create({
                data: {
                    id_match: idMatch,
                    id_albergue: idAlbergue
                }
            });

            return { 
                success: true, 
                data: { 
                    enlace_whatsapp: enlaceWhatsapp,
                    estado: yaContactado ? 'contactado' : 'contactado_actualizado'
                } 
            };
        });
    } catch (err) {
        console.error('[matchService] contactarAdoptante:', err.message);
        throw err;
    }
};

module.exports = {
    calcularCompatibilidad,
    limpiarMatchesPendientes,
    registrarMatch,
    obtenerMatches,
    descartarMascota,
    contactarAdoptante,
};
