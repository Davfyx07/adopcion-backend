/**
 * Tests para adminUserController/Service — HU-ADM-01
 *
 * Cubre:
 *   1. GET /api/admin/usuarios → 200 (rol admin)
 *   2. GET /api/admin/usuarios → 403 (rol albergue)
 *   3. GET /api/admin/usuarios?rol=1 → 200 filtrado por rol
 *   4. PATCH /api/admin/usuarios/:id/estado → 200 { estado: 'suspendido' }
 *   5. PATCH /api/admin/usuarios/:id/estado → 400 (self-guard)
 *   6. DELETE /api/admin/usuarios/:id → 200
 *   7. DELETE /api/admin/usuarios/:id → 400 (self-guard)
 */

// ── Mock de Prisma ────────────────────────────────────────────
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');

// ── authMiddleware controlable por header ─────────────────────
jest.mock('../middlewares/authMiddleware', () => (req, res, next) => {
    const role = req.headers['x-test-role'] || 'administrador';
    if (role === 'none') {
        return res.status(401).json({ success: false, message: 'Token requerido o formato inválido.' });
    }
    // x-test-user-id permite simular el userId del admin autenticado
    const userId = req.headers['x-test-user-id'] || '1';
    req.user = { id: userId, role };
    req.token = 'mock-token';
    next();
});

// ── authorizeRole: lógica real inline ────────────────────────
jest.mock('../middlewares/authorizeRole', () => (allowedRoles) => (req, res, next) => {
    if (!req.user || !req.user.role) {
        return res.status(401).json({ success: false, message: 'Se requiere autenticación.' });
    }
    const userRole = req.user.role.toLowerCase();
    if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ success: false, message: 'No tienes permisos para acceder a este recurso.' });
    }
    next();
});

const request = require('supertest');
const express = require('express');
const adminUserRoutes = require('../routes/adminUserRoutes');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.socket = { remoteAddress: '127.0.0.1' };
    next();
});
app.use('/api', adminUserRoutes);

// ── Datos de prueba ───────────────────────────────────────────
const usuariosMock = [
    {
        id_usuario: 2,
        correo: 'adoptante@test.com',
        id_rol: 1,
        estado_cuenta: 'activo',
        fecha_registro: new Date('2024-01-01'),
        deleted_at: null,
        rol: { nombre_rol: 'adoptante' },
        adoptante: { nombre_completo: 'Juan Pérez' },
        albergue: null,
    },
    {
        id_usuario: 3,
        correo: 'albergue@test.com',
        id_rol: 2,
        estado_cuenta: 'activo',
        fecha_registro: new Date('2024-01-02'),
        deleted_at: null,
        rol: { nombre_rol: 'albergue' },
        adoptante: null,
        albergue: { nombre_albergue: 'Patitas Felices' },
    },
];

describe('Admin User Management (HU-ADM-01)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ── 1. GET con rol admin → 200 ────────────────────────────
    describe('GET /api/admin/usuarios', () => {
        it('1. devuelve 200 con lista de usuarios cuando el rol es admin', async () => {
            prisma.usuario.findMany.mockResolvedValueOnce(usuariosMock);

            const res = await request(app)
                .get('/api/admin/usuarios')
                .set('Authorization', 'Bearer mock-token')
                .set('x-test-role', 'administrador')
                .set('x-test-user-id', '1');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data).toHaveLength(2);
            // Verifica mapeo de campos
            expect(res.body.data[0]).toHaveProperty('correo');
            expect(res.body.data[0]).toHaveProperty('rol');
            expect(res.body.data[0]).toHaveProperty('estado');
        });

        it('2. devuelve 403 cuando el rol es albergue', async () => {
            const res = await request(app)
                .get('/api/admin/usuarios')
                .set('Authorization', 'Bearer mock-token')
                .set('x-test-role', 'albergue')
                .set('x-test-user-id', '1');

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        it('3. devuelve 200 con lista filtrada por rol=1 (adoptante)', async () => {
            const adoptantesMock = [usuariosMock[0]];
            prisma.usuario.findMany.mockResolvedValueOnce(adoptantesMock);

            const res = await request(app)
                .get('/api/admin/usuarios?rol=1')
                .set('Authorization', 'Bearer mock-token')
                .set('x-test-role', 'administrador')
                .set('x-test-user-id', '1');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].rol).toBe('adoptante');

            // Verifica que se filtró correctamente por id_rol
            expect(prisma.usuario.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ id_rol: 1 }),
                })
            );
        });
    });

    // ── 4. PATCH estado → 200 ─────────────────────────────────
    describe('PATCH /api/admin/usuarios/:id/estado', () => {
        it('4. cambia estado a suspendido y devuelve 200', async () => {
            const usuarioTarget = {
                id_usuario: 2,
                correo: 'adoptante@test.com',
                estado_cuenta: 'activo',
                deleted_at: null,
            };
            prisma.usuario.findUnique.mockResolvedValueOnce(usuarioTarget);
            prisma.usuario.update.mockResolvedValueOnce({ ...usuarioTarget, estado_cuenta: 'suspendido' });
            prisma.logAuditoria.create.mockResolvedValueOnce({});

            const res = await request(app)
                .patch('/api/admin/usuarios/2/estado')
                .set('Authorization', 'Bearer mock-token')
                .set('x-test-role', 'administrador')
                .set('x-test-user-id', '1') // admin ID = 1, target ID = 2
                .send({ estado: 'suspendido', motivo: 'Incumplimiento de normas' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.estado).toBe('suspendido');
        });

        it('5. devuelve 400 si el admin intenta modificar su propio estado (self-guard)', async () => {
            const res = await request(app)
                .patch('/api/admin/usuarios/1/estado')
                .set('Authorization', 'Bearer mock-token')
                .set('x-test-role', 'administrador')
                .set('x-test-user-id', '1') // admin ID = 1, target ID = 1 → mismo
                .send({ estado: 'suspendido' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('propio estado');
        });
    });

    // ── 6. DELETE → 200 ──────────────────────────────────────
    describe('DELETE /api/admin/usuarios/:id', () => {
        it('6. realiza soft delete del usuario y devuelve 200', async () => {
            const usuarioTarget = {
                id_usuario: 2,
                correo: 'adoptante@test.com',
                estado_cuenta: 'activo',
                deleted_at: null,
            };
            prisma.usuario.findUnique.mockResolvedValueOnce(usuarioTarget);
            prisma.usuario.update.mockResolvedValueOnce({});
            prisma.logAuditoria.create.mockResolvedValueOnce({});

            const res = await request(app)
                .delete('/api/admin/usuarios/2')
                .set('Authorization', 'Bearer mock-token')
                .set('x-test-role', 'administrador')
                .set('x-test-user-id', '1'); // admin ID = 1, target ID = 2

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verifica soft delete con deleted_at
            expect(prisma.usuario.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id_usuario: 2 },
                    data: expect.objectContaining({ deleted_at: expect.any(Date) }),
                })
            );
        });

        it('7. devuelve 400 si el admin intenta eliminarse a sí mismo (self-guard)', async () => {
            const res = await request(app)
                .delete('/api/admin/usuarios/1')
                .set('Authorization', 'Bearer mock-token')
                .set('x-test-role', 'administrador')
                .set('x-test-user-id', '1'); // admin ID = 1, target ID = 1 → mismo

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('ti mismo');
        });
    });
});
