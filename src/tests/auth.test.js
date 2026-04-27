// Mock de la base de datos
jest.mock('../config/db', () => ({
    connect: jest.fn(),
    query: jest.fn()
}));
const pool = require('../config/db');
const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/authRoutes');

// Mock de nodemailer
jest.mock('nodemailer', () => ({
    createTransport: jest.fn().mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' })
    })
}));

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Módulo de Recuperación de Contraseña (HU-AUTH-03)', () => {
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();
        mockClient = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn()
        };
        pool.connect.mockResolvedValue(mockClient);
    });

    describe('POST /api/auth/forgot-password', () => {
        it('debe enviar un correo de recuperación si el usuario existe', async () => {
            // Mock búsqueda de usuario
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({  // SELECT user
                    rows: [{ id_usuario: 1, correo: 'test@ejemplo.com', bloqueado_hasta: null, intentos_fallidos: 0 }] 
                });

            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'test@ejemplo.com' });

            expect(res.status).toBe(200);
            expect(res.body.message).toContain('Enlace de recuperación enviado con éxito');
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO Recuperacion_Password'), expect.any(Array));
        });

        it('debe enviar una respuesta exitosa incluso si el usuario no existe (seguridad)', async () => {
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ rows: [] }); // SELECT user

            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'noexiste@ejemplo.com' });

            // El servicio retorna 200 con el mensaje de " pronto recibirás un enlace" para no dar pistas de enumeración de usuarios
            expect(res.status).toBe(200);
            expect(res.body.message).toContain('recibirás un enlace pronto');
        });
    });

    describe('POST /api/auth/reset-password', () => {
        it('debe restablecer la contraseña exitosamente con un token válido', async () => {
            const tokenValido = 'token-uuid-seguro';
            
            // Secuencia de queries en resetPassword:
            // 1. BEGIN
            // 2. SELECT tokens pendientes
            // 3. UPDATE password
            // 4. Limpiar intentos
            // 5. Marcar usado
            // 6. Log auditoría
            // 7. COMMIT

            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ // SELECT tokens
                    rows: [{ 
                        id_token: 1, 
                        id_usuario: 1, 
                        token_hash: await require('bcrypt').hash(tokenValido, 10), 
                        fecha_expiracion: new Date(Date.now() + 3600000), 
                        bloqueado_hasta: null
                    }] 
                });

            const res = await request(app)
                .post('/api/auth/reset-password')
                .send({ token: tokenValido, newPassword: 'NuevaContrasena123!' });

            expect(res.status).toBe(200);
            expect(res.body.message).toContain('Contraseña actualizada');
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE Usuario SET password_hash'), expect.any(Array));
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO Log_Auditoria'), expect.any(Array));
        });

        it('debe retornar 400 si el token es inválido', async () => {
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ rows: [] }); // SELECT tokens

            const res = await request(app)
                .post('/api/auth/reset-password')
                .send({ token: 'token-invalido', newPassword: 'NuevaContrasena123!' });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('Token inválido o expirado');
        });
    });
});
