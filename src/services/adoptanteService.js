const prisma = require('../config/prisma');
const { uploadImage, validateBase64Image, deleteImage } = require('./storageService');
const { validarTagsObligatorios } = require('./etiquetaService');
const { calcularEmbedding } = require('./embeddingService');

/**
 * HU-US-01: Crea el perfil de un adoptante de forma atómica.
 * 
 * Adaptado al esquema real de BD:
 *   - Tabla: Adoptante (PK compartida con Usuario via id_usuario)
 *   - Columnas: nombre_completo, foto_perfil, whatsapp_adoptante, ciudad
 *   - Tags: adoptanteTag (id_usuario, id_opcion) → referencia opcionTag
 */
const crearPerfilAdoptante = async ({ idUsuario, nombre_completo, whatsapp, ciudad, tagIds, fotoBase64, ip }) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // 1. Verificar rol adoptante y estado
            const user = await tx.usuario.findUnique({
                where: { id_usuario: idUsuario },
                include: { rol: true }
            });

            if (!user) {
                return { success: false, status: 404, message: 'Usuario no encontrado.' };
            }

            if (user.rol.nombre_rol.toLowerCase() !== 'adoptante') {
                return {
                    success: false,
                    status: 403,
                    message: 'Solo los usuarios con rol adoptante pueden crear un perfil de adoptante.',
                };
            }

            if (user.estado_cuenta !== 'perfil_incompleto') {
                return { success: false, status: 409, message: 'Tu perfil ya fue completado anteriormente.' };
            }

            // 2. Verificar que no tenga perfil creado (doble check)
            const perfilExistente = await tx.adoptante.findUnique({
                where: { id_usuario: idUsuario }
            });

            if (perfilExistente) {
                return { success: false, status: 409, message: 'Ya tienes un perfil de adoptante creado.' };
            }

            // 3. Validar tags obligatorios (al menos 1 opción por cada Tag con es_filtro_absoluto)
            if (tagIds && tagIds.length > 0) {
                // validarTagsObligatorios usa prisma global, pero es solo lectura
                const validacion = await validarTagsObligatorios(tagIds);
                if (!validacion.valid) {
                    return {
                        success: false,
                        status: 400,
                        message: 'Debes seleccionar al menos una opción de cada categoría obligatoria.',
                        data: { tags_faltantes: validacion.tagsFaltantes },
                    };
                }

                // 4. Validar que los IDs de opciones existen en opcionTag
                const count = await tx.opcionTag.count({
                    where: { id_opcion: { in: tagIds } }
                });
                if (count !== tagIds.length) {
                    return { success: false, status: 400, message: 'Una o más opciones seleccionadas no existen.' };
                }
            }

            // 5. Validar y subir foto si se proporciona
            let fotoUrl = null;
            if (fotoBase64) {
                const validacionFoto = validateBase64Image(fotoBase64);
                if (!validacionFoto.valid) {
                    return { success: false, status: 400, message: validacionFoto.message };
                }
                fotoUrl = await uploadImage(fotoBase64, 'adopcion/adoptantes');
            }

            // 6. Calcular embedding
            const embedding = tagIds && tagIds.length > 0 ? await calcularEmbedding(tagIds) : [];

            // 7. Crear registro en tabla Adoptante (PK compartida con Usuario)
            await tx.adoptante.create({
                data: {
                    id_usuario: idUsuario,
                    nombre_completo: nombre_completo.trim(),
                    foto_perfil: fotoUrl,
                    whatsapp_adoptante: whatsapp.trim(),
                    ciudad: ciudad.trim(),
                    embedding: embedding.length > 0 ? JSON.stringify(embedding) : null,
                }
            });

            // 8. Guardar tags en adoptanteTag
            if (tagIds && tagIds.length > 0) {
                await tx.adoptanteTag.createMany({
                    data: tagIds.map(id_opcion => ({
                        id_usuario: idUsuario,
                        id_opcion,
                    })),
                });
            }

            // 9. Actualizar estado_cuenta a 'activo'
            await tx.usuario.update({
                where: { id_usuario: idUsuario },
                data: { estado_cuenta: 'activo' },
            });

            // 10. Log de auditoría
            await tx.logAuditoria.create({
                data: {
                    id_autor: idUsuario,
                    accion: 'CREACION_PERFIL_ADOPTANTE',
                    entidad_afectada: 'Adoptante',
                    id_registro_afectado: idUsuario,
                    ip: ip,
                }
            });

            return {
                success: true,
                data: {
                    id_usuario: idUsuario,
                    nombre_completo: nombre_completo.trim(),
                    whatsapp: whatsapp.trim(),
                    ciudad: ciudad.trim(),
                    foto_url: fotoUrl,
                    tags: tagIds || [],
                    estado_cuenta: 'activo',
                },
            };
        });
    } catch (err) {
        console.error('[adoptante.service] crearPerfil:', err.message);
        throw err;
    }
};

