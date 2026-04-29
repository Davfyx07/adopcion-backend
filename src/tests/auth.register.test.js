// ──────────────────────────────────────────────
// Mock de Prisma (reemplaza pg Pool)
// ──────────────────────────────────────────────
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));
const { Prisma } = require('@prisma/client');

const prisma = require('../config/prisma');
const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/authRoutes');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('HU-AUTH-01 - Registro de Usuario', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/auth/register', () => {
        it('debe registrar un usuario exitosamente con datos válidos', async () => {
            // ── Mock de Prisma calls dentro de $transaction ──
            // 1. tx.rol.findFirst → { id_rol: 2 }
            // 2. tx.usuario.create → { id_usuario, correo, estado_cuenta }
            // 3. tx.termino_aceptado.create → OK
            // 4. tx.log_auditoria.create → OK
            prisma.rol.findFirst.mockResolvedValue({ id_rol: 2 });
            prisma.usuario.create.mockResolvedValue({
                id_usuario: '550e8400-e29b-41d4-a716-446655440000',
                correo: 'test@ejemplo.com',
                estado_cuenta: 'perfil_incompleto',
            });
            prisma.termino_aceptado.create.mockResolvedValue({});
            prisma.log_auditoria.create.mockResolvedValue({});

            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'test@ejemplo.com',
                    password: 'Test1234!',
                    confirmPassword: 'Test1234!',
                    role: 'adoptante',
                    termsAccepted: true
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('Cuenta creada');
            expect(res.body.data.email).toBe('test@ejemplo.com');
            expect(res.body.data.role).toBe('adoptante');

            // Verificar que se ejecutaron las operaciones de Prisma
            expect(prisma.rol.findFirst).toHaveBeenCalled();
            expect(prisma.usuario.create).toHaveBeenCalled();
            expect(prisma.termino_aceptado.create).toHaveBeenCalled();
            expect(prisma.log_auditoria.create).toHaveBeenCalled();
        });

        it('debe retornar 409 si el correo ya existe (violación UNIQUE)', async () => {
            // Mock: rol.findFirst OK, usuario.create lanza P2002 (unique constraint)
            prisma.rol.findFirst.mockResolvedValue({ id_rol: 2 });

            // Crear un error de Prisma que simule P2002 (unique constraint)
            const prismaError = new Prisma.PrismaClientKnownRequestError(
                'Unique constraint failed on the fields: (`correo`)',
                { code: 'P2002', clientVersion: '7.8.0' }
            );
            prisma.usuario.create.mockRejectedValue(prismaError);

            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'existente@ejemplo.com',
                    password: 'Test1234!',
                    confirmPassword: 'Test1234!',
                    role: 'adoptante',
                    termsAccepted: true
                });

            expect(res.status).toBe(409);
            expect(res.body.message).toContain('ya tiene una cuenta');
            expect(res.body.action).toBe('login_or_recover');
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
            // No debe llegar al servicio — validación temprana en middleware
            expect(prisma.usuario.create).not.toHaveBeenCalled();
        });

        it('debe retornar 400 si falta el campo termsAccepted', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'test@ejemplo.com',
                    password: 'Test1234!',
                    confirmPassword: 'Test1234!',
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
                    password: 'Test1234!',
                    confirmPassword: 'Test1234!',
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
                    password: 'Test1234!',
                    confirmPassword: 'Otra1234!',
                    role: 'adoptante',
                    termsAccepted: true
                });

            expect(res.status).toBe(400);
            expect(res.body.errors.some(e => e.field === 'confirmPassword')).toBe(true);
        });
    });
});
