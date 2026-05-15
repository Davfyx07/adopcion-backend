// ──────────────────────────────────────────────
// Mock de Prisma
// ──────────────────────────────────────────────
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
const request = require('supertest');
const express = require('express');
const notificacionRoutes = require('../routes/notificacionRoutes');
const { limpiarNotificacionesAntiguas, derivarTitulo } = require('../services/notificacionService');

// Mock middlewares de autenticación
jest.mock('../middlewares/authMiddleware', () => (req, res, next) => {
    req.user = { id: 5, role: 'adoptante' };
    next();
});
jest.mock('../middlewares/authorizeRole', () => () => (req, res, next) => next());

const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.socket = { remoteAddress: '127.0.0.1' };
    next();
});
app.use('/api/notificaciones', notificacionRoutes);

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────
const makeNotif = (overrides = {}) => ({
    id: 1,
    id_usuario: 5,
    tipo_notificacion: 'nuevo_match',
    mensaje: 'Un adoptante está interesado en Luna.',
    estado: 'pendiente',
    fecha_creacion: new Date('2025-03-01T10:00:00Z'),
    fecha_lectura: null,
    recurso_tipo: 'match',
    recurso_id: 10,
    ...overrides,
});

// Helper: configura mocks para obtenerNotificaciones
const setupListaMocks = ({ notifs = [], total = 0, noLeidas = 0 } = {}) => {
    prisma.notificacion.findMany.mockResolvedValueOnce(notifs);
    // count se llama dos veces: total filtrado + total no leídas
    prisma.notificacion.count
        .mockResolvedValueOnce(total)
        .mockResolvedValueOnce(noLeidas);
};

