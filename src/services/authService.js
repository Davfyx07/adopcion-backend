const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');

const BCRYPT_COST = 12;
const TERMS_VERSION = '1.0';
const MAX_LOGIN_ATTEMPTS = 5;
const BLOCK_DURATION_MINUTES = 15;

const verificarBloqueo = (user) => {
    if (user.estado_cuenta === 'bloqueado_temporal' && user.bloqueado_hasta) {
        const now = new Date();
        if (now < new Date(user.bloqueado_hasta)) {
            throw { status: 403, message: "Cuenta bloqueada temporalmente." };
        }
    }
};

const enviarCorreoRecuperacion = async (destinatario, enlace) => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const mailOptions = {
        from: `"Plataforma Adopción de Mascotas" <${process.env.SMTP_USER}>`,
        to: destinatario,
        subject: 'Recuperación de Contraseña',
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Recuperación de Contraseña</h2>
          <p>Hemos recibido una solicitud para restablecer tu contraseña.</p>
          <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
          <a href="${enlace}" 
             style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; 
                    color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">
            Restablecer Contraseña
          </a>
          <p style="color: #666; font-size: 14px;">Este enlace expirará en <strong>1 hora</strong>.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
};

/**
 * Registrar un nuevo usuario.
 * Transacción atómica: crear usuario + aceptar términos + log auditoría.
 * - Hash de password con bcrypt (costo 12)
 * - Manejo de correo duplicado (Prisma error P2002)
 *
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} params.role - nombre del rol (ej: 'adoptante', 'albergue')
 * @param {string} params.ip
 * @returns {Object} { success, status, data?, message?, action? }
 */
const registerUser = async ({ email, password, role, ip }) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // 1. Obtener id_rol (case-insensitive)
            const rolRecord = await tx.rol.findFirst({
                where: {
                    nombre_rol: { equals: role, mode: 'insensitive' }
                }
            });

            if (!rolRecord) {
                return {
                    success: false,
                    status: 400,
                    message: `El rol '${role}' no es válido o no existe en la base de datos.`,
                };
            }

            const idRol = rolRecord.id_rol;

            // 2. Hash bcrypt con costo 12
            const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

            // 3. Crear Usuario
            let user;
            try {
                user = await tx.usuario.create({
                    data: {
                        correo: email.toLowerCase(),
                        password_hash: passwordHash,
                        id_rol: idRol,
                        estado_cuenta: 'perfil_incompleto',
                        ip_registro: ip,
                    }
                });
            } catch (createErr) {
                // Capturar violación de unique constraint de Prisma (P2002)
                if (createErr instanceof Prisma.PrismaClientKnownRequestError && createErr.code === 'P2002') {
                    // Devolver objeto de error (no lanzar — la transacción se aborta si no devolvemos)
                    // Lanzamos para que $transaction haga ROLLBACK automático
                    throw { __return: { success: false, status: 409, message: 'Este correo ya tiene una cuenta registrada.', action: 'login_or_recover' } };
                }
                throw createErr;
            }

            // 4. Registrar Términos y Condiciones aceptados
            await tx.terminoAceptado.create({
                data: {
                    id_usuario: user.id_usuario,
                    version_documento: TERMS_VERSION,
                    ip_aceptacion: ip,
                }
            });

            // 5. Log de auditoría
            await tx.logAuditoria.create({
                data: {
                    id_autor: user.id_usuario,
                    accion: 'REGISTRO_USUARIO',
                    entidad_afectada: 'Usuario',
                    id_registro_afectado: user.id_usuario,
                    ip: ip,
                }
            });

            return {
                success: true,
                status: 201,
                data: {
                    id: user.id_usuario,
                    email: user.correo,
                    role: role.toLowerCase(),
                    status: user.estado_cuenta,
                }
            };
        });
    } catch (err) {
        // Si el error es un objeto de retorno (devolución controlada dentro de la transacción)
        if (err && err.__return) {
            return err.__return;
        }
        console.error('[auth.service] Error en registro:', err.message);
        throw err;
    }
};

/**
 * Iniciar sesión.
 * - Verifica email y contraseña.
 * - Maneja el bloqueo tras múltiples intentos fallidos.
 * - Genera JWT con ID y Rol del usuario (duración 24 horas).
 * - Registra la auditoría del login.
 *
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} params.ip
 * @returns {Object} { success, status, data?, message? }
 */
