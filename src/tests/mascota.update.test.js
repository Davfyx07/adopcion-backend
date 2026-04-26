jest.mock('../config/db', () => ({
    connect: jest.fn(),
    query: jest.fn()
}));

jest.mock('../services/storageService', () => ({
    uploadImage: jest.fn(),
    deleteImage: jest.fn()
}));

jest.mock('../services/embeddingService', () => ({
    calcularEmbedding: jest.fn()
}));

const pool = require('../config/db');
const { calcularEmbedding } = require('../services/embeddingService');
const { actualizarMascota } = require('../services/mascotaService');

describe('HU-MA-02 - actualizarMascota', () => {
    let mockClient;

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
        mockClient = {
            query: jest.fn(),
            release: jest.fn()
        };
        pool.connect.mockResolvedValue(mockClient);
        calcularEmbedding.mockResolvedValue([1, 0, 1]);
    });

    it('debe actualizar mascota y registrar auditoria de cambios', async () => {
        mockClient.query.mockImplementation(async (sql, params) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
            if (sql.includes('SELECT * FROM Mascota')) return { rows: [baseMascota] };
            if (sql.includes('SELECT id_opcion FROM Mascota_Tag')) {
                return { rows: [{ id_opcion: 'tag-1' }, { id_opcion: 'tag-2' }] };
            }
            if (sql.includes('SELECT id_foto, url_foto, orden FROM Mascota_Foto')) {
                return {
                    rows: [
                        { id_foto: 'foto-1', url_foto: 'https://img/1.jpg', orden: 0 },
                        { id_foto: 'foto-2', url_foto: 'https://img/2.jpg', orden: 1 }
                    ]
                };
            }
            if (sql.includes('SELECT id_opcion FROM Opcion_Tag')) {
                return { rows: [{ id_opcion: 'tag-1' }, { id_opcion: 'tag-3' }] };
            }
            if (sql.includes('UPDATE Mascota SET')) {
                return {
                    rows: [{
                        ...baseMascota,
                        nombre: 'Luna Actualizada',
                        descripcion: 'Descripcion inicial de mascota',
                        updated_at: '2026-04-25T10:05:00.000Z'
                    }]
                };
            }
            if (sql.includes('SELECT id_foto, orden FROM Mascota_Foto')) {
                return {
                    rows: [
                        { id_foto: 'foto-1', orden: 1 },
                        { id_foto: 'foto-2', orden: 0 }
                    ]
                };
            }
            if (sql.includes('INSERT INTO Log_Auditoria')) {
                expect(params[3]).toContain('campos_modificados');
                expect(params[3]).toContain('nombre');
                return { rows: [] };
            }
            return { rows: [] };
        });

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
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('debe bloquear cuando la mascota no pertenece al albergue autenticado', async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
            if (sql.includes('SELECT * FROM Mascota')) {
                return { rows: [{ ...baseMascota, id_albergue: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }] };
            }
            return { rows: [] };
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
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('debe recalcular embedding solo cuando cambian los tags', async () => {
        mockClient.query.mockImplementation(async (sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
            if (sql.includes('SELECT * FROM Mascota')) return { rows: [baseMascota] };
            if (sql.includes('SELECT id_opcion FROM Mascota_Tag')) {
                return { rows: [{ id_opcion: 'tag-1' }, { id_opcion: 'tag-2' }] };
            }
            if (sql.includes('SELECT id_foto, url_foto, orden FROM Mascota_Foto')) {
                return { rows: [{ id_foto: 'foto-1', url_foto: 'https://img/1.jpg', orden: 0 }] };
            }
            if (sql.includes('SELECT id_opcion FROM Opcion_Tag')) {
                return { rows: [{ id_opcion: 'tag-1' }, { id_opcion: 'tag-2' }] };
            }
            if (sql.includes('UPDATE Mascota SET')) {
                return { rows: [{ ...baseMascota, updated_at: '2026-04-25T10:06:00.000Z' }] };
            }
            if (sql.includes('SELECT id_foto, orden FROM Mascota_Foto')) {
                return { rows: [{ id_foto: 'foto-1', orden: 0 }] };
            }
            return { rows: [] };
        });

        await actualizarMascota({
            id_mascota: baseMascota.id_mascota,
            id_albergue: baseMascota.id_albergue,
            ip: '127.0.0.1',
            data: {
                updated_at: baseMascota.updated_at,
                tagsIds: ['tag-1', 'tag-2']
            }
        });

        expect(calcularEmbedding).not.toHaveBeenCalled();
    });
});
