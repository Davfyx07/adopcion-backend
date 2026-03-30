const bcrypt = require('bcrypt');
const pool = require('../config/db');

const BCRYPT_COST = 12;
const TERMS_VERSION = '1.0';

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

module.exports = { registerUser };