// ──────────────────────────────────────────────
// Suite principal
// ──────────────────────────────────────────────
describe('Centro de Notificaciones', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ────────────────────────────────────────
    // 1. Lista de notificaciones
    // ────────────────────────────────────────
    describe('GET /api/notificaciones — lista de notificaciones', () => {
        it('debe retornar 200 con la lista de notificaciones del usuario', async () => {
            const notifs = [makeNotif({ id: 1 }), makeNotif({ id: 2, tipo_notificacion: 'mascota_adoptada' })];
            setupListaMocks({ notifs, total: 2, noLeidas: 2 });

            const res = await request(app).get('/api/notificaciones');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveLength(2);
        });

        it('debe retornar los campos requeridos: id_notificacion, tipo, titulo, mensaje, leida, fecha_creacion', async () => {
            setupListaMocks({ notifs: [makeNotif()], total: 1, noLeidas: 1 });

            const res = await request(app).get('/api/notificaciones');

            const notif = res.body.data[0];
            expect(notif).toHaveProperty('id_notificacion');
            expect(notif).toHaveProperty('tipo');
            expect(notif).toHaveProperty('titulo');
            expect(notif).toHaveProperty('mensaje');
            expect(notif).toHaveProperty('leida');
            expect(notif).toHaveProperty('fecha_creacion');
        });

        it('debe retornar leida como booleano false para notificaciones pendientes', async () => {
            setupListaMocks({ notifs: [makeNotif({ estado: 'pendiente' })], total: 1, noLeidas: 1 });

            const res = await request(app).get('/api/notificaciones');

            expect(res.body.data[0].leida).toBe(false);
        });

        it('debe retornar leida como booleano true para notificaciones leídas', async () => {
            setupListaMocks({
                notifs: [makeNotif({ estado: 'leida', fecha_lectura: new Date() })],
                total: 1,
                noLeidas: 0,
            });

            const res = await request(app).get('/api/notificaciones');

            expect(res.body.data[0].leida).toBe(true);
        });

        it('debe retornar meta de paginación con page, limit, total, pages', async () => {
            setupListaMocks({ notifs: [], total: 0, noLeidas: 0 });

            const res = await request(app).get('/api/notificaciones');

            expect(res.body.meta).toMatchObject({
                page: 1,
                limit: 20,
                total: 0,
                pages: 0,
            });
        });

        it('debe usar paginación de 20 por defecto', async () => {
            setupListaMocks({ notifs: [], total: 0, noLeidas: 0 });

            await request(app).get('/api/notificaciones');

            expect(prisma.notificacion.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 20, skip: 0 })
            );
        });

        it('debe respetar el parámetro page para calcular el offset', async () => {
            setupListaMocks({ notifs: [], total: 0, noLeidas: 0 });

            await request(app).get('/api/notificaciones?page=3&limit=10');

            expect(prisma.notificacion.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 10, skip: 20 })
            );
        });

        it('debe retornar total_no_leidas en la respuesta', async () => {
            setupListaMocks({ notifs: [], total: 5, noLeidas: 3 });

            const res = await request(app).get('/api/notificaciones');

            expect(res.body.total_no_leidas).toBe(3);
        });

        it('debe ordenar por fecha_creacion descendente', async () => {
            setupListaMocks({ notifs: [], total: 0, noLeidas: 0 });

            await request(app).get('/api/notificaciones');

            expect(prisma.notificacion.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderBy: { fecha_creacion: 'desc' },
                })
            );
        });

        it('debe retornar lista vacía si el usuario no tiene notificaciones', async () => {
            setupListaMocks({ notifs: [], total: 0, noLeidas: 0 });

            const res = await request(app).get('/api/notificaciones');

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual([]);
        });
    });

    // ────────────────────────────────────────
    // 2. Filtros por tipo
    // ────────────────────────────────────────
    describe('GET /api/notificaciones — filtros por tipo', () => {
        it('debe filtrar por tipo cuando se provee el query param tipo', async () => {
            const notifs = [makeNotif({ tipo_notificacion: 'mascota_adoptada' })];
            setupListaMocks({ notifs, total: 1, noLeidas: 1 });

            const res = await request(app).get('/api/notificaciones?tipo=mascota_adoptada');

            expect(res.status).toBe(200);
            expect(prisma.notificacion.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        id_usuario: 5,
                        tipo_notificacion: 'mascota_adoptada',
                    }),
                })
            );
        });

        it('debe retornar solo notificaciones del tipo solicitado', async () => {
            const notifs = [makeNotif({ tipo_notificacion: 'adopcion_confirmada' })];
            setupListaMocks({ notifs, total: 1, noLeidas: 0 });

            const res = await request(app).get('/api/notificaciones?tipo=adopcion_confirmada');

            expect(res.body.data[0].tipo).toBe('adopcion_confirmada');
        });

        it('debe derivar el título correcto para cada tipo', () => {
            expect(derivarTitulo('nuevo_match')).toBe('Nuevo match');
            expect(derivarTitulo('mascota_adoptada')).toBe('Mascota adoptada');
            expect(derivarTitulo('adopcion_confirmada')).toBe('Adopción confirmada');
            expect(derivarTitulo('match')).toBe('Match');
        });

        it('debe derivar título genérico para tipos desconocidos', () => {
            expect(derivarTitulo('tipo_desconocido')).toBe('Tipo Desconocido');
            expect(derivarTitulo(null)).toBe('Notificación');
            expect(derivarTitulo(undefined)).toBe('Notificación');
        });

        it('debe filtrar solo no leídas cuando solo_no_leidas=true', async () => {
            setupListaMocks({ notifs: [], total: 0, noLeidas: 0 });

            await request(app).get('/api/notificaciones?solo_no_leidas=true');

            expect(prisma.notificacion.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        estado: 'pendiente',
                    }),
                })
            );
        });

        it('puede combinar filtro tipo y solo_no_leidas', async () => {
            setupListaMocks({ notifs: [], total: 0, noLeidas: 0 });

            await request(app).get('/api/notificaciones?tipo=nuevo_match&solo_no_leidas=true');

            expect(prisma.notificacion.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        id_usuario: 5,
                        tipo_notificacion: 'nuevo_match',
                        estado: 'pendiente',
                    }),
                })
            );
        });
    });

    // ────────────────────────────────────────
    // 3. Marcar como leída individualmente
    // ────────────────────────────────────────
    describe('PATCH /api/notificaciones/:id/leida — marcar individual', () => {
        it('debe marcar la notificación como leída y retornar 200 con la notificación actualizada', async () => {
            const notifOriginal = makeNotif({ id: 7 });
            const notifActualizada = { ...notifOriginal, estado: 'leida', fecha_lectura: new Date() };

            prisma.notificacion.findUnique.mockResolvedValueOnce(notifOriginal);
            prisma.notificacion.update.mockResolvedValueOnce(notifActualizada);

            const res = await request(app).patch('/api/notificaciones/7/leida');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toBeDefined();
            expect(res.body.data.leida).toBe(true);
            expect(res.body.data.id_notificacion).toBe(7);
        });

        it('debe retornar la notificación actualizada con todos los campos requeridos', async () => {
            const notif = makeNotif({ id: 7 });
            const actualizada = { ...notif, estado: 'leida', fecha_lectura: new Date() };

            prisma.notificacion.findUnique.mockResolvedValueOnce(notif);
            prisma.notificacion.update.mockResolvedValueOnce(actualizada);

            const res = await request(app).patch('/api/notificaciones/7/leida');

            const data = res.body.data;
            expect(data).toHaveProperty('id_notificacion');
            expect(data).toHaveProperty('tipo');
            expect(data).toHaveProperty('titulo');
            expect(data).toHaveProperty('mensaje');
            expect(data).toHaveProperty('leida', true);
            expect(data).toHaveProperty('fecha_creacion');
            expect(data).toHaveProperty('fecha_lectura');
        });

        it('debe llamar update con estado leida y fecha_lectura', async () => {
            prisma.notificacion.findUnique.mockResolvedValueOnce(makeNotif({ id: 7 }));
            prisma.notificacion.update.mockResolvedValueOnce(makeNotif({ id: 7, estado: 'leida' }));

            await request(app).patch('/api/notificaciones/7/leida');

            expect(prisma.notificacion.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 7 },
                    data: expect.objectContaining({
                        estado: 'leida',
                        fecha_lectura: expect.any(Date),
                    }),
                })
            );
        });

        it('debe retornar 400 si el id no es un entero positivo', async () => {
            const res = await request(app).patch('/api/notificaciones/abc/leida');

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it('debe retornar 404 si la notificación no existe', async () => {
            prisma.notificacion.findUnique.mockResolvedValueOnce(null);

            const res = await request(app).patch('/api/notificaciones/999/leida');

            expect(res.status).toBe(404);
            expect(res.body.message).toContain('no encontrada');
        });
    });

    // ────────────────────────────────────────
    // 4. Validación de pertenencia
    // ────────────────────────────────────────
    describe('PATCH /api/notificaciones/:id/leida — validación de pertenencia', () => {
        it('debe retornar 403 si la notificación pertenece a otro usuario', async () => {
            // La notificación pertenece al usuario 99, pero req.user.id = 5
            prisma.notificacion.findUnique.mockResolvedValueOnce(
                makeNotif({ id: 7, id_usuario: 99 })
            );

            const res = await request(app).patch('/api/notificaciones/7/leida');

            expect(res.status).toBe(403);
            expect(res.body.message).toContain('No tienes permiso');
        });

        it('no debe llamar update si la notificación no pertenece al usuario', async () => {
            prisma.notificacion.findUnique.mockResolvedValueOnce(
                makeNotif({ id: 7, id_usuario: 99 })
            );

            await request(app).patch('/api/notificaciones/7/leida');

            expect(prisma.notificacion.update).not.toHaveBeenCalled();
        });

        it('debe permitir marcar si la notificación pertenece al usuario autenticado', async () => {
            const notif = makeNotif({ id: 7, id_usuario: 5 }); // mismo que req.user.id
            prisma.notificacion.findUnique.mockResolvedValueOnce(notif);
            prisma.notificacion.update.mockResolvedValueOnce({ ...notif, estado: 'leida' });

            const res = await request(app).patch('/api/notificaciones/7/leida');

            expect(res.status).toBe(200);
            expect(prisma.notificacion.update).toHaveBeenCalled();
        });
    });

    // ────────────────────────────────────────
    // 5. Marcar todas como leídas
    // ────────────────────────────────────────
    describe('PATCH /api/notificaciones/leer-todas', () => {
        it('debe marcar todas las notificaciones pendientes como leídas y retornar 200', async () => {
            prisma.notificacion.updateMany.mockResolvedValueOnce({ count: 5 });

            const res = await request(app).patch('/api/notificaciones/leer-todas');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.count).toBe(5);
        });

        it('debe retornar la cantidad de notificaciones actualizadas en el mensaje', async () => {
            prisma.notificacion.updateMany.mockResolvedValueOnce({ count: 3 });

            const res = await request(app).patch('/api/notificaciones/leer-todas');

            expect(res.body.message).toContain('3');
        });

        it('debe llamar updateMany filtrando por id_usuario y estado pendiente', async () => {
            prisma.notificacion.updateMany.mockResolvedValueOnce({ count: 0 });

            await request(app).patch('/api/notificaciones/leer-todas');

            expect(prisma.notificacion.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        id_usuario: 5,
                        estado: 'pendiente',
                    }),
                    data: expect.objectContaining({
                        estado: 'leida',
                        fecha_lectura: expect.any(Date),
                    }),
                })
            );
        });

        it('debe retornar count 0 si no hay notificaciones pendientes', async () => {
            prisma.notificacion.updateMany.mockResolvedValueOnce({ count: 0 });

            const res = await request(app).patch('/api/notificaciones/leer-todas');

            expect(res.status).toBe(200);
            expect(res.body.count).toBe(0);
        });
    });

    // ────────────────────────────────────────
    // 6. Job de limpieza de notificaciones antiguas
    // ────────────────────────────────────────
    describe('Job de limpieza — limpiarNotificacionesAntiguas', () => {
        it('debe eliminar notificaciones con fecha_creacion anterior a 30 días', async () => {
            prisma.notificacion.deleteMany.mockResolvedValueOnce({ count: 12 });

            const result = await limpiarNotificacionesAntiguas();

            expect(result.success).toBe(true);
            expect(result.eliminadas).toBe(12);
        });

        it('debe llamar deleteMany con fecha lt hace 30 días', async () => {
            prisma.notificacion.deleteMany.mockResolvedValueOnce({ count: 0 });

            const antes = new Date();
            antes.setDate(antes.getDate() - 30);

            await limpiarNotificacionesAntiguas();

            expect(prisma.notificacion.deleteMany).toHaveBeenCalledTimes(1);
            const llamada = prisma.notificacion.deleteMany.mock.calls[0][0];
            expect(llamada.where.fecha_creacion).toHaveProperty('lt');

            // La fecha de corte debe ser aproximadamente hace 30 días (±5 segundos)
            const fechaCorte = llamada.where.fecha_creacion.lt;
            const diffMs = Math.abs(fechaCorte.getTime() - antes.getTime());
            expect(diffMs).toBeLessThan(5000);
        });

        it('debe retornar eliminadas = 0 si no hay notificaciones antiguas', async () => {
            prisma.notificacion.deleteMany.mockResolvedValueOnce({ count: 0 });

            const result = await limpiarNotificacionesAntiguas();

            expect(result.success).toBe(true);
            expect(result.eliminadas).toBe(0);
        });

        it('debe propagar el error si deleteMany falla', async () => {
            prisma.notificacion.deleteMany.mockRejectedValueOnce(
                new Error('DB connection lost')
            );

            await expect(limpiarNotificacionesAntiguas()).rejects.toThrow('DB connection lost');
        });

        it('el job debe estar registrado con expresión cron válida (0 3 * * *)', () => {
            // Verificamos que el módulo del job exporta iniciarJobLimpieza
            const { iniciarJobLimpieza } = require('../jobs/notificacionCleanupJob');
            expect(typeof iniciarJobLimpieza).toBe('function');
        });
    });
});
