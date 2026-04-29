// ──────────────────────────────────────────────
// Mock de Prisma (reemplaza pg Pool)
// ──────────────────────────────────────────────
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
const request = require('supertest');
const express = require('express');
const mascotaRoutes = require('../routes/mascotaRoutes');

// Mock middlewares para evitar problemas de autenticación en unit tests puros
jest.mock('../middlewares/authMiddleware', () => (req, res, next) => {
    req.user = { id: 1, role: 'Albergue' };
    next();
});
jest.mock('../middlewares/authorizeRole', () => () => (req, res, next) => next());

const app = express();
app.use(express.json());
// Evitar error de req.socket.remoteAddress
app.use((req, res, next) => {
    req.socket = { remoteAddress: '127.0.0.1' };
    next();
});
app.use('/api/mascotas', mascotaRoutes);

describe('Módulo de Mascota - Cambio de Estado (HU-MA-03)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('PATCH /api/mascotas/:id/estado', () => {
        const idMascota = '123e4567-e89b-12d3-a456-426614174000';

        it('debe cambiar el estado exitosamente (disponible -> en_proceso)', async () => {
            // ── Prisma calls dentro de $transaction ──
            // 1. $queryRaw FOR UPDATE → mascota
            // 2. mascota.update → OK
            // 3. log_auditoria.create → OK
            prisma.$queryRaw.mockResolvedValueOnce([{
                id_mascota: idMascota,
                id_albergue: 1,
                estado_adopcion: 'disponible',
                nombre: 'Firulais'
            }]);
            prisma.mascota.update.mockResolvedValueOnce({});
            prisma.log_auditoria.create.mockResolvedValueOnce({});

            const res = await request(app)
                .patch(`/api/mascotas/${idMascota}/estado`)
                .send({ estado: 'en_proceso' });

            expect(res.status).toBe(200);
            expect(res.body.message).toContain('Estado de la mascota actualizado');
            expect(prisma.mascota.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        estado_adopcion: 'en_proceso'
                    })
                })
            );
        });

        it('debe requerir motivo si se cambia a oculto', async () => {
            const res = await request(app)
                .patch(`/api/mascotas/${idMascota}/estado`)
                .send({ estado: 'oculto' });

            expect(res.status).toBe(400);
            expect(res.body.errors[0].field).toBe('motivo');
        });

        it('debe fallar si la transición no está permitida', async () => {
            // $queryRaw devuelve mascota con estado 'adoptado'
            prisma.$queryRaw.mockResolvedValueOnce([{
                id_mascota: idMascota,
                id_albergue: 1,
                estado_adopcion: 'adoptado',
                nombre: 'Firulais'
            }]);

            const res = await request(app)
                .patch(`/api/mascotas/${idMascota}/estado`)
                .send({ estado: 'disponible' });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('Transición de estado no permitida');
        });

        it('debe consultar matches y enviar notificaciones al cambiar a adoptado', async () => {
            // ── Prisma calls dentro de $transaction ──
            // 1. $queryRaw FOR UPDATE → mascota
            // 2. mascota.update → OK
            // 3. match.findMany → [{ id_adoptante: 100 }]
            // 4. notificacion.create → OK (por cada match)
            // 5. log_auditoria.create → OK
            prisma.$queryRaw.mockResolvedValueOnce([{
                id_mascota: idMascota,
                id_albergue: 1,
                estado_adopcion: 'en_proceso',
                nombre: 'Firulais'
            }]);
            prisma.mascota.update.mockResolvedValueOnce({});
            prisma.match.findMany.mockResolvedValueOnce([
                { id_adoptante: 100 }
            ]);
            prisma.notificacion.create.mockResolvedValue({});
            prisma.log_auditoria.create.mockResolvedValueOnce({});

            const res = await request(app)
                .patch(`/api/mascotas/${idMascota}/estado`)
                .send({ estado: 'adoptado' });

            expect(res.status).toBe(200);
            expect(res.body.message).toContain('Estado de la mascota actualizado');
            expect(prisma.match.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ id_mascota: idMascota })
                })
            );
            expect(prisma.notificacion.create).toHaveBeenCalled();
        });

        it('debe retornar 404 si el albergue no es el dueño', async () => {
            // $queryRaw devuelve mascota con id_albergue diferente a req.user.id (1)
            prisma.$queryRaw.mockResolvedValueOnce([{
                id_mascota: idMascota,
                id_albergue: 999,
                estado_adopcion: 'disponible',
                nombre: 'Firulais'
            }]);

            const res = await request(app)
                .patch(`/api/mascotas/${idMascota}/estado`)
                .send({ estado: 'en_proceso' });

            expect(res.status).toBe(404);
            expect(res.body.message).toContain('No tienes permiso');
        });
    });
});
