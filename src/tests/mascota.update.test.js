// ──────────────────────────────────────────────
// Mock de Prisma (reemplaza pg Pool)
// ──────────────────────────────────────────────
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');

jest.mock('../services/storageService', () => ({
    uploadImage: jest.fn(),
    deleteImage: jest.fn()
}));

jest.mock('../services/embeddingService', () => ({
    calcularEmbedding: jest.fn()
}));

const { calcularEmbedding } = require('../services/embeddingService');
const { actualizarMascota } = require('../services/mascotaService');

describe('HU-MA-02 - actualizarMascota', () => {
    const baseMascota = {
        id_mascota: '11111111-1111-1111-1111-111111111111',
        id_albergue: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        nombre: 'Luna',
        descripcion: 'Descripcion inicial de mascota',
        estado_adopcion: 'disponible',
        updated_at: '2026-04-25T10:00:00.000Z'
    };

    beforeEach(() => {
        jest.clearAllMocks();
        calcularEmbedding.mockResolvedValue([1, 0, 1]);
    });

    it('debe actualizar mascota y registrar auditoria de cambios', async () => {
        // ── Prisma calls dentro de $transaction ──
        // 1. mascota.findUnique → baseMascota
        prisma.mascota.findUnique.mockResolvedValueOnce(baseMascota);
        // 2. mascota_tag.findMany → tags actuales
        prisma.mascota_tag.findMany.mockResolvedValueOnce([
            { id_opcion: 'tag-1' },
            { id_opcion: 'tag-2' }
        ]);
        // 3. mascota_foto.findMany → fotos actuales
        prisma.mascota_foto.findMany.mockResolvedValueOnce([
            { id_foto: 'foto-1', url_foto: 'https://img/1.jpg', orden: 0 },
            { id_foto: 'foto-2', url_foto: 'https://img/2.jpg', orden: 1 }
        ]);
        // 4-5. mascota_foto.updateMany → reordenar foto-1, foto-2
        prisma.mascota_foto.updateMany.mockResolvedValue({});
        // 6. opcion_tag.count → validar tags
        prisma.opcion_tag.count.mockResolvedValueOnce(2);
        // 7. mascota_tag.deleteMany → borrar tags viejos
        prisma.mascota_tag.deleteMany.mockResolvedValueOnce({});
        // 8. mascota_tag.createMany → insertar tags nuevos
        prisma.mascota_tag.createMany.mockResolvedValueOnce({});
        // 9. mascota.update → actualizar datos
        prisma.mascota.update.mockResolvedValueOnce({
            ...baseMascota,
            nombre: 'Luna Actualizada',
            descripcion: 'Descripcion inicial de mascota',
            updated_at: '2026-04-25T10:05:00.000Z'
        });
        // 10. mascota_foto.findMany → fotos finales (para auditoría)
        prisma.mascota_foto.findMany.mockResolvedValueOnce([
            { id_foto: 'foto-1', orden: 1 },
            { id_foto: 'foto-2', orden: 0 }
        ]);
        // 11. log_auditoria.create → auditoría
        prisma.log_auditoria.create.mockResolvedValueOnce({});

        const result = await actualizarMascota({
            id_mascota: baseMascota.id_mascota,
            id_albergue: baseMascota.id_albergue,
            ip: '127.0.0.1',
            data: {
                nombre: 'Luna Actualizada',
                updated_at: baseMascota.updated_at,
                fotos: [
                    { id_foto: 'foto-1', orden: 1 },
                    { id_foto: 'foto-2', orden: 0 }
                ],
                tagsIds: ['tag-1', 'tag-3']
            }
        });

        expect(result.success).toBe(true);
        expect(result.data.nombre).toBe('Luna Actualizada');
        expect(calcularEmbedding).toHaveBeenCalledTimes(1);
        expect(prisma.log_auditoria.create).toHaveBeenCalled();
    });

    it('debe bloquear cuando la mascota no pertenece al albergue autenticado', async () => {
        // mascota.findUnique → mascota con id_albergue diferente
        prisma.mascota.findUnique.mockResolvedValueOnce({
            ...baseMascota,
            id_albergue: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        });

        const result = await actualizarMascota({
            id_mascota: baseMascota.id_mascota,
            id_albergue: baseMascota.id_albergue,
            ip: '127.0.0.1',
            data: { updated_at: baseMascota.updated_at }
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe(403);
        expect(result.message).toContain('No tienes permiso');
    });

    it('debe recalcular embedding solo cuando cambian los tags', async () => {
        // ── Prisma calls ──
        // 1. mascota.findUnique
        prisma.mascota.findUnique.mockResolvedValueOnce(baseMascota);
        // 2. mascota_tag.findMany → tags actuales
        prisma.mascota_tag.findMany.mockResolvedValueOnce([
            { id_opcion: 'tag-1' },
            { id_opcion: 'tag-2' }
        ]);
        // 3. mascota_foto.findMany → foto actual (1 sola)
        prisma.mascota_foto.findMany.mockResolvedValueOnce([
            { id_foto: 'foto-1', url_foto: 'https://img/1.jpg', orden: 0 }
        ]);
        // 4. opcion_tag.count → validar tags (mismos: tag-1, tag-2)
        prisma.opcion_tag.count.mockResolvedValueOnce(2);
        // 5. mascota_tag.deleteMany
        prisma.mascota_tag.deleteMany.mockResolvedValueOnce({});
        // 6. mascota_tag.createMany
        prisma.mascota_tag.createMany.mockResolvedValueOnce({});
        // 7. mascota.update
        prisma.mascota.update.mockResolvedValueOnce({
            ...baseMascota,
            updated_at: '2026-04-25T10:06:00.000Z'
        });
        // 8. mascota_foto.findMany → fotos finales
        prisma.mascota_foto.findMany.mockResolvedValueOnce([
            { id_foto: 'foto-1', orden: 0 }
        ]);
        // 9. log_auditoria.create
        prisma.log_auditoria.create.mockResolvedValueOnce({});

        await actualizarMascota({
            id_mascota: baseMascota.id_mascota,
            id_albergue: baseMascota.id_albergue,
            ip: '127.0.0.1',
            data: {
                updated_at: baseMascota.updated_at,
                tagsIds: ['tag-1', 'tag-2']    // mismos tags → no recalcular
            }
        });

        expect(calcularEmbedding).not.toHaveBeenCalled();
    });
});
