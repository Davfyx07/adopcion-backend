const prisma = require('../config/prisma');
const { uploadImage, deleteImage, validateBase64Image } = require('./storageService');

// =====================================================================
// HU-AL-01: Crear Perfil Institucional del Albergue
// =====================================================================
/**
 * Flujo atómico ($transaction):
 * 1. Verificar que el usuario sea albergue con perfil_incompleto
 * 2. Verificar que NO exista ya un perfil para ese usuario
 * 3. Verificar unicidad del NIT (409 si duplicado)
 * 4. Subir logo si se proporciona (base64 → Cloudinary)
 * 5. INSERT en tabla Albergue
 * 6. INSERT en historialWhatsappAlbergue (trazabilidad)
 * 7. UPDATE Usuario → estado_cuenta = 'activo'
 * 8. INSERT en logAuditoria
 */
const createAlbergueProfile = async ({ userId, data, ip }) => {
    try {
        // Subir logo fuera de la transacción (operación externa)
        let logoUrl = null;
        if (data.logo) {
            logoUrl = await uploadImage(data.logo, 'adopcion/logos');
        }

        return await prisma.$transaction(async (tx) => {
            // 1. Verificar rol y estado
            const user = await tx.usuario.findUnique({
                where: { id_usuario: userId },
                include: { rol: true }
            });

            if (!user) {
                return { success: false, status: 404, message: 'Usuario no encontrado.' };
            }

            if (user.rol.nombre_rol.toLowerCase() !== 'albergue') {
                return { success: false, status: 403, message: 'Solo los usuarios con rol albergue pueden crear un perfil institucional.' };
            }

            if (user.estado_cuenta !== 'perfil_incompleto') {
                return { success: false, status: 409, message: 'Tu perfil institucional ya fue completado anteriormente.' };
            }

            // 2. Verificar que no exista perfil
            const existingProfile = await tx.albergue.findUnique({
                where: { id_usuario: userId }
            });

            if (existingProfile) {
                return { success: false, status: 409, message: 'Ya existe un perfil de albergue asociado a tu cuenta.' };
            }

            // 3. Verificar unicidad del NIT
            const nitClean = data.nit.replace(/\./g, '').trim();
            const existingNit = await tx.albergue.findUnique({
                where: { nit: nitClean }
            });

            if (existingNit) {
                return { success: false, status: 409, message: 'El NIT ingresado ya está registrado por otro albergue.' };
            }

            // 4. Limpiar WhatsApp
            const whatsappClean = data.whatsapp.replace(/[\s()-]/g, '');

            // 5. INSERT en tabla Albergue
            await tx.albergue.create({
                data: {
                    id_usuario: userId,
                    nit: nitClean,
                    nombre_albergue: data.nombre_albergue.trim(),
                    logo: logoUrl,
                    descripcion: data.descripcion.trim(),
                    whatsapp_actual: whatsappClean,
                    sitio_web: data.sitio_web ? data.sitio_web.trim() : null,
                }
            });

            // 6. Registrar en historial de WhatsApp
            await tx.historialWhatsappAlbergue.create({
                data: {
                    id_albergue: userId,
                    numero_whatsapp: whatsappClean,
                }
            });

            // 7. Activar cuenta
            await tx.usuario.update({
                where: { id_usuario: userId },
                data: { estado_cuenta: 'activo' },
            });

            // 8. Log de auditoría
            await tx.logAuditoria.create({
                data: {
                    id_autor: userId,
                    accion: 'CREACION_PERFIL_ALBERGUE',
                    entidad_afectada: 'Albergue',
                    id_registro_afectado: userId,
                    ip: ip,
                }
            });

            return {
                success: true,
                status: 201,
                data: {
                    id_usuario: userId,
                    nombre_albergue: data.nombre_albergue.trim(),
                    nit: nitClean,
                    descripcion: data.descripcion.trim(),
                    whatsapp: whatsappClean,
                    logo_url: logoUrl,
                    sitio_web: data.sitio_web ? data.sitio_web.trim() : null,
                    estado_cuenta: 'activo',
                },
            };
        });
    } catch (err) {
        console.error('[albergue.service] createProfile:', err.message);
        throw err;
    }
};

