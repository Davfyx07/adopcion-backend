const prisma = require('../config/prisma');

// ──────────────────────────────────────────────
// HU-AD-01: Registrar Adopción Completada
//
// Lógica transaccional que garantiza atomicidad:
//   1. Validar que el albergue sea dueño de la mascota
//   2. Validar que existe un match pendiente entre mascota y adoptante
//   3. Insertar registro en tabla adopcion
//   4. Actualizar estado de mascota a 'adoptado'
//   5. Buscar todos los matches pendientes de la mascota
//   6. Cancelar matches pendientes (estado = 'cancelado')
//   7. Enviar notificación al adoptante seleccionado
//   8. Enviar notificaciones a adoptantes no seleccionados
//   9. Registrar acción en log_auditoria
//  10. Retornar adopción creada
//
// NOTA DE INMUTABILIDAD:
//   Los registros de adopcion son inmutables por diseño.
//   A nivel de BD se recomienda un trigger BEFORE UPDATE que
//   lance una excepción. A nivel de servicio no se expone
//   ninguna función de actualización.
// ──────────────────────────────────────────────

const registrarAdopcion = async ({
    idAlbergue,
    idMascota,
    idAdoptante,
    observaciones,
    fecha_match,
    fecha_contacto,
    clientIp,
}) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // ── 1. Validar que el albergue sea dueño de la mascota ──
            const mascota = await tx.mascota.findUnique({
                where: { id_mascota: idMascota },
                include: {
                    albergue: {
                        select: { id_usuario: true, nombre_albergue: true },
                    },
                },
            });

            if (!mascota) {
                return { success: false, status: 404, message: 'Mascota no encontrada.' };
            }

            if (mascota.id_albergue !== idAlbergue) {
                return {
                    success: false,
                    status: 403,
                    message: 'No tienes permiso para registrar una adopción de esta mascota.',
                };
            }

            if (mascota.estado_adopcion === 'adoptado') {
                return { success: false, status: 400, message: 'Esta mascota ya fue adoptada.' };
            }

            // ── 2. Validar que existe un match pendiente ──
            const matchConfirmado = await tx.match.findFirst({
                where: {
                    id_mascota: idMascota,
                    id_adoptante: idAdoptante,
                    estado: 'pendiente',
                },
            });

            if (!matchConfirmado) {
                return {
                    success: false,
                    status: 400,
                    message: 'No existe un match pendiente entre la mascota y el adoptante seleccionado.',
                };
            }

            // ── 3. Insertar registro en tabla adopcion ──
            const adopcion = await tx.adopcion.create({
                data: {
                    id_mascota: idMascota,
                    id_adoptante: idAdoptante,
                    fecha: new Date(),
                    estado: 'en_proceso',
                    observaciones: observaciones || null,
                    fecha_match: fecha_match ? new Date(fecha_match) : (matchConfirmado.fecha || null),
                    fecha_contacto: fecha_contacto ? new Date(fecha_contacto) : null,
                    porcentaje_compatibilidad: matchConfirmado.puntaje || null,
                },
            });

            // ── 4. Actualizar estado de mascota a 'adoptado' ──
            await tx.mascota.update({
                where: { id_mascota: idMascota },
                data: {
                    estado_adopcion: 'adoptado',
                    updated_at: new Date(),
                },
            });

            // ── 5. Buscar todos los matches pendientes de la mascota ──
            const matchesPendientes = await tx.match.findMany({
                where: {
                    id_mascota: idMascota,
                    estado: 'pendiente',
                },
                select: { id_match: true, id_adoptante: true },
            });

            // ── 6. Cancelar matches pendientes ──
            if (matchesPendientes.length > 0) {
                await tx.match.updateMany({
                    where: {
                        id_mascota: idMascota,
                        estado: 'pendiente',
                    },
                    data: { estado: 'cancelado' },
                });
            }

            // ── 7. Notificar al adoptante seleccionado ──
            await tx.notificacion.create({
                data: {
                    id_usuario: idAdoptante,
                    tipo_notificacion: 'adopcion_confirmada',
                    mensaje: `¡Felicitaciones! Has sido seleccionado para adoptar a ${mascota.nombre}. El albergue ${mascota.albergue.nombre_albergue} se pondrá en contacto contigo.`,
                    recurso_tipo: 'adopcion',
                    recurso_id: adopcion.id_adopcion,
                },
            });

            // ── 8. Notificar a adoptantes no seleccionados ──
            const adoptantesNoSeleccionados = matchesPendientes.filter(
                (m) => m.id_adoptante !== idAdoptante
            );

            for (const match of adoptantesNoSeleccionados) {
                await tx.notificacion.create({
                    data: {
                        id_usuario: match.id_adoptante,
                        tipo_notificacion: 'mascota_adoptada',
                        mensaje: `La mascota ${mascota.nombre} ya encontró un hogar. ¡Gracias por tu interés!`,
                        recurso_tipo: 'mascota',
                        recurso_id: idMascota,
                    },
                });
            }

            // ── 9. Registrar en log_auditoria ──
            await tx.logAuditoria.create({
                data: {
                    id_autor: idAlbergue,
                    accion: 'REGISTRO_ADOPCION',
                    entidad_afectada: 'Adopcion',
                    id_registro_afectado: adopcion.id_adopcion,
                    valor_nuevo: JSON.stringify({
                        id_adopcion: adopcion.id_adopcion,
                        id_mascota: idMascota,
                        id_adoptante: idAdoptante,
                        estado_mascota_anterior: mascota.estado_adopcion,
                        matches_cancelados: matchesPendientes.length,
                        notificaciones_enviadas: adoptantesNoSeleccionados.length + 1,
                    }),
                    ip: clientIp,
                },
            });

            // ── 10. Retornar adopción creada ──
            return {
                success: true,
                data: {
                    id_adopcion: adopcion.id_adopcion,
                    id_mascota: adopcion.id_mascota,
                    id_adoptante: adopcion.id_adoptante,
                    fecha: adopcion.fecha,
                    estado: adopcion.estado,
                    observaciones: adopcion.observaciones,
                    fecha_match: adopcion.fecha_match,
                    fecha_contacto: adopcion.fecha_contacto,
                    porcentaje_compatibilidad: adopcion.porcentaje_compatibilidad,
                    matches_cancelados: matchesPendientes.length,
                },
            };
        });
    } catch (error) {
        console.error('[adopcionService] Error en registrarAdopcion:', error);
        throw error;
    }
};

