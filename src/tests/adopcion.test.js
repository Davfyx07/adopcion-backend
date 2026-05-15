// ──────────────────────────────────────────────
// Mock de Prisma (reemplaza instancia real)
// ──────────────────────────────────────────────
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
const request = require('supertest');
const express = require('express');
const adopcionRoutes = require('../routes/adopcionRoutes');
const adopcionService = require('../services/adopcionService');

// Mock middlewares de autenticación
jest.mock('../middlewares/authMiddleware', () => (req, res, next) => {
    req.user = { id: 1, role: 'albergue' };
    next();
});
jest.mock('../middlewares/authorizeRole', () => () => (req, res, next) => next());

const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.socket = { remoteAddress: '127.0.0.1' };
    next();
});
app.use('/api/adopciones', adopcionRoutes);

// ──────────────────────────────────────────────
// Fixtures reutilizables
// ──────────────────────────────────────────────
const mascotaMock = {
    id_mascota: 10,
    id_albergue: 1,
    nombre: 'Firulais',
    estado_adopcion: 'en_proceso',
    albergue: { id_usuario: 1, nombre_albergue: 'Albergue Esperanza' },
};

const matchMock = {
    id_match: 50,
    id_adoptante: 20,
    id_mascota: 10,
    puntaje: 85,
    estado: 'pendiente',
    fecha: new Date('2025-01-10T10:00:00Z'),
};

const adopcionMock = {
    id_adopcion: 1,
    id_mascota: 10,
    id_adoptante: 20,
    fecha: new Date(),
    estado: 'en_proceso',
    observaciones: null,
    fecha_match: matchMock.fecha,
    fecha_contacto: null,
    porcentaje_compatibilidad: 85,
};

// Helper: configura los mocks para un flujo de adopción exitoso
const setupMocksExitoso = ({
    matchesPendientes = [{ id_match: 50, id_adoptante: 20 }, { id_match: 51, id_adoptante: 30 }],
} = {}) => {
    prisma.mascota.findUnique.mockResolvedValueOnce(mascotaMock);
    prisma.match.findFirst.mockResolvedValueOnce(matchMock);
    prisma.adopcion.create.mockResolvedValueOnce(adopcionMock);
    prisma.mascota.update.mockResolvedValueOnce({ ...mascotaMock, estado_adopcion: 'adoptado' });
    prisma.match.findMany.mockResolvedValueOnce(matchesPendientes);
    prisma.match.updateMany.mockResolvedValueOnce({ count: matchesPendientes.length });
    prisma.notificacion.create.mockResolvedValue({});
    prisma.logAuditoria.create.mockResolvedValueOnce({});
};

