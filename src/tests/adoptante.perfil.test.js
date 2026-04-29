// ──────────────────────────────────────────────
// Mock de Prisma (reemplaza pg Pool)
// ──────────────────────────────────────────────
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');

jest.mock('../services/storageService', () => ({
    uploadImage: jest.fn(),
    validateBase64Image: jest.fn(),
    deleteImage: jest.fn()
}));

jest.mock('../services/etiquetaService', () => ({
    validarTagsObligatorios: jest.fn()
}));

jest.mock('../services/embeddingService', () => ({
    calcularEmbedding: jest.fn()
}));

jest.mock('../middlewares/authMiddleware', () => (req, res, next) => {
    req.user = { id: '550e8400-e29b-41d4-a716-446655440000', role: 'adoptante' };
    req.socket = { remoteAddress: '127.0.0.1' };
    next();
});
jest.mock('../middlewares/authorizeRole', () => () => (req, res, next) => next());

const request = require('supertest');
const express = require('express');
const { validarTagsObligatorios } = require('../services/etiquetaService');
const { calcularEmbedding } = require('../services/embeddingService');
const { uploadImage, validateBase64Image } = require('../services/storageService');
const adoptanteRoutes = require('../routes/adoptanteRoutes');

const app = express();
app.use(express.json());
app.use('/api/adoptante', adoptanteRoutes);

describe('HU-US-01 - Creación de Perfil Adoptante', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/adoptante/perfil', () => {
        const tagIds = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'];

        it('debe crear el perfil exitosamente con tags y foto', async () => {
            validarTagsObligatorios.mockResolvedValue({ valid: true });
            calcularEmbedding.mockResolvedValue([1.0, 1.0, 0.0]);
            uploadImage.mockResolvedValue('https://cloudinary.com/adoptante.jpg');
            validateBase64Image.mockReturnValue({ valid: true });

            // ── Prisma calls dentro de $transaction ──
            // 1. usuario.findUnique → user (adoptante, perfil_incompleto)
            prisma.usuario.findUnique.mockResolvedValueOnce({
                id_usuario: '550e8400-e29b-41d4-a716-446655440000',
                estado_cuenta: 'perfil_incompleto',
                rol: { nombre_rol: 'Adoptante' }
            });
            // 2. adoptante.findUnique → null (no existe perfil)
            prisma.adoptante.findUnique.mockResolvedValueOnce(null);
            // 3. opcion_tag.count → 2 (tags válidos)
            prisma.opcion_tag.count.mockResolvedValueOnce(2);
            // 4. adoptante.create → OK
            prisma.adoptante.create.mockResolvedValueOnce({});
            // 5. adoptante_tag.createMany → OK
            prisma.adoptante_tag.createMany.mockResolvedValueOnce({});
            // 6. usuario.update → activar cuenta
            prisma.usuario.update.mockResolvedValueOnce({});
            // 7. log_auditoria.create → OK
            prisma.log_auditoria.create.mockResolvedValueOnce({});

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
            expect(prisma.adoptante.create).toHaveBeenCalled();
        });

        it('debe retornar 409 si el perfil ya fue creado', async () => {
            // usuario.findUnique → user ya activo
            prisma.usuario.findUnique.mockResolvedValueOnce({
                id_usuario: '550e8400-e29b-41d4-a716-446655440000',
                estado_cuenta: 'activo',
                rol: { nombre_rol: 'Adoptante' }
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
        });

        it('debe retornar 409 si ya existe un registro en tabla Adoptante', async () => {
            // 1. usuario.findUnique → user (perfil_incompleto)
            prisma.usuario.findUnique.mockResolvedValueOnce({
                id_usuario: '550e8400-e29b-41d4-a716-446655440000',
                estado_cuenta: 'perfil_incompleto',
                rol: { nombre_rol: 'Adoptante' }
            });
            // 2. adoptante.findUnique → YA existe perfil
            prisma.adoptante.findUnique.mockResolvedValueOnce({
                id_usuario: '550e8400-e29b-41d4-a716-446655440000'
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
            expect(res.body.message).toContain('Ya tienes un perfil');
        });

        it('debe retornar 403 si el usuario no tiene rol adoptante', async () => {
            // usuario.findUnique → user con rol diferente
            prisma.usuario.findUnique.mockResolvedValueOnce({
                id_usuario: '550e8400-e29b-41d4-a716-446655440000',
                estado_cuenta: 'perfil_incompleto',
                rol: { nombre_rol: 'Albergue' }
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