// ──────────────────────────────────────────────
// Obtener adopciones de un albergue con filtros y paginación
// ──────────────────────────────────────────────
const getAdopcionesAlbergue = async (idAlbergue, filters) => {
    try {
        const { fecha_desde, fecha_hasta, estado, busqueda, page = 1, limit = 20 } = filters;
        const skip = (page - 1) * limit;

        const whereClause = {
            mascota: { id_albergue: idAlbergue }
        };

        if (fecha_desde || fecha_hasta) {
            whereClause.fecha = {};
            if (fecha_desde) whereClause.fecha.gte = new Date(fecha_desde);
            if (fecha_hasta) whereClause.fecha.lte = new Date(fecha_hasta);
        }

        if (estado) {
            whereClause.estado = estado;
        }

        if (busqueda) {
            whereClause.OR = [
                { mascota: { nombre: { contains: busqueda, mode: 'insensitive' } } },
                { adoptante: { nombre_completo: { contains: busqueda, mode: 'insensitive' } } }
            ];
        }

        const [total, adopciones] = await Promise.all([
            prisma.adopcion.count({ where: whereClause }),
            prisma.adopcion.findMany({
                where: whereClause,
                skip: Number(skip),
                take: Number(limit),
                orderBy: { fecha: 'desc' },
                include: {
                    mascota: { select: { nombre: true } },
                    adoptante: { select: { nombre_completo: true } }
                }
            })
        ]);

        const formattedAdopciones = adopciones.map(a => ({
            id_adopcion: a.id_adopcion,
            nombre_mascota: a.mascota?.nombre,
            nombre_adoptante: a.adoptante?.nombre_completo,
            fecha_adopcion: a.fecha,
            estado: a.estado,
            porcentaje_compatibilidad: a.porcentaje_compatibilidad
        }));

        return {
            success: true,
            data: formattedAdopciones,
            meta: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / limit)
            }
        };
    } catch (error) {
        console.error('[adopcionService] Error en getAdopcionesAlbergue:', error);
        throw error;
    }
};

