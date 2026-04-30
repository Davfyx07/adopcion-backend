// ──────────────────────────────────────────────
// Mock de Prisma (reemplaza pg Pool)
// ──────────────────────────────────────────────
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');

// Mock de bcrypt
jest.mock('bcrypt', () => ({
    compare: jest.fn(),
    hash: jest.fn()
}));

const bcrypt = require('bcrypt');
const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/authRoutes');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('HU-AUTH-02 - Inicio de Sesión', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/auth/login', () => {
        const usuarioMock = {
            id_usuario: '550e8400-e29b-41d4-a716-446655440000',
            correo: 'test@ejemplo.com',
            password_hash: '$2b$10$hash_simulado',
            estado_cuenta: 'activo',
            intentos_fallidos: 0,
            bloqueado_hasta: null,
            rol: { nombre_rol: 'Adoptante' }
        };

        it('debe iniciar sesión exitosamente y retornar JWT', async () => {
            bcrypt.compare.mockResolvedValue(true);

            // ── Prisma calls dentro de $transaction ──
            // 1. tx.usuario.findUnique → usuarioMock (with include.rol)
            // 2. tx.logAuditoria.create → OK (login exitoso)
            prisma.usuario.findUnique.mockResolvedValue(usuarioMock);
            prisma.logAuditoria.create.mockResolvedValue({});

            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@ejemplo.com',
                    password: 'Test1234!'
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

            // 1. tx.usuario.findUnique → usuarioMock
            // 2. tx.usuario.update → actualizar intentos_fallidos
            // 3. tx.logAuditoria.create → LOGIN_FALLIDO
            prisma.usuario.findUnique.mockResolvedValue(usuarioMock);
            prisma.usuario.update.mockResolvedValue({});
            prisma.logAuditoria.create.mockResolvedValue({});

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
                estado_cuenta: 'bloqueado_temporal',
                bloqueado_hasta: fechaFutura,
                intentos_fallidos: 5
            };

            prisma.usuario.findUnique.mockResolvedValue(usuarioBloqueado);

            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'bloqueado@ejemplo.com',
                    password: 'Test1234!'
                });

            expect(res.status).toBe(403);
            expect(res.body.message).toContain('Cuenta bloqueada');
        });

        it('debe retornar 400 si el email no tiene formato válido', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'email-invalido',
                    password: 'Test1234!'
                });

            expect(res.status).toBe(400);
            expect(res.body.errors.some(e => e.field === 'email')).toBe(true);
            // No debe llegar al servicio
            expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
        });

        it('debe bloquear la cuenta tras 5 intentos fallidos', async () => {
            bcrypt.compare.mockResolvedValue(false);

            const usuarioConIntentos = {
                ...usuarioMock,
                intentos_fallidos: 4
            };

            // 1. tx.usuario.findUnique → usuario con 4 intentos fallidos
            // 2. tx.usuario.update → bloquea (5to intento)
            // 3. tx.logAuditoria.create → BLOQUEO_CUENTA
            // 4. tx.logAuditoria.create → LOGIN_FALLIDO
            prisma.usuario.findUnique.mockResolvedValue(usuarioConIntentos);
            prisma.usuario.update.mockResolvedValue({});
            prisma.logAuditoria.create.mockResolvedValue({});

            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@ejemplo.com',
                    password: 'WrongPassword'
                });

            expect(res.status).toBe(401);
            expect(res.body.message).toContain('Correo o contraseña incorrectos');

            // Verificar que se registró el bloqueo (BLOQUEO_CUENTA)
            expect(prisma.logAuditoria.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        accion: 'BLOQUEO_CUENTA'
                    })
                })
            );
        });
    });
});
