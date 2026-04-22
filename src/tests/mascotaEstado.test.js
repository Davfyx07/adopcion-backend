// Mock de la base de datos
jest.mock('../config/db', () => ({
    connect: jest.fn(),
    query: jest.fn()
}));

const pool = require('../config/db');
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
app.use('/api/pets', mascotaRoutes);

describe('Módulo de Mascota - Cambio de Estado (HU-MA-03)', () => {
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();
        mockClient = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn()
        };
        pool.connect.mockResolvedValue(mockClient);
    });

    describe('PATCH /api/pets/:id/estado', () => {
        const idMascota = '123e4567-e89b-12d3-a456-426614174000'; // UUID válido para no fallar en otras capas si las hubiera

        it('debe cambiar el estado exitosamente (disponible -> en_proceso)', async () => {
            // Mock DB: BEGIN -> SELECT mascota -> UPDATE mascota -> INSERT auditoria -> COMMIT
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ // SELECT mascota
                    rows: [{ id_mascota: idMascota, id_albergue: 1, estado_adopcion: 'disponible', nombre: 'Firulais' }] 
                })
                .mockResolvedValueOnce({}) // UPDATE mascota
                .mockResolvedValueOnce({}) // INSERT auditoria
                .mockResolvedValueOnce({}); // COMMIT

            const res = await request(app)
                .patch(`/api/pets/${idMascota}/estado`)
                .send({ estado: 'en_proceso' });

            expect(res.status).toBe(200);
            expect(res.body.message).toContain('Estado de la mascota actualizado');
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE Mascota SET estado_adopcion = $1'), ['en_proceso', idMascota]);
        });

        it('debe requerir motivo si se cambia a oculto', async () => {
            const res = await request(app)
                .patch(`/api/pets/${idMascota}/estado`)
                .send({ estado: 'oculto' });

            expect(res.status).toBe(400);
            expect(res.body.errors[0].field).toBe('motivo');
        });

        it('debe fallar si la transición no está permitida', async () => {
            // adoptado -> disponible no está permitido
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ // SELECT mascota
                    rows: [{ id_mascota: idMascota, id_albergue: 1, estado_adopcion: 'adoptado', nombre: 'Firulais' }] 
                });

            const res = await request(app)
                .patch(`/api/pets/${idMascota}/estado`)
                .send({ estado: 'disponible' });

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('Transición de estado no permitida');
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('ROLLBACK'));
        });

        it('debe cancelar matches y enviar notificaciones al cambiar a adoptado', async () => {
            // Mock DB: BEGIN -> SELECT mascota -> UPDATE mascota -> SELECT matches -> UPDATE matches -> INSERT notificacion -> INSERT auditoria -> COMMIT
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ // SELECT mascota
                    rows: [{ id_mascota: idMascota, id_albergue: 1, estado_adopcion: 'en_proceso', nombre: 'Firulais' }] 
                })
                .mockResolvedValueOnce({}) // UPDATE mascota
                .mockResolvedValueOnce({ // SELECT matches
                    rows: [{ id_match: 10, id_adoptante: 100 }]
                })
                .mockResolvedValueOnce({}) // UPDATE matches (cancelados)
                .mockResolvedValueOnce({}) // INSERT notificacion
                .mockResolvedValueOnce({}) // INSERT auditoria
                .mockResolvedValueOnce({}); // COMMIT

            const res = await request(app)
                .patch(`/api/pets/${idMascota}/estado`)
                .send({ estado: 'adoptado' });

            expect(res.status).toBe(200);
            expect(res.body.message).toContain('Estado de la mascota actualizado');
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE Match_Adopcion SET estado = \'cancelado\''), [idMascota]);
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO Notificacion'), expect.any(Array));
        });

        it('debe retornar 404 si el albergue no es el dueño', async () => {
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ // SELECT mascota con id_albergue diferente
                    rows: [{ id_mascota: idMascota, id_albergue: 999, estado_adopcion: 'disponible', nombre: 'Firulais' }] 
                });

            const res = await request(app)
                .patch(`/api/pets/${idMascota}/estado`)
                .send({ estado: 'en_proceso' });

            expect(res.status).toBe(404);
            expect(res.body.message).toContain('No tienes permiso');
        });
    });
});