// =====================================================================
// HU-AL-02: Obtener Perfil del Albergue
// =====================================================================
const getPerfilAlbergue = async (userId) => {
    try {
        const perfil = await prisma.albergue.findUnique({
            where: { id_usuario: userId },
            include: {
                usuario: {
                    select: { correo: true }
                }
            }
        });

        if (!perfil) return null;

        return {
            id_usuario: perfil.id_usuario,
            nit: perfil.nit,
            nombre_albergue: perfil.nombre_albergue,
            logo: perfil.logo,
            descripcion: perfil.descripcion,
            whatsapp_actual: perfil.whatsapp_actual,
            sitio_web: perfil.sitio_web,
            correo: perfil.usuario.correo,
        };
    } catch (err) {
        console.error('[albergue.service] getPerfil:', err.message);
        throw err;
    }
};

// =====================================================================
// HU-AL-02: Actualizar Perfil del Albergue
// =====================================================================
/**
 * - Bloquea edición de NIT (400)
 * - Si cambia whatsapp → cierra el registro anterior en historial y crea uno nuevo
 * - Si cambia logo → sube nuevo a Cloudinary y borra el anterior
 * - Audita con valor_anterior y valor_nuevo
 * - Usa $queryRaw para SELECT ... FOR UPDATE dentro de la transacción
 */
const updatePerfilAlbergue = async (userId, data, ip) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // FOR UPDATE: bloquear fila del albergue
            const rows = await tx.$queryRaw`
                SELECT * FROM albergue WHERE id_usuario = ${userId} FOR UPDATE
            `;

            if (!rows || rows.length === 0) {
                return { success: false, status: 404, message: 'Albergue no encontrado.' };
            }

            const current = rows[0];

            // 🚫 NIT bloqueado — inmutable
            if (data.nit) {
                return { success: false, status: 400, message: 'El NIT no es editable.' };
            }

            // 📞 Historial WhatsApp (si cambió)
            if (data.whatsapp_actual && data.whatsapp_actual !== current.whatsapp_actual) {
                await tx.historialWhatsappAlbergue.updateMany({
                    where: { id_albergue: userId, fecha_fin: null },
                    data: { fecha_fin: new Date() }
                });

                await tx.historialWhatsappAlbergue.create({
                    data: {
                        id_albergue: userId,
                        numero_whatsapp: data.whatsapp_actual,
                    }
                });
            }

            // 🖼️ Logo (si se envía uno nuevo)
            let logoFinal = current.logo;
            if (data.logo && data.logo !== current.logo) {
                logoFinal = await uploadImage(data.logo, 'adopcion/logos');

                if (current.logo) {
                    deleteImage(current.logo, 'adopcion/logos').catch(e =>
                        console.warn('[albergue] No se pudo eliminar logo anterior:', e.message)
                    );
                }
            }

            // 📝 Update con COALESCE-like: solo campos no-null
            const updateData = {};
            if (data.descripcion !== undefined) updateData.descripcion = data.descripcion;
            if (data.whatsapp_actual !== undefined) updateData.whatsapp_actual = data.whatsapp_actual;
            if (data.sitio_web !== undefined) updateData.sitio_web = data.sitio_web;
            updateData.logo = logoFinal;
            updateData.updated_at = new Date();

            const updated = await tx.albergue.update({
                where: { id_usuario: userId },
                data: updateData,
            });

            // 📊 Auditoría
            await tx.logAuditoria.create({
                data: {
                    id_autor: userId,
                    accion: 'UPDATE_PERFIL_ALBERGUE',
                    entidad_afectada: 'Albergue',
                    id_registro_afectado: userId,
                    valor_anterior: JSON.stringify({
                        descripcion: current.descripcion,
                        whatsapp_actual: current.whatsapp_actual,
                        sitio_web: current.sitio_web,
                        logo: current.logo,
                    }),
                    valor_nuevo: JSON.stringify({
                        descripcion: updated.descripcion,
                        whatsapp_actual: updated.whatsapp_actual,
                        sitio_web: updated.sitio_web,
                        logo: updated.logo,
                    }),
                    ip: ip,
                }
            });

            return { success: true, data: updated };
        });
    } catch (err) {
        console.error('[albergue.service] updatePerfil:', err.message);
        throw err;
    }
};

module.exports = {
    createAlbergueProfile,
    getPerfilAlbergue,
    updatePerfilAlbergue,
};