/**
 * HU-US-02: Obtiene el perfil de un adoptante incluyendo sus etiquetas.
 */
const obtenerPerfilAdoptante = async (idUsuario) => {
    try {
        const perfil = await prisma.adoptante.findUnique({
            where: { id_usuario: idUsuario },
            include: {
                usuario: {
                    select: { correo: true }
                },
                adoptanteTag: {
                    include: {
                        opcionTag: {
                            include: {
                                tag: true
                            }
                        }
                    }
                }
            }
        });

        if (!perfil) {
            return { success: false, status: 404, message: 'Perfil no encontrado.' };
        }

        return {
            success: true,
            data: {
                id_usuario: perfil.id_usuario,
                nombre_completo: perfil.nombre_completo,
                whatsapp: perfil.whatsapp_adoptante,
                ciudad: perfil.ciudad,
                foto_url: perfil.foto_perfil,
                etiquetas: perfil.adoptanteTag.map(at => ({
                    id_opcion: at.id_opcion,
                    valor: at.opcionTag.valor,
                    categoria: at.opcionTag.tag.nombre_tag,
                })),
            }
        };
    } catch (err) {
        console.error('[adoptante.service] obtenerPerfil:', err.message);
        throw err;
    }
};

/**
 * HU-US-02: Actualiza los datos básicos del perfil (nombre, whatsapp, ciudad, foto).
 * Usa $queryRaw para SELECT ... FOR UPDATE dentro de la transacción.
 */
const actualizarPerfilAdoptante = async ({ idUsuario, nombre_completo, whatsapp, ciudad, fotoBase64, ip }) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // FOR UPDATE: bloquear fila para evitar condiciones de carrera
            const rows = await tx.$queryRaw`
                SELECT * FROM adoptante WHERE id_usuario = ${idUsuario} FOR UPDATE
            `;

            if (!rows || rows.length === 0) {
                return { success: false, status: 404, message: 'Perfil no encontrado.' };
            }

            const perfilAnterior = rows[0];
            let nuevaFotoUrl = perfilAnterior.foto_perfil;
            let fotoViejaParaBorrar = null;

            if (fotoBase64) {
                const validacion = validateBase64Image(fotoBase64);
                if (!validacion.valid) {
                    return { success: false, status: 400, message: validacion.message };
                }
                nuevaFotoUrl = await uploadImage(fotoBase64, 'adopcion/adoptantes');
                fotoViejaParaBorrar = perfilAnterior.foto_perfil;
            }

            // COALESCE-like: solo actualizar campos no-null
            const updateData = {};
            if (nombre_completo !== undefined && nombre_completo !== null) {
                updateData.nombre_completo = nombre_completo.trim();
            }
            if (whatsapp !== undefined && whatsapp !== null) {
                updateData.whatsapp_adoptante = whatsapp.trim();
            }
            if (ciudad !== undefined && ciudad !== null) {
                updateData.ciudad = ciudad.trim();
            }
            updateData.foto_perfil = nuevaFotoUrl;
            updateData.updated_at = new Date();

            const perfilActualizado = await tx.adoptante.update({
                where: { id_usuario: idUsuario },
                data: updateData,
            });

            // Auditoría con valor anterior y nuevo
            await tx.logAuditoria.create({
                data: {
                    id_autor: idUsuario,
                    accion: 'ACTUALIZACION_PERFIL_ADOPTANTE',
                    entidad_afectada: 'Adoptante',
                    id_registro_afectado: idUsuario,
                    valor_anterior: JSON.stringify({
                        nombre_completo: perfilAnterior.nombre_completo,
                        whatsapp_adoptante: perfilAnterior.whatsapp_adoptante,
                        ciudad: perfilAnterior.ciudad,
                        foto_perfil: perfilAnterior.foto_perfil,
                    }),
                    valor_nuevo: JSON.stringify({
                        nombre_completo: perfilActualizado.nombre_completo,
                        whatsapp_adoptante: perfilActualizado.whatsapp_adoptante,
                        ciudad: perfilActualizado.ciudad,
                        foto_perfil: perfilActualizado.foto_perfil,
                    }),
                    ip: ip,
                }
            });

            // Borrar imagen vieja asincrónamente si se cambió
            if (fotoViejaParaBorrar && fotoViejaParaBorrar !== nuevaFotoUrl) {
                deleteImage(fotoViejaParaBorrar, 'adopcion/adoptantes').catch(e =>
                    console.error('[adoptante] Error deleting old image', e)
                );
            }

            return {
                success: true,
                data: {
                    id_usuario: perfilActualizado.id_usuario,
                    nombre_completo: perfilActualizado.nombre_completo,
                    whatsapp: perfilActualizado.whatsapp_adoptante,
                    ciudad: perfilActualizado.ciudad,
                    foto_url: perfilActualizado.foto_perfil,
                }
            };
        });
    } catch (err) {
        console.error('[adoptante.service] actualizarPerfil:', err.message);
        throw err;
    }
};

