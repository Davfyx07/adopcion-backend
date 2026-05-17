// ──────────────────────────────────────────────
// Mock de Prisma
// ──────────────────────────────────────────────
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
const request = require('supertest');
const express = require('express');
const albergueRoutes = require('../routes/albergueRoutes');
const adopcionRoutes = require('../routes/adopcionRoutes');

// Mock middlewares
jest.mock('../middlewares/authMiddleware', () => (req, res, next) => {
    req.user = { id: 1, role: 'albergue' };
    next();
});
jest.mock('../middlewares/authorizeRole', () => () => (req, res, next) => next());
jest.mock('../middlewares/albergueValidation', () => ({
    validateCreatePerfil: (req, res, next) => next(),
    validateUpdatePerfil: (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/albergue', albergueRoutes);
app.use('/api/adopciones', adopcionRoutes);

const mockAdopcion = {
    id_adopcion: 1,
    id_mascota: 10,
    id_adoptante: 20,
    fecha: new Date('2025-01-15T10:00:00Z'),
    estado: 'en_proceso',
    porcentaje_compatibilidad: 90,
    mascota: { id_albergue: 1, nombre: 'Firulais' },
    adoptante: { nombre_completo: 'Juan Perez', usuario: { correo: 'juan@test.com' } }
};

describe('HU: Historial de Adopciones', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/albergue/adopciones (Lista y Filtros)', () => {
        it('debe listar adopciones del albergue con paginación por defecto', async () => {
            prisma.adopcion.count.mockResolvedValueOnce(1);
            prisma.adopcion.findMany.mockResolvedValueOnce([mockAdopcion]);

            const res = await request(app).get('/api/albergue/adopciones');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0]).toMatchObject({
                id_adopcion: 1,
                nombre_mascota: 'Firulais',
                nombre_adoptante: 'Juan Perez'
            });
            expect(prisma.adopcion.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ mascota: { id_albergue: 1 } }),
                    take: 20,
                    skip: 0,
                    orderBy: { fecha: 'desc' }
                })
            );
        });

        it('debe aplicar filtros por fecha y estado', async () => {
            prisma.adopcion.count.mockResolvedValueOnce(0);
            prisma.adopcion.findMany.mockResolvedValueOnce([]);

            await request(app).get('/api/albergue/adopciones?fecha_desde=2025-01-01&fecha_hasta=2025-01-31&estado=completado');

            expect(prisma.adopcion.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        mascota: { id_albergue: 1 },
                        estado: 'completado',
                        fecha: {
                            gte: new Date('2025-01-01'),
                            lte: new Date('2025-01-31')
                        }
                    })
                })
            );
        });

        it('debe permitir buscar por nombre de mascota o adoptante', async () => {
            prisma.adopcion.count.mockResolvedValueOnce(0);
            prisma.adopcion.findMany.mockResolvedValueOnce([]);

            await request(app).get('/api/albergue/adopciones?busqueda=firulais');

            expect(prisma.adopcion.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        OR: [
                            { mascota: { nombre: { contains: 'firulais', mode: 'insensitive' } } },
                            { adoptante: { nombre_completo: { contains: 'firulais', mode: 'insensitive' } } }
                        ]
                    })
                })
            );
        });
    });

    describe('GET /api/adopciones/:id (Detalle)', () => {
        it('debe retornar el detalle si el albergue es dueño', async () => {
            prisma.adopcion.findUnique.mockResolvedValueOnce(mockAdopcion);

            const res = await request(app).get('/api/adopciones/1');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.id_adopcion).toBe(1);
        });

        it('debe retornar 403 si el albergue no es dueño de la mascota adoptada', async () => {
            prisma.adopcion.findUnique.mockResolvedValueOnce({
                ...mockAdopcion,
                mascota: { id_albergue: 99, nombre: 'Ajena' }
            });

            const res = await request(app).get('/api/adopciones/1');

            expect(res.status).toBe(403);
            expect(res.body.message).toContain('No tienes permiso');
        });

        it('debe retornar 404 si la adopción no existe', async () => {
            prisma.adopcion.findUnique.mockResolvedValueOnce(null);

            const res = await request(app).get('/api/adopciones/999');

            expect(res.status).toBe(404);
            expect(res.body.message).toContain('Adopción no encontrada');
        });
    });

    describe('GET /api/albergue/adopciones/exportar (Exportación)', () => {
        it('debe exportar en CSV por defecto', async () => {
            prisma.adopcion.findMany.mockResolvedValueOnce([mockAdopcion]);

            const res = await request(app).get('/api/albergue/adopciones/exportar');

            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('text/csv');
            expect(res.headers['content-disposition']).toContain('attachment; filename=adopciones.csv');
            expect(res.text).toContain('Firulais');
            expect(res.text).toContain('Juan Perez');
        });

        it('debe exportar en Excel si se solicita format=excel', async () => {
            prisma.adopcion.findMany.mockResolvedValueOnce([mockAdopcion]);

            const res = await request(app).get('/api/albergue/adopciones/exportar?format=excel');

            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            expect(res.headers['content-disposition']).toContain('attachment; filename=adopciones.xlsx');
        });
    });
});