const loginUser = async ({ email, password, ip }) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // Buscar usuario con su rol asociado
            const user = await tx.usuario.findUnique({
                where: { correo: email.toLowerCase() },
                include: { rol: true }
            });

            if (!user) {
                return { success: false, status: 401, message: 'Correo o contraseña incorrectos.' };
            }

            // 1. Verificar si la cuenta está bloqueada temporalmente
            if (user.estado_cuenta === 'bloqueado_temporal' && user.bloqueado_hasta) {
                const now = new Date();
                const blockedUntil = new Date(user.bloqueado_hasta);

                if (now < blockedUntil) {
                    return {
                        success: false,
                        status: 403,
                        message: "Demasiados intentos fallidos. Cuenta bloqueada temporalmente. Intenta de nuevo más tarde.",
                    };
                } else {
                    // El tiempo de bloqueo ya expiró, liberamos la cuenta
                    await tx.usuario.update({
                        where: { id_usuario: user.id_usuario },
                        data: {
                            estado_cuenta: 'activo',
                            intentos_fallidos: 0,
                            bloqueado_hasta: null,
                        }
                    });
                    user.estado_cuenta = 'activo';
                    user.intentos_fallidos = 0;
                }
            }

            // 2. Comparar la contraseña
            const passwordMatch = await bcrypt.compare(password, user.password_hash);

            if (!passwordMatch) {
                // Incrementar contadores de intentos fallidos
                const newAttempts = (user.intentos_fallidos || 0) + 1;

                if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
                    // Bloquear cuenta
                    const bloqueadoHasta = new Date(Date.now() + BLOCK_DURATION_MINUTES * 60 * 1000);
                    await tx.usuario.update({
                        where: { id_usuario: user.id_usuario },
                        data: {
                            intentos_fallidos: newAttempts,
                            estado_cuenta: 'bloqueado_temporal',
                            bloqueado_hasta: bloqueadoHasta,
                        }
                    });

                    // Auditoría de cuenta bloqueada
                    await tx.logAuditoria.create({
                        data: {
                            id_autor: user.id_usuario,
                            accion: 'BLOQUEO_CUENTA',
                            entidad_afectada: 'Usuario',
                            id_registro_afectado: user.id_usuario,
                            ip: ip,
                        }
                    });
                } else {
                    // Solo actualizar el intento fallido
                    await tx.usuario.update({
                        where: { id_usuario: user.id_usuario },
                        data: { intentos_fallidos: newAttempts }
                    });
                }

                // Auditoría de login fallido
                await tx.logAuditoria.create({
                    data: {
                        id_autor: user.id_usuario,
                        accion: 'LOGIN_FALLIDO',
                        entidad_afectada: 'Usuario',
                        id_registro_afectado: user.id_usuario,
                        ip: ip,
                    }
                });

                return { success: false, status: 401, message: 'Correo o contraseña incorrectos.' };
            }

            // 3. Login Exitoso (resetear intentos si había)
            if (user.intentos_fallidos > 0 || user.estado_cuenta === 'bloqueado_temporal') {
                await tx.usuario.update({
                    where: { id_usuario: user.id_usuario },
                    data: {
                        intentos_fallidos: 0,
                        bloqueado_hasta: null,
                        estado_cuenta: user.estado_cuenta === 'bloqueado_temporal' ? 'activo' : user.estado_cuenta,
                    }
                });
            }

            // Auditoría Login Exitoso
            await tx.logAuditoria.create({
                data: {
                    id_autor: user.id_usuario,
                    accion: 'LOGIN_EXITOSO',
                    entidad_afectada: 'Usuario',
                    id_registro_afectado: user.id_usuario,
                    ip: ip,
                }
            });

            // Generar JWT
            const payload = {
                id: user.id_usuario,
                role: user.rol.nombre_rol.toLowerCase(),
            };

            const token = jwt.sign(payload, process.env.JWT_SECRET || 'fallback_secret', {
                expiresIn: process.env.JWT_EXPIRES_IN || '24h',
            });

            return {
                success: true,
                status: 200,
                data: {
                    user: {
                        id: user.id_usuario,
                        email: user.correo,
                        role: payload.role,
                    },
                    token
                }
            };
        });
    } catch (err) {
        console.error('[auth.service] Error en login:', err.message);
        throw err;
    }
};

/**
 * Solicitar recuperación de contraseña.
 * Genera un token, lo persiste y envía el enlace por email.
 *
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.ip
 * @returns {Object} { message }
 */