/**
 * HU-US-02: Actualiza únicamente las etiquetas (opciones de tags).
 * Usa $queryRaw para SELECT ... FOR UPDATE dentro de la transacción.
 */
const actualizarEtiquetasAdoptante = async ({ idUsuario, tagIds, ip }) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // FOR UPDATE: bloquear fila del adoptante
            const rows = await tx.$queryRaw`
                SELECT id_usuario FROM adoptante WHERE id_usuario = ${idUsuario} FOR UPDATE
            `;

            if (!rows || rows.length === 0) {
                return { success: false, status: 404, message: 'Perfil no encontrado.' };
            }

            // Validar tags obligatorios
            const validacion = await validarTagsObligatorios(tagIds);
            if (!validacion.valid) {
                return {
                    success: false,
                    status: 400,
                    message: 'Debes seleccionar al menos una opción de cada categoría obligatoria.',
                    data: { tags_faltantes: validacion.tagsFaltantes },
                };
            }

            // Validar que existen en el catálogo
            if (tagIds && tagIds.length > 0) {
                const count = await tx.opcionTag.count({
                    where: { id_opcion: { in: tagIds } }
                });
                if (count !== tagIds.length) {
                    return { success: false, status: 400, message: 'Una o más opciones seleccionadas no existen.' };
                }
            }

            // Guardar tags anteriores para auditoría
            const tagsViejos = await tx.adoptanteTag.findMany({
                where: { id_usuario: idUsuario },
                select: { id_opcion: true }
            });
            const viejosIds = tagsViejos.map(r => r.id_opcion);

            // Borrar tags existentes y re-insertar
            await tx.adoptanteTag.deleteMany({
                where: { id_usuario: idUsuario }
            });

            if (tagIds && tagIds.length > 0) {
                await tx.adoptanteTag.createMany({
                    data: tagIds.map(id_opcion => ({
                        id_usuario: idUsuario,
                        id_opcion,
                    })),
                });
            }

            // Recalcular embedding si cambiaron los tags
            const nuevosTags = tagIds || [];
            if (!arraysEqual([...viejosIds].sort(), [...nuevosTags].sort())) {
                await calcularEmbedding(nuevosTags);
            }

            // Auditoría
            await tx.logAuditoria.create({
                data: {
                    id_autor: idUsuario,
                    accion: 'ACTUALIZACION_ETIQUETAS_ADOPTANTE',
                    entidad_afectada: 'adoptanteTag',
                    id_registro_afectado: idUsuario,
                    valor_anterior: JSON.stringify({ tags: viejosIds }),
                    valor_nuevo: JSON.stringify({ tags: nuevosTags }),
                    ip: ip,
                }
            });

            return { success: true, data: { tags: nuevosTags } };
        });
    } catch (err) {
        console.error('[adoptante.service] actualizarEtiquetas:', err.message);
        throw err;
    }
};

/**
 * Soft delete del perfil de adoptante.
 * El middleware de Prisma filtra automáticamente deleted_at IS NULL.
 */
const eliminarPerfil = async (idUsuario) => {
    try {
        return await prisma.$transaction(async (tx) => {
            const perfil = await tx.adoptante.findUnique({
                where: { id_usuario: idUsuario }
            });

            if (!perfil) {
                return { success: false, status: 404, message: 'Perfil no encontrado.' };
            }

            await tx.adoptante.update({
                where: { id_usuario: idUsuario },
                data: { deleted_at: new Date() }
            });

            await tx.logAuditoria.create({
                data: {
                    id_autor: idUsuario,
                    accion: 'ELIMINACION_PERFIL_ADOPTANTE',
                    entidad_afectada: 'Adoptante',
                    id_registro_afectado: idUsuario,
                }
            });

            return { success: true, message: 'Perfil eliminado exitosamente.' };
        });
    } catch (err) {
        console.error('[adoptante.service] eliminarPerfil:', err.message);
        throw err;
    }
};

/**
 * Helper para comparar arrays.
 */
const arraysEqual = (a = [], b = []) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

module.exports = {
    crearPerfilAdoptante,
    obtenerPerfilAdoptante,
    actualizarPerfilAdoptante,
    actualizarEtiquetasAdoptante,
    eliminarPerfil,
};
