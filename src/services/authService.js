const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../config/db');

const SALT_ROUNDS = 10;

/**
 * Obtiene un valor de configuración de la BD o devuelve el valor por defecto
 */
const getConfig = async (client, clave, valorDefault) => {
    const res = await client.query('SELECT valor FROM Configuracion_Sistema WHERE clave = $1', [clave]);
    if (res.rows.length > 0 && res.rows[0].valor) {
        const parsed = parseInt(res.rows[0].valor, 10);
        if (!isNaN(parsed)) return parsed;
    }
    return valorDefault;
};

/**
 * Verifica si el usuario está bloqueado. Lanza throw con status 403 si lo está.
 */
const verificarBloqueo = (usuario) => {
    if (usuario.bloqueado_hasta && new Date() < new Date(usuario.bloqueado_hasta)) {
        const bloqueadoHasta = new Date(usuario.bloqueado_hasta);
        const minutosRestantes = Math.ceil((bloqueadoHasta.getTime() - new Date().getTime()) / 60000);
        throw {
            status: 403,
            message: `Cuenta bloqueada por múltiples intentos fallidos. Intente nuevamente en ${minutosRestantes} minutos.`
        };
    }
};

/**
 * Limpia los intentos fallidos tras un éxito
 */
const limpiarIntentosFallidos = async (client, idUsuario) => {
    await client.query(
        'UPDATE Usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = $1',
        [idUsuario]
    );
};

/**
 * Envía correo con Nodemailer
 */
const enviarCorreoRecuperacion = async (destinatario, enlace) => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false, // true para port 465, false para otros puertos
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

const forgotPassword = async (correo) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Buscar usuario
        const resultUser = await client.query('SELECT id_usuario, correo, bloqueado_hasta, intentos_fallidos FROM Usuario WHERE correo = $1', [correo.toLowerCase()]);
        if (resultUser.rows.length === 0) {
            throw { status: 404, message: 'No se encontró un usuario con ese correo electrónico.' };
        }
        const usuario = resultUser.rows[0];

        // 2. Verificar bloqueo
        verificarBloqueo(usuario);

        // 3. Generar token
        const tokenPlano = crypto.randomUUID();
        const tokenHash = await bcrypt.hash(tokenPlano, SALT_ROUNDS);
        
        const fechaExpiracion = new Date();
        fechaExpiracion.setHours(fechaExpiracion.getHours() + 1);

        // 4. Guardar recuperación (asumimos la tabla recuperacion_password)
        await client.query(
            `INSERT INTO recuperacion_password (id_usuario, token_hash, fecha_expiracion, estado) 
             VALUES ($1, $2, $3, 'pendiente')`,
            [usuario.id_usuario, tokenHash, fechaExpiracion]
        );

        // 5. Enviar correo usando variable de entorno para la URL base (FRONTEND_URL)
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
        const enlaceRecuperacion = `${baseUrl}/reset-password?token=${tokenPlano}`;
        await enviarCorreoRecuperacion(correo, enlaceRecuperacion);

        await client.query('COMMIT');
        return { message: 'Se ha enviado un enlace de recuperación a tu correo electrónico.' };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const resetPassword = async (token, nuevaPassword) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Obtener tokens pendientes
        const resultRecuperaciones = await client.query(
            `SELECT rp.id_token, rp.id_usuario, rp.token_hash, rp.fecha_expiracion, 
                    u.bloqueado_hasta, u.intentos_fallidos, u.correo
             FROM recuperacion_password rp
             JOIN Usuario u ON rp.id_usuario = u.id_usuario
             WHERE rp.estado = 'pendiente'`
        );

        let registroValido = null;

        for (const registro of resultRecuperaciones.rows) {
            if (new Date() > new Date(registro.fecha_expiracion)) continue;
            
            const coincide = await bcrypt.compare(token, registro.token_hash);
            if (coincide) {
                registroValido = registro;
                break;
            }
        }

        if (!registroValido) {
            throw { status: 400, message: 'El token es inválido o ha expirado.' };
        }

        // 2. Verificar bloqueo actual del usuario dueño de ese token
        verificarBloqueo(registroValido);

        // 3. Hashear nueva contraseña
        const nuevoHash = await bcrypt.hash(nuevaPassword, SALT_ROUNDS);

        // 4. Actualizar contraseña del usuario
        await client.query(
            'UPDATE Usuario SET password_hash = $1 WHERE id_usuario = $2',
            [nuevoHash, registroValido.id_usuario]
        );

        // 5. Limpiar bloqueos
        await limpiarIntentosFallidos(client, registroValido.id_usuario);

        // 6. Marcar token como usado
        await client.query(
            `UPDATE recuperacion_password SET estado = 'usado' WHERE id_token = $1`,
            [registroValido.id_token]
        );

        await client.query('COMMIT');
        return { message: 'La contraseña se ha restablecido exitosamente.' };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

module.exports = {
    forgotPassword,
    resetPassword
};
