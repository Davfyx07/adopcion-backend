jest.mock('../config/db', () => ({
    connect: jest.fn(),
    query: jest.fn()
}));

jest.mock('bcrypt', () => ({
    compare: jest.fn(),
    hash: jest.fn()
}));

const bcrypt = require('bcrypt');
const pool = require('../config/db');
const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/authRoutes');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('HU-AUTH-02 - Inicio de Sesión', () => {
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();
        mockClient = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn()
        };
        pool.connect.mockResolvedValue(mockClient);
    });

    describe('POST /api/auth/login', () => {
        const usuarioMock = {
            id_usuario: '550e8400-e29b-41d4-a716-446655440000',
            correo: 'test@ejemplo.com',
            password_hash: '$2b$10$hash_simulado',
            estado_cuenta: 'activo',
            intentos_fallidos: 0,
            bloqueado_hasta: null,
            nombre_rol: 'Adoptante'
        };

        it('debe iniciar sesión exitosamente y retornar JWT', async () => {
            bcrypt.compare.mockResolvedValue(true);

            // Secuencia: BEGIN → SELECT user → UPDATE reset attempts → INSERT log → COMMIT
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ rows: [usuarioMock] }) // SELECT user
                .mockResolvedValueOnce({}) // UPDATE reset attempts
                .mockResolvedValueOnce({}) // INSERT log login exitoso
                .mockResolvedValueOnce({}); // COMMIT

            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@ejemplo.com',
                    password: 'Test1234'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('Inicio de sesión exitoso');
            expect(res.body.data.token).toBeDefined();
            expect(res.body.data.user.email).toBe('test@ejemplo.com');
            expect(res.body.data.user.role).toBe('adoptante');
        });

        it('debe retornar 401 con credenciales inválidas', async () => {
            bcrypt.compare.mockResolvedValue(false);

            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ rows: [usuarioMock] }) // SELECT user
                .mockResolvedValueOnce({}) // UPDATE intentos_fallidos
                .mockResolvedValueOnce({}) // INSERT log login fallido
                .mockResolvedValueOnce({}); // COMMIT

            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@ejemplo.com',
                    password: 'WrongPassword'
                });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('Correo o contraseña incorrectos');
        });

        it('debe retornar 403 cuando la cuenta está bloqueada temporalmente', async () => {
            const fechaFutura = new Date(Date.now() + 30 * 60 * 1000).toISOString();
            const usuarioBloqueado = {
                ...usuarioMock,
                estado_cuenta: 'bloqueado temporal',
                bloqueado_hasta: fechaFutura,
                intentos_fallidos: 5
            };

            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ rows: [usuarioBloqueado] }) // SELECT user
                .mockResolvedValueOnce({}); // ROLLBACK

            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'bloqueado@ejemplo.com',
                    password: 'Test1234'
                });

            expect(res.status).toBe(403);
            expect(res.body.message).toContain('Cuenta bloqueada');
        });

        it('debe retornar 400 si el email no tiene formato válido', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'email-invalido',
                    password: 'Test1234'
                });

            expect(res.status).toBe(400);
            expect(res.body.errors.some(e => e.field === 'email')).toBe(true);
            expect(pool.connect).not.toHaveBeenCalled();
        });

        it('debe bloquear la cuenta tras 5 intentos fallidos', async () => {
            bcrypt.compare.mockResolvedValue(false);

            const usuarioConIntentos = {
                ...usuarioMock,
                intentos_fallidos: 4
            };

            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ rows: [usuarioConIntentos] }) // SELECT user
                .mockResolvedValueOnce({}) // UPDATE bloqueo
                .mockResolvedValueOnce({}) // INSERT log bloqueo
                .mockResolvedValueOnce({}) // INSERT log login fallido
                .mockResolvedValueOnce({}); // COMMIT

            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@ejemplo.com',
                    password: 'WrongPassword'
                });

            expect(res.status).toBe(401);
            expect(res.body.message).toContain('Correo o contraseña incorrectos');
            // Verificar que se registró el bloqueo (BLOQUEO_CUENTA va en params, no en SQL)
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('Log_Auditoria'),
                expect.arrayContaining(['BLOQUEO_CUENTA'])
            );
        });
    });
});
