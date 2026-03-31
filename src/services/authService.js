const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const SALT_ROUNDS = 10;
const BCRYPT_COST = 12; // De HU-AUTH-01/02
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// ============================================
// Funciones Auxiliares
// ============================================

const getConfig = async (client, clave, valorDefault) => {
    const res = await client.query('SELECT valor FROM Configuracion_Sistema WHERE clave = $1', [clave]);
    if (res.rows.length > 0 && res.rows[0].valor) {
        const parsed = parseInt(res.rows[0].valor, 10);
        if (!isNaN(parsed)) return parsed;
    }
    return valorDefault;
};

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

const limpiarIntentosFallidos = async (client, idUsuario) => {
    await client.query(
        'UPDATE Usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = $1',
        [idUsuario]
    );
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

// ============================================
// HU-AUTH-01: Registro de Usuario
// ============================================

const registerUser = async (userData) => {
    const { nombre, correo, password, telefono, direccion } = userData;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Verificar si el usuario ya existe
        const existingUser = await client.query('SELECT id_usuario FROM Usuario WHERE correo = $1', [correo.toLowerCase()]);
        if (existingUser.rows.length > 0) {
            throw { status: 400, message: 'El correo electrónico ya está registrado.' };
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
        const result = await client.query(
            `INSERT INTO Usuario (nombre, correo, password_hash, telefono, direccion, id_rol, fecha_creacion) 
             VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id_usuario, nombre, correo`,
            [nombre, correo.toLowerCase(), passwordHash, telefono, direccion, 2] // Rol 2: Usuario estándar
        );

        await client.query('COMMIT');
        return { success: true, user: result.rows[0] };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// ============================================
// HU-AUTH-02: Inicio de Sesión
// ============================================

const loginUser = async (correo, password) => {
    const client = await pool.connect();
    try {
        const res = await client.query(
            'SELECT id_usuario, nombre, correo, password_hash, bloqueado_hasta FROM Usuario WHERE correo = $1',
            [correo.toLowerCase()]
        );

        if (res.rows.length === 0) {
            throw { status: 401, message: 'Credenciales inválidas.' };
        }

        const usuario = res.rows[0];
        verificarBloqueo(usuario);

        const match = await bcrypt.compare(password, usuario.password_hash);
        if (!match) {
            // Lógica de conteo de intentos (simplicada para el ejemplo)
            throw { status: 401, message: 'Credenciales inválidas.' };
        }

        await limpiarIntentosFallidos(client, usuario.id_usuario);

        const token = jwt.sign(
            { id: usuario.id_usuario, correo: usuario.correo },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Registrar Log Auditoría Login
        await client.query(
            'INSERT INTO log_auditoria (id_usuario, accion, descripcion, fecha) VALUES ($1, $2, $3, NOW())',
            [usuario.id_usuario, 'LOGIN_EXITOSO', 'Inicio de sesión exitoso']
        );

        return { success: true, token, user: { id: usuario.id_usuario, nombre: usuario.nombre, correo: usuario.correo } };
    } catch (err) {
        throw err;
    } finally {
        client.release();
    }
};

// ============================================
// HU-AUTH-03: Recuperación de Contraseña
// ============================================

const forgotPassword = async (correo) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const resultUser = await client.query('SELECT id_usuario, correo, bloqueado_hasta, intentos_fallidos FROM Usuario WHERE correo = $1', [correo.toLowerCase()]);
        if (resultUser.rows.length === 0) {
            throw { status: 404, message: 'No se encontró un usuario con ese correo electrónico.' };
        }
        const usuario = resultUser.rows[0];

        verificarBloqueo(usuario);

        const tokenPlano = crypto.randomUUID();
        const tokenHash = await bcrypt.hash(tokenPlano, SALT_ROUNDS);
        
        const fechaExpiracion = new Date();
        fechaExpiracion.setHours(fechaExpiracion.getHours() + 1);

        await client.query(
            `INSERT INTO recuperacion_password (id_usuario, token_hash, fecha_expiracion, estado) 
             VALUES ($1, $2, $3, 'pendiente')`,
            [usuario.id_usuario, tokenHash, fechaExpiracion]
        );

        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
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

        verificarBloqueo(registroValido);

        const nuevoHash = await bcrypt.hash(nuevaPassword, SALT_ROUNDS);

        await client.query(
            'UPDATE Usuario SET password_hash = $1 WHERE id_usuario = $2',
            [nuevoHash, registroValido.id_usuario]
        );

        await limpiarIntentosFallidos(client, registroValido.id_usuario);

        await client.query(
            `UPDATE recuperacion_password SET estado = 'usado' WHERE id_token = $1`,
            [registroValido.id_token]
        );

        await client.query(
            'INSERT INTO log_auditoria (id_usuario, accion, descripcion, fecha) VALUES ($1, $2, $3, NOW())',
            [registroValido.id_usuario, 'RESTABLECER_PASSWORD', 'Cambio exitoso de contraseña mediante recuperación']
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
    registerUser,
    loginUser,
    forgotPassword,
    resetPassword
};