// ──────────────────────────────────────────────
// Obtener detalle completo de una adopción
// ──────────────────────────────────────────────
const getAdopcionDetail = async (idAlbergue, idAdopcion) => {
    try {
        const adopcion = await prisma.adopcion.findUnique({
            where: { id_adopcion: idAdopcion },
            include: {
                mascota: true,
                adoptante: {
                    include: {
                        usuario: { select: { correo: true } }
                    }
                }
            }
        });

        if (!adopcion) {
            return { success: false, status: 404, message: 'Adopción no encontrada.' };
        }

        if (adopcion.mascota.id_albergue !== idAlbergue) {
            return { success: false, status: 403, message: 'No tienes permiso para ver esta adopción.' };
        }

        return { success: true, data: adopcion };
    } catch (error) {
        console.error('[adopcionService] Error en getAdopcionDetail:', error);
        throw error;
    }
};

// ──────────────────────────────────────────────
// Exportar adopciones
// ──────────────────────────────────────────────
const exportarAdopcionesAlbergue = async (idAlbergue, filters) => {
    try {
        const { fecha_desde, fecha_hasta, estado, busqueda, format = 'csv' } = filters;

        const whereClause = {
            mascota: { id_albergue: idAlbergue }
        };

        if (fecha_desde || fecha_hasta) {
            whereClause.fecha = {};
            if (fecha_desde) whereClause.fecha.gte = new Date(fecha_desde);
            if (fecha_hasta) whereClause.fecha.lte = new Date(fecha_hasta);
        }

        if (estado) {
            whereClause.estado = estado;
        }

        if (busqueda) {
            whereClause.OR = [
                { mascota: { nombre: { contains: busqueda, mode: 'insensitive' } } },
                { adoptante: { nombre_completo: { contains: busqueda, mode: 'insensitive' } } }
            ];
        }

        const adopciones = await prisma.adopcion.findMany({
            where: whereClause,
            take: 10000,
            orderBy: { fecha: 'desc' },
            include: {
                mascota: { select: { nombre: true } },
                adoptante: {
                    select: {
                        nombre_completo: true,
                        usuario: { select: { correo: true } }
                    }
                }
            }
        });

        const dataToExport = adopciones.map(a => ({
            Fecha: a.fecha ? a.fecha.toISOString().split('T')[0] : '',
            Mascota: a.mascota?.nombre || '',
            Adoptante: a.adoptante?.nombre_completo || '',
            Email: a.adoptante?.usuario?.correo || '',
            Porcentaje: a.porcentaje_compatibilidad ? Number(a.porcentaje_compatibilidad).toString() : '',
            Estado: a.estado || '',
            Observaciones: a.observaciones || ''
        }));

        if (format === 'excel') {
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Adopciones');
            
            sheet.columns = [
                { header: 'Fecha', key: 'Fecha', width: 15 },
                { header: 'Mascota', key: 'Mascota', width: 25 },
                { header: 'Adoptante', key: 'Adoptante', width: 30 },
                { header: 'Email', key: 'Email', width: 35 },
                { header: 'Porcentaje', key: 'Porcentaje', width: 15 },
                { header: 'Estado', key: 'Estado', width: 15 },
                { header: 'Observaciones', key: 'Observaciones', width: 40 }
            ];
            
            dataToExport.forEach(row => sheet.addRow(row));
            
            const buffer = await workbook.xlsx.writeBuffer();
            return { success: true, format: 'excel', buffer };
        } else {
            const { Parser } = require('json2csv');
            const fields = ['Fecha', 'Mascota', 'Adoptante', 'Email', 'Porcentaje', 'Estado', 'Observaciones'];
            const json2csvParser = new Parser({ fields });
            const csv = json2csvParser.parse(dataToExport);
            return { success: true, format: 'csv', data: csv };
        }
    } catch (error) {
        console.error('[adopcionService] Error en exportarAdopcionesAlbergue:', error);
        throw error;
    }
};

module.exports = { registrarAdopcion, getAdopcionesAlbergue, getAdopcionDetail, exportarAdopcionesAlbergue };
