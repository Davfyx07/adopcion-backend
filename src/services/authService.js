const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const BCRYPT_COST = 12;
const TERMS_VERSION = '1.0';
const MAX_LOGIN_ATTEMPTS = 5;
const BLOCK_DURATION_MINUTES = 15;

/**
 * - Atomicidad (BEGIN / COMMIT / ROLLBACK)
 * - Hash password
 */
const registerUser = async ({ email, password, role, ip }) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Obtener id_rol
        const roleResult = await client.query(
            'SELECT id_rol FROM Rol WHERE LOWER(nombre_rol) = $1',
            [role.toLowerCase()]
        );

        if (roleResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return {
                success: false,
                status: 400,
                message: `El rol '${role}' no es válido o no existe en la base de datos.`,
            };
        }

        const idRol = roleResult.rows[0].id_rol;

        // 2. Hash bcrypt con costo 12
        const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

        let user;

        try {
            // 3. Crear Usuario (Manejo Senior de unique constraint)
            const result = await client.query(
                `INSERT INTO Usuario 
                 (correo, password_hash, id_rol, estado_cuenta, ip_registro, fecha_registro)
                 VALUES ($1, $2, $3, $4, $5, NOW())
                 RETURNING id_usuario, correo, estado_cuenta`,
                [
                    email.toLowerCase(),
                    passwordHash,
                    idRol,
                    'perfil_incompleto',
                    ip
                ]
            );
            user = result.rows[0];
        } catch (dbErr) {
            // Capturar la violación de restricción "UNIQUE" de Postgres
            if (dbErr.code === '23505') {
                await client.query('ROLLBACK');
                return {
                    success: false,
                    status: 409,
                    message: 'Este correo ya tiene una cuenta registrada.',
                    action: 'login_or_recover',
                };
            }
            throw dbErr;
        }

        // 4. Registrar Términos y Condiciones aceptados
        await client.query(
            `INSERT INTO Termino_Aceptado (id_usuario, version_documento, ip_aceptacion, fecha_hora_aceptacion)
             VALUES ($1, $2, $3, NOW())`,
            [user.id_usuario, TERMS_VERSION, ip]
        );

        // 5. Log de auditoría
        await client.query(
            `INSERT INTO Log_Auditoria 
             (id_autor, accion, entidad_afectada, id_registro_afectado, ip, fecha)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [user.id_usuario, 'REGISTRO_USUARIO', 'Usuario', user.id_usuario, ip]
        );

        await client.query('COMMIT');

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

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[auth.service] Error en registro:', err.message);
        throw err;
    } finally {
        client.release();
    }
};

/**
 * Iniciar sesión
 * - Verifica email y contraseña.
 * - Maneja el bloqueo tras múltiples intentos fallidos.
 * - Genera JWT con ID y Rol del usuario con duración de 24 horas.
 * - Registra la auditoría del login.
 */
const loginUser = async ({ email, password, ip }) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Buscar usuario con su rol asociado
        const userResult = await client.query(
            `SELECT u.id_usuario, u.correo, u.password_hash, u.estado_cuenta, u.intentos_fallidos, u.bloqueado_hasta, r.nombre_rol 
             FROM Usuario u 
             JOIN Rol r ON u.id_rol = r.id_rol 
             WHERE u.correo = $1`,
            [email.toLowerCase()]
        );

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return {
                success: false,
                status: 401,
                message: 'Correo o contraseña incorrectos.',
            };
        }

        const user = userResult.rows[0];

        // 1. Verificar si la cuenta está bloqueada temporalmente
        if (user.estado_cuenta === 'bloqueado temporal' && user.bloqueado_hasta) {
            const now = new Date();
            const blockedUntil = new Date(user.bloqueado_hasta);

            if (now < blockedUntil) {
                await client.query('ROLLBACK');
                return {
                    success: false,
                    status: 403,
                    message: "Demasiados intentos fallidos. Cuenta bloqueada temporalmente. Intenta de nuevo más tarde.",
                };
            } else {
                // El tiempo de bloqueo ya expiró, liberamos la cuenta
                await client.query(
                    "UPDATE Usuario SET estado_cuenta = 'activo', intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = $1",
                    [user.id_usuario]
                );
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
                await client.query(
                    "UPDATE Usuario SET intentos_fallidos = $1, estado_cuenta = 'bloqueado temporal', bloqueado_hasta = NOW() + interval '15 minutes' WHERE id_usuario = $2",
                    [newAttempts, user.id_usuario]
                );

                // Auditoría de cuenta bloqueada
                await client.query(
                    "INSERT INTO Log_Auditoria (id_autor, accion, entidad_afectada, id_registro_afectado, ip, fecha) VALUES ($1, $2, $3, $4, $5, NOW())",
                    [user.id_usuario, 'BLOQUEO_CUENTA', 'Usuario', user.id_usuario, ip]
                );
            } else {
                // Solo actualizar el intento fallido
                await client.query(
                    "UPDATE Usuario SET intentos_fallidos = $1 WHERE id_usuario = $2",
                    [newAttempts, user.id_usuario]
                );
            }

            // Auditoría de login fallido
            await client.query(
                "INSERT INTO Log_Auditoria (id_autor, accion, entidad_afectada, id_registro_afectado, ip, fecha) VALUES ($1, $2, $3, $4, $5, NOW())",
                [user.id_usuario, 'LOGIN_FALLIDO', 'Usuario', user.id_usuario, ip]
            );

            await client.query('COMMIT');

            return {
                success: false,
                status: 401,
                message: 'Correo o contraseña incorrectos.',
            };
        }

        // 3. Login Exitoso (resetear intentos si había)
        if (user.intentos_fallidos > 0 || user.estado_cuenta === 'bloqueado temporal') {
            await client.query(
                "UPDATE Usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL, estado_cuenta = CASE WHEN estado_cuenta = 'bloqueado temporal' THEN 'activo' ELSE estado_cuenta END WHERE id_usuario = $1",
                [user.id_usuario]
            );
        }

        // Auditoría Login Exitoso
        await client.query(
            "INSERT INTO Log_Auditoria (id_autor, accion, entidad_afectada, id_registro_afectado, ip, fecha) VALUES ($1, $2, $3, $4, $5, NOW())",
            [user.id_usuario, 'LOGIN_EXITOSO', 'Usuario', user.id_usuario, ip]
        );

        await client.query('COMMIT');

        // Generar JWT
        const payload = {
            id: user.id_usuario,
            role: user.nombre_rol.toLowerCase(),
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

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[auth.service] Error en login:', err.message);
        throw err;
    } finally {
        client.release();
    }
};

module.exports = { registerUser, loginUser };
