// ──────────────────────────────────────────────
// Auth Service — Forgot & Reset Password Tests
// (Service-level tests, complementan auth.test.js
//  que cubre los mismos escenarios via routes)
// ──────────────────────────────────────────────

jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');

jest.mock('bcrypt', () => ({
    hash: jest.fn(),
}));

jest.mock('nodemailer', () => ({
    createTransport: jest.fn().mockReturnValue({
        sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
    }),
}));

const bcrypt = require('bcrypt');
const { forgotPassword, resetPassword } = require('../services/authService');

describe('authService — forgotPassword', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('debe generar token y enviar correo cuando el email existe', async () => {
        prisma.usuario.findUnique.mockResolvedValueOnce({
            id_usuario: 1,
            correo: 'test@ejemplo.com',
            estado_cuenta: 'activo',
            bloqueado_hasta: null,
        });
        prisma.recuperacionPassword.create.mockResolvedValueOnce({ id_token: 1 });
        prisma.logAuditoria.create.mockResolvedValueOnce({});

        const result = await forgotPassword({ email: 'test@ejemplo.com', ip: '127.0.0.1' });

        expect(result.message).toContain('Enlace de recuperación enviado con éxito');
        expect(prisma.recuperacionPassword.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    id_usuario: 1,
                    token_hash: expect.any(String),
                    estado: 'pendiente',
                }),
            })
        );
        expect(prisma.logAuditoria.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ accion: 'SOLICITUD_RECUPERACION' }),
            })
        );
    });

    it('debe retornar mensaje genérico cuando el email NO está registrado (anti-enumeración)', async () => {
        prisma.usuario.findUnique.mockResolvedValueOnce(null);

        const result = await forgotPassword({ email: 'noexiste@ejemplo.com', ip: '127.0.0.1' });

        expect(result.message).toContain('Si el correo está registrado, recibirás un enlace pronto');
        // No debe crear token ni auditar
        expect(prisma.recuperacionPassword.create).not.toHaveBeenCalled();
        expect(prisma.logAuditoria.create).not.toHaveBeenCalled();
    });

    it('debe lanzar error si la cuenta está bloqueada', async () => {
        prisma.usuario.findUnique.mockResolvedValueOnce({
            id_usuario: 1,
            correo: 'bloqueado@ejemplo.com',
            estado_cuenta: 'bloqueado_temporal',
            bloqueado_hasta: new Date(Date.now() + 3600000), // 1 hora en el futuro
        });

        // verificarBloqueo lanza un objeto literal { status, message }, no un Error
        await expect(
            forgotPassword({ email: 'bloqueado@ejemplo.com', ip: '127.0.0.1' })
        ).rejects.toMatchObject({ status: 403, message: expect.stringContaining('Cuenta bloqueada temporalmente') });
    });

    it('debe incluir el token en el enlace de recuperación', async () => {
        prisma.usuario.findUnique.mockResolvedValueOnce({
            id_usuario: 1,
            correo: 'test@ejemplo.com',
            estado_cuenta: 'activo',
            bloqueado_hasta: null,
        });

        let savedToken = null;
        prisma.recuperacionPassword.create.mockImplementationOnce(({ data }) => {
            savedToken = data.token_hash;
            return Promise.resolve({ id_token: 1 });
        });
        prisma.logAuditoria.create.mockResolvedValueOnce({});

        await forgotPassword({ email: 'test@ejemplo.com', ip: '127.0.0.1' });

        // El token debe ser un hex string de 64 caracteres (32 bytes)
        expect(savedToken).toMatch(/^[a-f0-9]{64}$/);
    });
});

describe('authService — resetPassword', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('debe actualizar la contraseña con un token válido', async () => {
        const tokenValido = 'abc123tokenseguro';
        const hashedPassword = '$2b$12$nuevo_hash_simulado';

        bcrypt.hash.mockResolvedValueOnce(hashedPassword);

        // Token válido, no expirado, pendiente
        prisma.recuperacionPassword.findFirst.mockResolvedValueOnce({
            id_token: 1,
            id_usuario: 1,
            token_hash: tokenValido,
            fecha_expiracion: new Date(Date.now() + 3600000),
            estado: 'pendiente',
        });
        prisma.usuario.update.mockResolvedValueOnce({});
        prisma.recuperacionPassword.update.mockResolvedValueOnce({});
        prisma.logAuditoria.create.mockResolvedValueOnce({});

        const result = await resetPassword({
            token: tokenValido,
            newPassword: 'NuevaPass123!',
            ip: '127.0.0.1',
        });

        expect(result.success).toBe(true);
        expect(result.message).toContain('Contraseña actualizada');
        expect(bcrypt.hash).toHaveBeenCalledWith('NuevaPass123!', 12);
        expect(prisma.usuario.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id_usuario: 1 },
                data: { password_hash: hashedPassword },
            })
        );
        expect(prisma.recuperacionPassword.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id_token: 1 },
                data: { estado: 'usado' },
            })
        );
        expect(prisma.logAuditoria.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ accion: 'RESET_PASSWORD' }),
            })
        );
    });

    it('debe rechazar token inválido o expirado', async () => {
        prisma.recuperacionPassword.findFirst.mockResolvedValueOnce(null);

        const result = await resetPassword({
            token: 'token-invalido',
            newPassword: 'NuevaPass123!',
            ip: '127.0.0.1',
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe(400);
        expect(result.message).toContain('Token inválido o expirado');
        expect(prisma.usuario.update).not.toHaveBeenCalled();
    });

    it('debe rechazar token que ya fue usado', async () => {
        // Token con estado 'usado'
        prisma.recuperacionPassword.findFirst.mockResolvedValueOnce(null); // findFirst filtra por estado='pendiente'

        const result = await resetPassword({
            token: 'token-usado',
            newPassword: 'NuevaPass123!',
            ip: '127.0.0.1',
        });

        expect(result.success).toBe(false);
        expect(result.message).toContain('Token inválido o expirado');
    });

    it('debe rechazar token expirado por fecha', async () => {
        // La query de findFirst ya incluye fecha_expiracion > now
        // Si el token está expirado, findFirst devuelve null
        prisma.recuperacionPassword.findFirst.mockResolvedValueOnce(null);

        const result = await resetPassword({
            token: 'token-expirado',
            newPassword: 'NuevaPass123!',
            ip: '127.0.0.1',
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe(400);
    });

    it('debe verificar que findFirst use filtros correctos (pendiente + no expirado)', async () => {
        bcrypt.hash.mockResolvedValueOnce('$2b$12$hash');
        prisma.recuperacionPassword.findFirst.mockResolvedValueOnce({
            id_token: 1,
            id_usuario: 1,
            token_hash: 'token',
            fecha_expiracion: new Date(Date.now() + 3600000),
            estado: 'pendiente',
        });
        prisma.usuario.update.mockResolvedValueOnce({});
        prisma.recuperacionPassword.update.mockResolvedValueOnce({});
        prisma.logAuditoria.create.mockResolvedValueOnce({});

        await resetPassword({ token: 'token', newPassword: 'NuevaPass123!', ip: '127.0.0.1' });

        expect(prisma.recuperacionPassword.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    token_hash: 'token',
                    estado: 'pendiente',
                    fecha_expiracion: expect.objectContaining({ gt: expect.any(Date) }),
                },
            })
        );
    });
});
