/**
 * Tests para Tag CRUD admin — HU-ADM-02
 *
 * Cubre:
 *   GET  /api/admin/etiquetas  → 200 (admin), 403 (albergue), 401 (sin token)
 *   POST /api/admin/etiquetas  → 201 (válido), 400 (sin nombre)
 *   PUT  /api/admin/etiquetas/:id → 200
 *   DELETE /api/admin/etiquetas/:id → 200 (soft delete)
 *
 * Nota: tagRoutes.js usa authorizeRole(['admin']) en develop.
 * Los tests usan el rol 'admin' para coincidir con el código actual.
 * (La corrección a 'administrador' vive en feature/fix-auth-flow)
 */

// ── Mock de Prisma ────────────────────────────────────────────
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');

// ── authMiddleware controlable por test vía header ────────────
jest.mock('../middlewares/authMiddleware', () => (req, res, next) => {
    const role = req.headers['x-test-role'] || 'admin';
    if (role === 'none') {
        return res.status(401).json({ success: false, message: 'Token requerido o formato inválido.' });
    }
    req.user = { id: 'test-user-uuid', role };
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
const tagRoutes = require('../routes/tagRoutes');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.socket = { remoteAddress: '127.0.0.1' };
    next();
});
app.use('/api', tagRoutes);

describe('Tag CRUD Admin (HU-ADM-02)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ── GET /api/admin/etiquetas ──────────────────────────────
    describe('GET /api/admin/etiquetas', () => {
        it('1. devuelve 200 con array cuando el rol es admin', async () => {
            const tags = [
                { id_tag: 1, nombre_tag: 'Especie', opcion_tag: [] },
                { id_tag: 2, nombre_tag: 'Tamaño', opcion_tag: [] },
            ];
            prisma.tag.findMany.mockResolvedValueOnce(tags);

            const res = await request(app)
                .get('/api/admin/etiquetas')
                .set('Authorization', 'Bearer mock-token')
                .set('x-test-role', 'admin');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data).toHaveLength(2);
        });

        it('2. devuelve 403 cuando el rol es albergue', async () => {
            const res = await request(app)
                .get('/api/admin/etiquetas')
                .set('Authorization', 'Bearer mock-token')
                .set('x-test-role', 'albergue');

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('permisos');
        });

        it('3. devuelve 401 si no hay token', async () => {
            const res = await request(app)
                .get('/api/admin/etiquetas')
                .set('Authorization', 'Bearer mock-token')
                .set('x-test-role', 'none');

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });
    });

    // ── POST /api/admin/etiquetas ─────────────────────────────
    describe('POST /api/admin/etiquetas', () => {
        const tagValido = {
            nombre_tag: 'Raza',
            peso_matching: 0.8,
            categoria: 'Características',
            es_filtro_absoluto: false,
        };

        it('4. crea el tag correctamente y devuelve 201', async () => {
            const tagCreado = { id_tag: 10, ...tagValido, estado: 'activo' };
            prisma.tag.findFirst.mockResolvedValueOnce(null); // no duplicado
            prisma.tag.create.mockResolvedValueOnce(tagCreado);
            prisma.logAuditoria.create.mockResolvedValueOnce({});

            const res = await request(app)
                .post('/api/admin/etiquetas')
                .set('Authorization', 'Bearer mock-token')
                .set('x-test-role', 'admin')
                .send(tagValido);

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.nombre_tag).toBe('Raza');
        });

        it('5. devuelve 400 si falta nombre_tag', async () => {
            const res = await request(app)
                .post('/api/admin/etiquetas')
                .set('Authorization', 'Bearer mock-token')
                .set('x-test-role', 'admin')
                .send({ peso_matching: 0.5 }); // sin nombre_tag

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });

    // ── PUT /api/admin/etiquetas/:id ──────────────────────────
    describe('PUT /api/admin/etiquetas/:id', () => {
        it('6. actualiza el tag y devuelve 200', async () => {
            const tagExistente = { id_tag: 1, nombre_tag: 'Especie', peso_matching: 0.5, estado: 'activo' };
            const tagActualizado = { ...tagExistente, nombre_tag: 'Especie Animal' };

            prisma.tag.findUnique.mockResolvedValueOnce(tagExistente);
            prisma.tag.findFirst.mockResolvedValueOnce(null);
            prisma.tag.update.mockResolvedValueOnce(tagActualizado);
            prisma.logAuditoria.create.mockResolvedValueOnce({});

            const res = await request(app)
                .put('/api/admin/etiquetas/1')
                .set('Authorization', 'Bearer mock-token')
                .set('x-test-role', 'admin')
                .send({ nombre_tag: 'Especie Animal', peso_matching: 0.5 });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.nombre_tag).toBe('Especie Animal');
        });
    });

    // ── DELETE /api/admin/etiquetas/:id ───────────────────────
    describe('DELETE /api/admin/etiquetas/:id', () => {
        it('7. realiza soft delete del tag (estado → inactivo) y devuelve 200', async () => {
            const tagExistente = { id_tag: 5, nombre_tag: 'Color', estado: 'activo' };

            prisma.tag.findUnique.mockResolvedValueOnce(tagExistente);
            prisma.tag.update.mockResolvedValueOnce({ ...tagExistente, estado: 'inactivo' });
            prisma.logAuditoria.create.mockResolvedValueOnce({});

            const res = await request(app)
                .delete('/api/admin/etiquetas/5')
                .set('Authorization', 'Bearer mock-token')
                .set('x-test-role', 'admin');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verifica que se hizo soft delete (estado inactivo, no eliminación de fila)
            expect(prisma.tag.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id_tag: 5 },
                data: expect.objectContaining({ estado: 'inactivo' }),
            }));
        });
    });
});
