const prisma = require('../config/prisma');

const getTags = async (estado) => {
    const where = {};
    if (estado) {
        where.estado = estado;
    }
    return prisma.tag.findMany({ where });
};

const createTag = async (data, userId, ip) => {
    // Validar nombre único (case-insensitive)
    const exists = await prisma.tag.findFirst({
        where: { nombre_tag: { equals: data.nombre_tag, mode: 'insensitive' } }
    });

    if (exists) {
        return { success: false, status: 409, message: 'Nombre de tag ya existe' };
    }

    return prisma.$transaction(async (tx) => {
        const tag = await tx.tag.create({
            data: {
                nombre_tag: data.nombre_tag,
                categoria: data.categoria || 'General',
                peso_matching: data.peso_matching,
                es_filtro_absoluto: data.es_filtro_absoluto || false,
                estado: 'activo'
            }
        });

        await tx.logAuditoria.create({
            data: {
                id_autor: userId,
                accion: 'CREATE_TAG',
                entidad_afectada: 'tag',
                id_registro_afectado: tag.id_tag,
                valor_nuevo: JSON.stringify(tag),
                ip: ip
            }
        });

        return { success: true, data: tag };
    });
};

const updateTag = async (id, data, userId, ip) => {
    return prisma.$transaction(async (tx) => {
        const current = await tx.tag.findUnique({ where: { id_tag: id } });

        if (!current) {
            return { success: false, status: 404, message: 'Tag no encontrado' };
        }

        // Evitar duplicados (case-insensitive, excluyendo el mismo id)
        if (data.nombre_tag) {
            const exists = await tx.tag.findFirst({
                where: {
                    nombre_tag: { equals: data.nombre_tag, mode: 'insensitive' },
                    NOT: { id_tag: id }
                }
            });

            if (exists) {
                return { success: false, status: 409, message: 'Nombre duplicado' };
            }
        }

        const updateData = {};
        if (data.nombre_tag != null) updateData.nombre_tag = data.nombre_tag;
        if (data.categoria != null) updateData.categoria = data.categoria;
        if (data.peso_matching != null) updateData.peso_matching = data.peso_matching;
        if (data.estado != null) updateData.estado = data.estado;
        if (data.es_filtro_absoluto != null) updateData.es_filtro_absoluto = data.es_filtro_absoluto;

        const updated = await tx.tag.update({
            where: { id_tag: id },
            data: updateData
        });

        // Recalcular embeddings (simulado async)
        if (data.peso_matching != null && Number(data.peso_matching) !== Number(current.peso_matching)) {
            console.log('Recalcular embeddings...');
        }

        await tx.logAuditoria.create({
            data: {
                id_autor: userId,
                accion: 'UPDATE_TAG',
                entidad_afectada: 'tag',
                id_registro_afectado: id,
                valor_anterior: JSON.stringify(current),
                valor_nuevo: JSON.stringify(updated),
                ip: ip
            }
        });

        return { success: true, data: updated };
    });
};

const deleteTag = async (id, userId, ip) => {
    return prisma.$transaction(async (tx) => {
        const tag = await tx.tag.findUnique({ where: { id_tag: id } });

        if (!tag) {
            return { success: false, status: 404, message: 'Tag no encontrado' };
        }

        // Ejemplo de obligatorio
        if (tag.nombre_tag.toLowerCase().includes('tipo')) {
            return { success: false, status: 400, message: 'Tag obligatorio no eliminable' };
        }

        await tx.tag.update({
            where: { id_tag: id },
            data: { estado: 'inactivo' }
        });

        await tx.logAuditoria.create({
            data: {
                id_autor: userId,
                accion: 'DELETE_TAG',
                entidad_afectada: 'tag',
                id_registro_afectado: id,
                valor_anterior: JSON.stringify(tag),
                ip: ip
            }
        });

        return { success: true };
    });
};

const addOpciones = async (id, opciones, userId, ip) => {
    if (!Array.isArray(opciones) || opciones.length === 0) {
        return { success: false, status: 400, message: 'Debes enviar al menos una opción.' };
    }

    return prisma.$transaction(async (tx) => {
        for (const op of opciones) {
            await tx.opcionTag.create({
                data: {
                    id_tag: id,
                    valor: op
                }
            });
        }

        await tx.logAuditoria.create({
            data: {
                id_autor: userId,
                accion: 'ADD_OPCIONES_TAG',
                entidad_afectada: 'tag',
                id_registro_afectado: id,
                valor_nuevo: JSON.stringify(opciones),
                ip: ip
            }
        });

        return { success: true };
    });
};

module.exports = {
    getTags,
    createTag,
    updateTag,
    deleteTag,
    addOpciones
};