const forgotPassword = async ({ email, ip }) => {
    try {
        return await prisma.$transaction(async (tx) => {
            const user = await tx.usuario.findUnique({
                where: { correo: email.toLowerCase() }
            });

            if (!user) {
                // No revelar si el correo existe o no (seguridad)
                return { message: 'Si el correo está registrado, recibirás un enlace pronto.' };
            }

            verificarBloqueo(user);

            const token = crypto.randomBytes(32).toString('hex');
            const expires = new Date(Date.now() + 3600000); // 1 hora

            await tx.recuperacionPassword.create({
                data: {
                    id_usuario: user.id_usuario,
                    token_hash: token,
                    fecha_expiracion: expires,
                    estado: 'pendiente',
                }
            });

            // Auditoría
            await tx.logAuditoria.create({
                data: {
                    id_autor: user.id_usuario,
                    accion: 'SOLICITUD_RECUPERACION',
                    entidad_afectada: 'Usuario',
                    id_registro_afectado: user.id_usuario,
                    ip: ip,
                }
            });

            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const enlace = `${baseUrl}/reset-password?token=${token}`;
            await enviarCorreoRecuperacion(email, enlace);

            return { message: 'Enlace de recuperación enviado con éxito.' };
        });
    } catch (err) {
        console.error('[auth.service] Error en forgotPassword:', err.message);
        throw err;
    }
};

/**
 * Restablecer contraseña usando un token de recuperación.
 *
 * @param {Object} params
 * @param {string} params.token
 * @param {string} params.newPassword
 * @param {string} params.ip
 * @returns {Object} { success, status?, message }
 */
const resetPassword = async ({ token, newPassword, ip }) => {
    try {
        return await prisma.$transaction(async (tx) => {
            // Búsqueda del token de recuperación (directa, optimizada)
            const recovery = await tx.recuperacionPassword.findFirst({
                where: {
                    token_hash: token,
                    estado: 'pendiente',
                    fecha_expiracion: { gt: new Date() }
                }
            });

            if (!recovery) {
                return { success: false, status: 400, message: 'Token inválido o expirado.' };
            }

            const { id_usuario, id_token } = recovery;
            const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

            await tx.usuario.update({
                where: { id_usuario },
                data: { password_hash: passwordHash }
            });

            await tx.recuperacionPassword.update({
                where: { id_token },
                data: { estado: 'usado' }
            });

            await tx.logAuditoria.create({
                data: {
                    id_autor: id_usuario,
                    accion: 'RESET_PASSWORD',
                    entidad_afectada: 'Usuario',
                    id_registro_afectado: id_usuario,
                    ip: ip,
                }
            });

            return { success: true, message: 'Contraseña actualizada.' };
        });
    } catch (err) {
        console.error('[auth.service] Error en resetPassword:', err.message);
        throw err;
    }
};

/**
 * Logout de usuario.
 * - Agrega el token a la blacklist (hash SHA256)
 * - Registra auditoría
 *
 * @param {Object} params
 * @param {string} params.token
 * @param {string} params.ip
 * @returns {Object} { success, status, message }
 */
const logoutUser = async ({ token, ip }) => {
    try {
        return await prisma.$transaction(async (tx) => {
            const decoded = jwt.decode(token);

            if (!decoded || !decoded.id) {
                return { success: false, status: 400, message: 'Token inválido.' };
            }

            // 🔐 Hash del token (SHA256)
            const tokenHash = crypto
                .createHash('sha256')
                .update(token)
                .digest('hex');

            // ⏳ Expiración basada en el JWT
            const expirationDate = decoded.exp
                ? new Date(decoded.exp * 1000)
                : new Date(Date.now() + 24 * 60 * 60 * 1000);

            // Insertar en blacklist (evitar duplicados)
            const existing = await tx.blacklistToken.findFirst({
                where: { token_hash: tokenHash }
            });

            if (!existing) {
                await tx.blacklistToken.create({
                    data: {
                        token_hash: tokenHash,
                        fecha_expiracion: expirationDate,
                    }
                });
            }

            // Auditoría
            await tx.logAuditoria.create({
                data: {
                    id_autor: decoded.id,
                    accion: 'LOGOUT',
                    entidad_afectada: 'Usuario',
                    id_registro_afectado: decoded.id,
                    ip: ip,
                }
            });

            return { success: true, status: 200, message: 'Logout exitoso.' };
        });
    } catch (err) {
        console.error('[auth.service] Error en logout:', err.message);
        throw err;
    }
};

module.exports = { registerUser, loginUser, forgotPassword, resetPassword, logoutUser };