// ──────────────────────────────────────────────
// Suite principal
// ──────────────────────────────────────────────
describe('HU-AD-01: Registro Automático de Adopción Completada', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ────────────────────────────────────────
    // 1. Registro exitoso
    // ────────────────────────────────────────
    describe('POST /api/adopciones — registro exitoso', () => {
        it('debe registrar la adopción y retornar 201 con los datos creados', async () => {
            setupMocksExitoso();

            const res = await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('Adopción registrada exitosamente');
            expect(res.body.data).toMatchObject({
                id_adopcion: adopcionMock.id_adopcion,
                id_mascota: adopcionMock.id_mascota,
                id_adoptante: adopcionMock.id_adoptante,
                estado: 'en_proceso',
            });
        });

        it('debe ejecutar todo dentro de una transacción ($transaction)', async () => {
            setupMocksExitoso();

            await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        });

        it('debe actualizar el estado de la mascota a "adoptado"', async () => {
            setupMocksExitoso();

            await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(prisma.mascota.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id_mascota: 10 },
                    data: expect.objectContaining({ estado_adopcion: 'adoptado' }),
                })
            );
        });

        it('debe registrar la acción en log_auditoria', async () => {
            setupMocksExitoso();

            await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(prisma.logAuditoria.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        accion: 'REGISTRO_ADOPCION',
                        entidad_afectada: 'Adopcion',
                        id_registro_afectado: adopcionMock.id_adopcion,
                    }),
                })
            );
        });

        it('debe incluir observaciones cuando se proveen', async () => {
            prisma.mascota.findUnique.mockResolvedValueOnce(mascotaMock);
            prisma.match.findFirst.mockResolvedValueOnce(matchMock);
            prisma.adopcion.create.mockResolvedValueOnce({
                ...adopcionMock,
                observaciones: 'Adoptante con experiencia.',
            });
            prisma.mascota.update.mockResolvedValueOnce({});
            prisma.match.findMany.mockResolvedValueOnce([]);
            prisma.match.updateMany.mockResolvedValueOnce({ count: 0 });
            prisma.notificacion.create.mockResolvedValue({});
            prisma.logAuditoria.create.mockResolvedValueOnce({});

            const res = await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20, observaciones: 'Adoptante con experiencia.' });

            expect(res.status).toBe(201);
            expect(prisma.adopcion.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        observaciones: 'Adoptante con experiencia.',
                    }),
                })
            );
        });
    });

    // ────────────────────────────────────────
    // 2. Inmutabilidad del registro
    // ────────────────────────────────────────
    describe('Inmutabilidad del registro de adopción', () => {
        it('el servicio NO debe exportar función de actualización de adopción', () => {
            // La inmutabilidad se garantiza a nivel de BD con un trigger BEFORE UPDATE.
            // A nivel de servicio, verificamos que no se exponga ninguna función
            // que permita modificar un registro de adopción existente.
            const exportados = Object.keys(adopcionService);
            expect(exportados).not.toContain('actualizarAdopcion');
            expect(exportados).not.toContain('updateAdopcion');
            expect(exportados).not.toContain('editarAdopcion');
            expect(exportados).toEqual(['registrarAdopcion']);
        });

        it('si el trigger de BD lanza error al intentar actualizar, la transacción debe rechazarse', async () => {
            // Simula que la BD lanza un error de trigger al intentar crear
            // (en producción el trigger BEFORE UPDATE lo haría en un UPDATE)
            prisma.mascota.findUnique.mockResolvedValueOnce(mascotaMock);
            prisma.match.findFirst.mockResolvedValueOnce(matchMock);
            prisma.adopcion.create.mockRejectedValueOnce(
                new Error('ERROR: No se permite modificar registros de adopción (trigger)')
            );

            const res = await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(res.status).toBe(500);
            expect(res.body.success).toBe(false);
        });
    });

    // ────────────────────────────────────────
    // 3. Cancelación de matches pendientes
    // ────────────────────────────────────────
    describe('Cancelación de matches pendientes', () => {
        it('debe cancelar todos los matches pendientes de la mascota', async () => {
            const matchesPendientes = [
                { id_match: 50, id_adoptante: 20 },
                { id_match: 51, id_adoptante: 30 },
                { id_match: 52, id_adoptante: 40 },
            ];
            setupMocksExitoso({ matchesPendientes });

            await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(prisma.match.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        id_mascota: 10,
                        estado: 'pendiente',
                    }),
                    data: { estado: 'cancelado' },
                })
            );
        });

        it('debe retornar la cantidad de matches cancelados en la respuesta', async () => {
            const matchesPendientes = [
                { id_match: 50, id_adoptante: 20 },
                { id_match: 51, id_adoptante: 30 },
            ];
            setupMocksExitoso({ matchesPendientes });

            const res = await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(res.status).toBe(201);
            expect(res.body.data.matches_cancelados).toBe(2);
        });

        it('debe funcionar correctamente cuando no hay otros matches pendientes', async () => {
            // Solo el match del adoptante seleccionado
            setupMocksExitoso({ matchesPendientes: [{ id_match: 50, id_adoptante: 20 }] });

            const res = await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(res.status).toBe(201);
            expect(res.body.data.matches_cancelados).toBe(1);
            // updateMany igual se llama para cancelar el match del adoptante seleccionado
            expect(prisma.match.updateMany).toHaveBeenCalled();
        });

        it('no debe llamar updateMany si no hay matches pendientes', async () => {
            setupMocksExitoso({ matchesPendientes: [] });

            await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(prisma.match.updateMany).not.toHaveBeenCalled();
        });
    });

    // ────────────────────────────────────────
    // 4. Envío de notificaciones
    // ────────────────────────────────────────
    describe('Envío de notificaciones', () => {
        it('debe enviar notificación de adopcion_confirmada al adoptante seleccionado', async () => {
            setupMocksExitoso({
                matchesPendientes: [{ id_match: 50, id_adoptante: 20 }],
            });

            await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(prisma.notificacion.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        id_usuario: 20,
                        tipo_notificacion: 'adopcion_confirmada',
                        recurso_tipo: 'adopcion',
                        recurso_id: adopcionMock.id_adopcion,
                    }),
                })
            );
        });

        it('debe enviar notificación de mascota_adoptada a adoptantes no seleccionados', async () => {
            const matchesPendientes = [
                { id_match: 50, id_adoptante: 20 }, // seleccionado
                { id_match: 51, id_adoptante: 30 }, // no seleccionado
                { id_match: 52, id_adoptante: 40 }, // no seleccionado
            ];
            setupMocksExitoso({ matchesPendientes });

            await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            // 1 notificación al seleccionado + 2 a los no seleccionados = 3 total
            expect(prisma.notificacion.create).toHaveBeenCalledTimes(3);

            // Verificar notificaciones a no seleccionados
            expect(prisma.notificacion.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        id_usuario: 30,
                        tipo_notificacion: 'mascota_adoptada',
                        recurso_tipo: 'mascota',
                        recurso_id: 10,
                    }),
                })
            );
            expect(prisma.notificacion.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        id_usuario: 40,
                        tipo_notificacion: 'mascota_adoptada',
                    }),
                })
            );
        });

        it('solo debe enviar 1 notificación si no hay otros adoptantes con match', async () => {
            setupMocksExitoso({ matchesPendientes: [{ id_match: 50, id_adoptante: 20 }] });

            await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(prisma.notificacion.create).toHaveBeenCalledTimes(1);
        });
    });

    // ────────────────────────────────────────
    // 5. Validación de pertenencia de mascota
    // ────────────────────────────────────────
    describe('Validación de pertenencia de mascota al albergue', () => {
        it('debe retornar 403 si el albergue no es dueño de la mascota', async () => {
            // La mascota pertenece al albergue 99, pero req.user.id = 1
            prisma.mascota.findUnique.mockResolvedValueOnce({
                ...mascotaMock,
                id_albergue: 99,
                albergue: { id_usuario: 99, nombre_albergue: 'Otro Albergue' },
            });

            const res = await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('No tienes permiso');
        });

        it('debe retornar 404 si la mascota no existe', async () => {
            prisma.mascota.findUnique.mockResolvedValueOnce(null);

            const res = await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 999, id_adoptante: 20 });

            expect(res.status).toBe(404);
            expect(res.body.message).toContain('Mascota no encontrada');
        });

        it('debe retornar 400 si la mascota ya fue adoptada', async () => {
            prisma.mascota.findUnique.mockResolvedValueOnce({
                ...mascotaMock,
                estado_adopcion: 'adoptado',
            });

            const res = await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('ya fue adoptada');
        });
    });

    // ────────────────────────────────────────
    // 6. Validación de existencia de match previo
    // ────────────────────────────────────────
    describe('Validación de existencia de match previo', () => {
        it('debe retornar 400 si no existe match pendiente entre mascota y adoptante', async () => {
            prisma.mascota.findUnique.mockResolvedValueOnce(mascotaMock);
            prisma.match.findFirst.mockResolvedValueOnce(null); // sin match

            const res = await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('No existe un match pendiente');
        });

        it('debe buscar el match con estado "pendiente" específicamente', async () => {
            prisma.mascota.findUnique.mockResolvedValueOnce(mascotaMock);
            prisma.match.findFirst.mockResolvedValueOnce(null);

            await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(prisma.match.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        id_mascota: 10,
                        id_adoptante: 20,
                        estado: 'pendiente',
                    }),
                })
            );
        });

        it('debe usar el puntaje del match como porcentaje_compatibilidad en la adopción', async () => {
            const matchConPuntaje = { ...matchMock, puntaje: 92 };
            prisma.mascota.findUnique.mockResolvedValueOnce(mascotaMock);
            prisma.match.findFirst.mockResolvedValueOnce(matchConPuntaje);
            prisma.adopcion.create.mockResolvedValueOnce({
                ...adopcionMock,
                porcentaje_compatibilidad: 92,
            });
            prisma.mascota.update.mockResolvedValueOnce({});
            prisma.match.findMany.mockResolvedValueOnce([]);
            prisma.match.updateMany.mockResolvedValueOnce({ count: 0 });
            prisma.notificacion.create.mockResolvedValue({});
            prisma.logAuditoria.create.mockResolvedValueOnce({});

            await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10, id_adoptante: 20 });

            expect(prisma.adopcion.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        porcentaje_compatibilidad: 92,
                    }),
                })
            );
        });
    });

    // ────────────────────────────────────────
    // 7. Validación de campos del request
    // ────────────────────────────────────────
    describe('Validación de campos del request', () => {
        it('debe retornar 400 si falta id_mascota', async () => {
            const res = await request(app)
                .post('/api/adopciones')
                .send({ id_adoptante: 20 });

            expect(res.status).toBe(400);
            expect(res.body.errors[0].field).toBe('id_mascota');
        });

        it('debe retornar 400 si falta id_adoptante', async () => {
            const res = await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: 10 });

            expect(res.status).toBe(400);
            expect(res.body.errors[0].field).toBe('id_adoptante');
        });

        it('debe retornar 400 si id_mascota no es un entero positivo', async () => {
            const res = await request(app)
                .post('/api/adopciones')
                .send({ id_mascota: -5, id_adoptante: 20 });

            expect(res.status).toBe(400);
            expect(res.body.errors[0].field).toBe('id_mascota');
        });
    });
});
