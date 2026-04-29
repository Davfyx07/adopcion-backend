// ──────────────────────────────────────────────
// Mock de Prisma (reemplaza pg Pool)
// ──────────────────────────────────────────────
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
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
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/auth/forgot-password', () => {
        it('debe enviar un correo de recuperación si el usuario existe', async () => {
            // ── Prisma calls dentro de $transaction ──
            // 1. tx.usuario.findUnique → { id_usuario, correo, ... }
            // 2. tx.recuperacion_password.create → OK
            // 3. tx.log_auditoria.create → OK
            prisma.usuario.findUnique.mockResolvedValue({
                id_usuario: 1,
                correo: 'test@ejemplo.com',
                bloqueado_hasta: null,
                intentos_fallidos: 0
            });
            prisma.recuperacion_password.create.mockResolvedValue({});
            prisma.log_auditoria.create.mockResolvedValue({});

            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'test@ejemplo.com' });

            expect(res.status).toBe(200);
            expect(res.body.message).toContain('Enlace de recuperación enviado con éxito');
            expect(prisma.recuperacion_password.create).toHaveBeenCalled();
        });

        it('debe enviar una respuesta exitosa incluso si el usuario no existe (seguridad)', async () => {
            // findUnique retorna null (usuario no encontrado)
            prisma.usuario.findUnique.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'noexiste@ejemplo.com' });

            // El servicio retorna 200 con mensaje genérico para no dar pistas de enumeración
            expect(res.status).toBe(200);
            expect(res.body.message).toContain('recibirás un enlace pronto');
        });
    });

    describe('POST /api/auth/reset-password', () => {
        it('debe restablecer la contraseña exitosamente con un token válido', async () => {
            const tokenValido = 'token-uuid-seguro';

            // ── Prisma calls dentro de $transaction ──
            // 1. tx.recuperacion_password.findFirst → token válido
            // 2. tx.usuario.update → nueva contraseña
            // 3. tx.recuperacion_password.update → marcar usado
            // 4. tx.log_auditoria.create → OK
            prisma.recuperacion_password.findFirst.mockResolvedValue({
                id_token: 1,
                id_usuario: 1,
                token_hash: tokenValido,
                fecha_expiracion: new Date(Date.now() + 3600000),
                estado: 'pendiente'
            });
            prisma.usuario.update.mockResolvedValue({});
            prisma.recuperacion_password.update.mockResolvedValue({});
            prisma.log_auditoria.create.mockResolvedValue({});

            const res = await request(app)
                .post('/api/auth/reset-password')
                .send({ token: tokenValido, newPassword: 'NuevaContrasena123!' });

            expect(res.status).toBe(200);
            expect(res.body.message).toContain('Contraseña actualizada');
            expect(prisma.usuario.update).toHaveBeenCalled();
            expect(prisma.log_auditoria.create).toHaveBeenCalled();
        });

        it('debe retornar 400 si el token es inválido', async () => {
            // findFirst retorna null (token no encontrado o expirado)
            prisma.recuperacion_password.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/auth/reset-password')
                .send({ token: 'token-invalido', newPassword: 'NuevaContrasena123!' });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('Token inválido o expirado');
        });
    });
});
