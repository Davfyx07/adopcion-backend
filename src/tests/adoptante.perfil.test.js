jest.mock('../config/db', () => ({
    connect: jest.fn(),
    query: jest.fn()
}));

jest.mock('../services/storageService', () => ({
    uploadImage: jest.fn(),
    validateBase64Image: jest.fn(),
    deleteImage: jest.fn()
}));

jest.mock('../services/etiquetaService', () => ({
    validarTagsObligatorios: jest.fn()
}));

jest.mock('../middlewares/authMiddleware', () => (req, res, next) => {
    req.user = { id: '550e8400-e29b-41d4-a716-446655440000', role: 'adoptante' };
    req.socket = { remoteAddress: '127.0.0.1' };
    next();
});
jest.mock('../middlewares/authorizeRole', () => () => (req, res, next) => next());

const pool = require('../config/db');
const request = require('supertest');
const express = require('express');
const { validarTagsObligatorios } = require('../services/etiquetaService');
const { uploadImage, validateBase64Image } = require('../services/storageService');
const adoptanteRoutes = require('../routes/adoptanteRoutes');

const app = express();
app.use(express.json());
app.use('/api/adoptante', adoptanteRoutes);

describe('HU-US-01 - Creación de Perfil Adoptante', () => {
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();
        mockClient = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn()
        };
        pool.connect.mockResolvedValue(mockClient);
    });

    describe('POST /api/adoptante/perfil', () => {
        const tagIds = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'];

        it('debe crear el perfil exitosamente con tags y foto', async () => {
            validarTagsObligatorios.mockResolvedValue({ valid: true });
            uploadImage.mockResolvedValue('https://cloudinary.com/adoptante.jpg');
            validateBase64Image.mockReturnValue({ valid: true });

            // Secuencia: BEGIN → SELECT user → SELECT perfil → SELECT COUNT tags → uploadImage
            // → INSERT Adoptante → INSERT Adoptante_Tag → UPDATE estado_cuenta → INSERT log → COMMIT
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ // SELECT user (adoptante, perfil_incompleto)
                    rows: [{ id_usuario: '550e8400-e29b-41d4-a716-446655440000', estado_cuenta: 'perfil_incompleto', nombre_rol: 'Adoptante' }]
                })
                .mockResolvedValueOnce({ rows: [] }) // SELECT perfil (no existe aún)
                .mockResolvedValueOnce({ rows: [{ total: 2 }] }) // SELECT COUNT opciones existen
                .mockResolvedValueOnce({}) // INSERT Adoptante
                .mockResolvedValueOnce({}) // INSERT Adoptante_Tag
                .mockResolvedValueOnce({}) // UPDATE Usuario estado_cuenta = 'activo'
                .mockResolvedValueOnce({}) // INSERT Log_Auditoria
                .mockResolvedValueOnce({}); // COMMIT

            const res = await request(app)
                .post('/api/adoptante/perfil')
                .send({
                    nombre_completo: 'Carlos Mendoza',
                    whatsapp: '3001234567',
                    ciudad: 'Neiva',
                    tags: tagIds,
                    foto: 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('Perfil de adoptante creado');
            expect(res.body.data.estado_cuenta).toBe('activo');
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
        });

        it('debe retornar 409 si el perfil ya fue creado', async () => {
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ // SELECT user
                    rows: [{ id_usuario: '550e8400-e29b-41d4-a716-446655440000', estado_cuenta: 'activo', nombre_rol: 'Adoptante' }]
                });

            const res = await request(app)
                .post('/api/adoptante/perfil')
                .send({
                    nombre_completo: 'Carlos Mendoza',
                    whatsapp: '3001234567',
                    ciudad: 'Neiva',
                    tags: tagIds
                });

            expect(res.status).toBe(409);
            expect(res.body.message).toContain('perfil ya fue completado');
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('ROLLBACK'));
        });

        it('debe retornar 409 si ya existe un registro en tabla Adoptante', async () => {
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ // SELECT user
                    rows: [{ id_usuario: '550e8400-e29b-41d4-a716-446655440000', estado_cuenta: 'perfil_incompleto', nombre_rol: 'Adoptante' }]
                })
                .mockResolvedValueOnce({ rows: [{ id_usuario: '550e8400-e29b-41d4-a716-446655440000' }] }); // SELECT perfil (YA existe)

            const res = await request(app)
                .post('/api/adoptante/perfil')
                .send({
                    nombre_completo: 'Carlos Mendoza',
                    whatsapp: '3001234567',
                    ciudad: 'Neiva',
                    tags: tagIds
                });

            expect(res.status).toBe(409);
            expect(res.body.message).toContain('Ya tienes un perfil');
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('ROLLBACK'));
        });

        it('debe retornar 403 si el usuario no tiene rol adoptante', async () => {
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ // SELECT user con rol diferente
                    rows: [{ id_usuario: '550e8400-e29b-41d4-a716-446655440000', estado_cuenta: 'perfil_incompleto', nombre_rol: 'Albergue' }]
                });

            const res = await request(app)
                .post('/api/adoptante/perfil')
                .send({
                    nombre_completo: 'Carlos Mendoza',
                    whatsapp: '3001234567',
                    ciudad: 'Neiva'
                });

            expect(res.status).toBe(403);
            expect(res.body.message).toContain('Solo los usuarios con rol adoptante');
        });
    });
});
