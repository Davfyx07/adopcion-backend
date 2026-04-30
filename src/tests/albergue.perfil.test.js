// ──────────────────────────────────────────────
// Mock de Prisma (reemplaza pg Pool)
// ──────────────────────────────────────────────
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');

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
    beforeEach(() => {
        jest.clearAllMocks();
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

            const userId = '660e8400-e29b-41d4-a716-446655440000';

            // ── Prisma calls dentro de $transaction ──
            // 1. usuario.findUnique → user (albergue, perfil_incompleto)
            prisma.usuario.findUnique.mockResolvedValueOnce({
                id_usuario: userId,
                estado_cuenta: 'perfil_incompleto',
                rol: { nombre_rol: 'Albergue' }
            });
            // 2. albergue.findUnique → null (no existe perfil)
            // 3. albergue.findUnique → null (no existe NIT)
            prisma.albergue.findUnique.mockResolvedValue(null);
            // 4. albergue.create → OK
            prisma.albergue.create.mockResolvedValueOnce({});
            // 5. historialWhatsappAlbergue.create → OK
            prisma.historialWhatsappAlbergue.create.mockResolvedValueOnce({});
            // 6. usuario.update → activar cuenta
            prisma.usuario.update.mockResolvedValueOnce({});
            // 7. logAuditoria.create → OK
            prisma.logAuditoria.create.mockResolvedValueOnce({});

            const res = await request(app)
                .post('/api/albergue/perfil')
                .send(datosValidos);

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('Perfil institucional creado');
            expect(res.body.data.estado_cuenta).toBe('activo');
            expect(prisma.albergue.create).toHaveBeenCalled();
        });

        it('debe retornar 409 si el NIT ya está registrado', async () => {
            const userId = '660e8400-e29b-41d4-a716-446655440000';

            // 1. usuario.findUnique → user
            prisma.usuario.findUnique.mockResolvedValueOnce({
                id_usuario: userId,
                estado_cuenta: 'perfil_incompleto',
                rol: { nombre_rol: 'Albergue' }
            });
            // 2. albergue.findUnique → null (no existe perfil)
            // 3. albergue.findUnique → NIT YA existe
            prisma.albergue.findUnique
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ id_usuario: 'otro-usuario' });

            const res = await request(app)
                .post('/api/albergue/perfil')
                .send(datosValidos);

            expect(res.status).toBe(409);
            expect(res.body.message).toContain('NIT');
        });

        it('debe retornar 409 si el perfil ya fue completado anteriormente', async () => {
            // usuario.findUnique → user con estado 'activo'
            prisma.usuario.findUnique.mockResolvedValueOnce({
                id_usuario: '660e8400-e29b-41d4-a716-446655440000',
                estado_cuenta: 'activo',
                rol: { nombre_rol: 'Albergue' }
            });

            const res = await request(app)
                .post('/api/albergue/perfil')
                .send(datosValidos);

            expect(res.status).toBe(409);
            expect(res.body.message).toContain('perfil institucional ya fue completado');
        });

        it('debe retornar 403 si el usuario no tiene rol albergue', async () => {
            // usuario.findUnique → user con otro rol
            prisma.usuario.findUnique.mockResolvedValueOnce({
                id_usuario: '660e8400-e29b-41d4-a716-446655440000',
                estado_cuenta: 'perfil_incompleto',
                rol: { nombre_rol: 'Adoptante' }
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

            // 1. usuario.findUnique → user
            prisma.usuario.findUnique.mockResolvedValueOnce({
                id_usuario: userId,
                estado_cuenta: 'perfil_incompleto',
                rol: { nombre_rol: 'Albergue' }
            });
            // 2-3. albergue.findUnique → null (no existe perfil, no existe NIT)
            prisma.albergue.findUnique.mockResolvedValue(null);
            // 4. albergue.create → OK
            prisma.albergue.create.mockResolvedValueOnce({});
            // 5. historialWhatsappAlbergue.create → OK
            prisma.historialWhatsappAlbergue.create.mockResolvedValueOnce({});
            // 6. usuario.update → activar cuenta
            prisma.usuario.update.mockResolvedValueOnce({});
            // 7. logAuditoria.create → OK
            prisma.logAuditoria.create.mockResolvedValueOnce({});

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
