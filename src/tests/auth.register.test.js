jest.mock('../config/db', () => ({
    connect: jest.fn(),
    query: jest.fn()
}));

const pool = require('../config/db');
const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/authRoutes');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('HU-AUTH-01 - Registro de Usuario', () => {
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();
        mockClient = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn()
        };
        pool.connect.mockResolvedValue(mockClient);
    });

    describe('POST /api/auth/register', () => {
        it('debe registrar un usuario exitosamente con datos válidos', async () => {
            // Secuencia: BEGIN → SELECT rol → INSERT usuario → INSERT términos → INSERT log → COMMIT
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ rows: [{ id_rol: 2 }] }) // SELECT rol (adoptante)
                .mockResolvedValueOnce({ // INSERT usuario
                    rows: [{ id_usuario: '550e8400-e29b-41d4-a716-446655440000', correo: 'test@ejemplo.com', estado_cuenta: 'perfil_incompleto' }]
                })
                .mockResolvedValueOnce({}) // INSERT términos
                .mockResolvedValueOnce({}) // INSERT log auditoría
                .mockResolvedValueOnce({}); // COMMIT

            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'test@ejemplo.com',
                    password: 'Test1234',
                    confirmPassword: 'Test1234',
                    role: 'adoptante',
                    termsAccepted: true
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('Cuenta creada');
            expect(res.body.data.email).toBe('test@ejemplo.com');
            expect(res.body.data.role).toBe('adoptante');
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
        });

        it('debe retornar 409 si el correo ya existe (violación UNIQUE)', async () => {
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ rows: [{ id_rol: 2 }] }) // SELECT rol
                .mockRejectedValueOnce({ code: '23505' }) // INSERT viola UNIQUE
                .mockResolvedValueOnce({}); // ROLLBACK

            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'existente@ejemplo.com',
                    password: 'Test1234',
                    confirmPassword: 'Test1234',
                    role: 'adoptante',
                    termsAccepted: true
                });

            expect(res.status).toBe(409);
            expect(res.body.message).toContain('ya tiene una cuenta');
            expect(res.body.action).toBe('login_or_recover');
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('ROLLBACK'));
        });

        it('debe retornar 400 si la contraseña no cumple los requisitos mínimos', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'test@ejemplo.com',
                    password: '123',
                    confirmPassword: '123',
                    role: 'adoptante',
                    termsAccepted: true
                });

            expect(res.status).toBe(400);
            expect(res.body.errors).toBeDefined();
            expect(res.body.errors.some(e => e.field === 'password')).toBe(true);
            // No debe llegar al servicio
            expect(pool.connect).not.toHaveBeenCalled();
        });

        it('debe retornar 400 si falta el campo termsAccepted', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'test@ejemplo.com',
                    password: 'Test1234',
                    confirmPassword: 'Test1234',
                    role: 'adoptante'
                });

            expect(res.status).toBe(400);
            expect(res.body.errors.some(e => e.field === 'termsAccepted')).toBe(true);
        });

        it('debe retornar 400 si el rol no es válido', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'test@ejemplo.com',
                    password: 'Test1234',
                    confirmPassword: 'Test1234',
                    role: 'superadmin',
                    termsAccepted: true
                });

            expect(res.status).toBe(400);
            expect(res.body.errors.some(e => e.field === 'role')).toBe(true);
        });

        it('debe retornar 400 si las contraseñas no coinciden', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'test@ejemplo.com',
                    password: 'Test1234',
                    confirmPassword: 'Otra1234',
                    role: 'adoptante',
                    termsAccepted: true
                });

            expect(res.status).toBe(400);
            expect(res.body.errors.some(e => e.field === 'confirmPassword')).toBe(true);
        });
    });
});
