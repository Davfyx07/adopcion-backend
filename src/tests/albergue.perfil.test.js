jest.mock('../config/db', () => ({
    connect: jest.fn(),
    query: jest.fn()
}));

jest.mock('../services/storageService', () => ({
    uploadImage: jest.fn(),
    deleteImage: jest.fn(),
    validateBase64Image: jest.fn()
}));

jest.mock('../middlewares/authMiddleware', () => (req, res, next) => {
    req.user = { id: '660e8400-e29b-41d4-a716-446655440000', role: 'albergue' };
    req.socket = { remoteAddress: '127.0.0.1' };
    next();
});
jest.mock('../middlewares/authorizeRole', () => () => (req, res, next) => next());

const pool = require('../config/db');
const request = require('supertest');
const express = require('express');
const { uploadImage, validateBase64Image } = require('../services/storageService');
const albergueRoutes = require('../routes/albergueRoutes');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.socket = { remoteAddress: '127.0.0.1' };
    next();
});
app.use('/api/albergue', albergueRoutes);

describe('HU-AL-01 - Creación de Perfil Albergue', () => {
    let mockClient;

    beforeEach(() => {
        jest.clearAllMocks();
        mockClient = {
            query: jest.fn().mockResolvedValue({ rows: [] }),
            release: jest.fn()
        };
        pool.connect.mockResolvedValue(mockClient);
    });

    describe('POST /api/albergue/perfil', () => {
        const datosValidos = {
            nombre_albergue: 'Fundación Patitas Felices',
            nit: '900123456-7',
            descripcion: 'Somos una fundación dedicada al rescate de perros y gatos en situación de calle en Neiva.',
            whatsapp: '+573001234567',
            sitio_web: 'https://patitasfelices.org'
        };

        it('debe crear el perfil institucional exitosamente', async () => {
            uploadImage.mockResolvedValue('https://cloudinary.com/logo.jpg');

            // Secuencia: BEGIN → SELECT user → SELECT perfil → SELECT NIT
            // → uploadImage → INSERT Albergue → INSERT Historial_WhatsApp
            // → UPDATE Usuario activo → INSERT Log_Auditoria → COMMIT
            const userId = '660e8400-e29b-41d4-a716-446655440000';
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ // SELECT user (albergue, perfil_incompleto)
                    rows: [{ id_usuario: userId, estado_cuenta: 'perfil_incompleto', nombre_rol: 'Albergue' }]
                })
                .mockResolvedValueOnce({ rows: [] }) // SELECT perfil (no existe)
                .mockResolvedValueOnce({ rows: [] }) // SELECT NIT (no existe)
                .mockResolvedValueOnce({}) // INSERT Albergue
                .mockResolvedValueOnce({}) // INSERT Historial_WhatsApp
                .mockResolvedValueOnce({}) // UPDATE usuario estado_cuenta = 'activo'
                .mockResolvedValueOnce({}) // INSERT Log_Auditoria
                .mockResolvedValueOnce({}); // COMMIT

            const res = await request(app)
                .post('/api/albergue/perfil')
                .send(datosValidos);

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('Perfil institucional creado');
            expect(res.body.data.estado_cuenta).toBe('activo');
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
        });

        it('debe retornar 409 si el NIT ya está registrado', async () => {
            const userId = '660e8400-e29b-41d4-a716-446655440000';
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ // SELECT user
                    rows: [{ id_usuario: userId, estado_cuenta: 'perfil_incompleto', nombre_rol: 'Albergue' }]
                })
                .mockResolvedValueOnce({ rows: [] }) // SELECT perfil (no existe)
                .mockResolvedValueOnce({ rows: [{ id_usuario: 'otro-usuario' }] }); // SELECT NIT (YA existe)

            const res = await request(app)
                .post('/api/albergue/perfil')
                .send(datosValidos);

            expect(res.status).toBe(409);
            expect(res.body.message).toContain('NIT');
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('ROLLBACK'));
        });

        it('debe retornar 409 si el perfil ya fue completado anteriormente', async () => {
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ // SELECT user con estado activo
                    rows: [{ id_usuario: '660e8400-e29b-41d4-a716-446655440000', estado_cuenta: 'activo', nombre_rol: 'Albergue' }]
                });

            const res = await request(app)
                .post('/api/albergue/perfil')
                .send(datosValidos);

            expect(res.status).toBe(409);
            expect(res.body.message).toContain('perfil institucional ya fue completado');
        });

        it('debe retornar 403 si el usuario no tiene rol albergue', async () => {
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ // SELECT user con otro rol
                    rows: [{ id_usuario: '660e8400-e29b-41d4-a716-446655440000', estado_cuenta: 'perfil_incompleto', nombre_rol: 'Adoptante' }]
                });

            const res = await request(app)
                .post('/api/albergue/perfil')
                .send(datosValidos);

            expect(res.status).toBe(403);
            expect(res.body.message).toContain('Solo los usuarios con rol albergue');
        });

        it('debe crear perfil con logo opcional si se proporciona', async () => {
            uploadImage.mockResolvedValue('https://cloudinary.com/logo.jpg');
            validateBase64Image.mockReturnValue({ valid: true });

            const userId = '660e8400-e29b-41d4-a716-446655440000';
            mockClient.query
                .mockResolvedValueOnce({}) // BEGIN
                .mockResolvedValueOnce({ // SELECT user
                    rows: [{ id_usuario: userId, estado_cuenta: 'perfil_incompleto', nombre_rol: 'Albergue' }]
                })
                .mockResolvedValueOnce({ rows: [] }) // SELECT perfil
                .mockResolvedValueOnce({ rows: [] }) // SELECT NIT
                .mockResolvedValueOnce({}) // INSERT Albergue
                .mockResolvedValueOnce({}) // INSERT Historial_WhatsApp
                .mockResolvedValueOnce({}) // UPDATE usuario
                .mockResolvedValueOnce({}) // INSERT Log_Auditoria
                .mockResolvedValueOnce({}); // COMMIT

            const res = await request(app)
                .post('/api/albergue/perfil')
                .send({
                    ...datosValidos,
                    logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
                });

            expect(res.status).toBe(201);
            expect(uploadImage).toHaveBeenCalledWith(expect.any(String), 'adopcion/logos');
            expect(res.body.data.logo_url).toBe('https://cloudinary.com/logo.jpg');
        });
    });
});
