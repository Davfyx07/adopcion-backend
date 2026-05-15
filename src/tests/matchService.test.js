/**
 * Tests para matchService.calcularCompatibilidad (pgvector)
 * y matchService.descartarMascota
 *
 * HU-MT-01: el algoritmo ahora usa $queryRaw con pgvector (<=>)
 * en lugar de calcular en memoria, por lo que mockeamos $queryRaw.
 */
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));
jest.mock('../config/redis', () => null); // sin Redis en tests

const prisma = require('../config/prisma');
const matchService = require('../services/matchService');

// ────────────────────────────────────────────────────────────
// calcularCompatibilidad
// ────────────────────────────────────────────────────────────
describe('matchService — calcularCompatibilidad (pgvector)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('retorna [] cuando el adoptante no tiene embedding', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([]); // adoptante sin embedding

        const result = await matchService.calcularCompatibilidad(1);

        expect(result).toEqual([]);
        expect(prisma.match.deleteMany).toHaveBeenCalled(); // limpia pendientes
    });

    it('retorna [] cuando no hay mascotas con compatibilidad >= 30%', async () => {
        // adoptante tiene embedding
        prisma.$queryRaw.mockResolvedValueOnce([{ id_usuario: 1 }]);
        // descartes vacíos
        prisma.descarte.findMany.mockResolvedValueOnce([]);
        // pgvector no retorna mascotas (todas < 30%)
        prisma.$queryRaw.mockResolvedValueOnce([]);

        const result = await matchService.calcularCompatibilidad(1);

        expect(result).toEqual([]);
        expect(prisma.match.deleteMany).toHaveBeenCalledWith({
            where: { id_adoptante: 1, estado: 'pendiente' },
        });
    });

    it('retorna mascotas ordenadas por compatibilidad descendente', async () => {
        prisma.$queryRaw
            // 1. adoptante con embedding
            .mockResolvedValueOnce([{ id_usuario: 1 }])
            // 2. query pgvector — 2 mascotas
            .mockResolvedValueOnce([
                { id_mascota: 10, nombre: 'Luna', descripcion: 'Perrita', id_albergue: 1, nombre_albergue: 'Refugio', compatibilidad: 80 },
                { id_mascota: 20, nombre: 'Rocky', descripcion: 'Perro', id_albergue: 1, nombre_albergue: 'Refugio', compatibilidad: 50 },
            ])
            // 3. fotos (batch)
            .mockResolvedValueOnce([
                { id_mascota: 10, url_foto: 'http://img/luna.jpg' },
            ])
            // 4. tags detalle (batch)
            .mockResolvedValueOnce([
                { id_mascota: 10, valor: 'Pequeño', nombre_tag: 'Tamaño', categoria: 'fisica' },
            ]);

        prisma.descarte.findMany.mockResolvedValueOnce([]);
        prisma.match.deleteMany.mockResolvedValueOnce({ count: 0 });
        prisma.match.createMany.mockResolvedValueOnce({ count: 2 });

        const result = await matchService.calcularCompatibilidad(1);

        expect(result).toHaveLength(2);
        expect(result[0].compatibilidad).toBe(80);
        expect(result[0].nombre).toBe('Luna');
        expect(result[0].foto).toBe('http://img/luna.jpg');
        expect(result[1].compatibilidad).toBe(50);
    });

    it('persiste matches en BD tras el cálculo', async () => {
        prisma.$queryRaw
            .mockResolvedValueOnce([{ id_usuario: 1 }])
            .mockResolvedValueOnce([
                { id_mascota: 5, nombre: 'Max', descripcion: 'Cachorro', id_albergue: 2, nombre_albergue: 'Hogar', compatibilidad: 75 },
            ])
            .mockResolvedValueOnce([])  // fotos
            .mockResolvedValueOnce([]); // tags

        prisma.descarte.findMany.mockResolvedValueOnce([]);
        prisma.match.deleteMany.mockResolvedValueOnce({ count: 0 });
        prisma.match.createMany.mockResolvedValueOnce({ count: 1 });

        await matchService.calcularCompatibilidad(1);

        expect(prisma.match.deleteMany).toHaveBeenCalledWith({
            where: { id_adoptante: 1, estado: 'pendiente' },
        });
        expect(prisma.match.createMany).toHaveBeenCalledWith({
            data: [{ id_adoptante: 1, id_mascota: 5, puntaje: 75, estado: 'pendiente' }],
        });
    });

    it('excluye mascotas descartadas de la query pgvector', async () => {
        // 1. adoptante con embedding
        prisma.$queryRaw.mockResolvedValueOnce([{ id_usuario: 1 }]);
        // descarte de mascota 99
        prisma.descarte.findMany.mockResolvedValueOnce([{ id_mascota: 99 }]);
        // pgvector retorna vacío (mascota descartada queda fuera por el NOT IN)
        prisma.$queryRaw.mockResolvedValueOnce([]);

        const result = await matchService.calcularCompatibilidad(1);

        expect(result).toEqual([]);
    });
});

// ────────────────────────────────────────────────────────────
// descartarMascota
// ────────────────────────────────────────────────────────────
describe('matchService — descartarMascota', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('retorna 404 si la mascota no existe', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce(null);

        const result = await matchService.descartarMascota(1, 999);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('retorna 409 si ya fue descartada', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce({ id_mascota: 5, nombre: 'Toby' });
        prisma.descarte.findUnique.mockResolvedValueOnce({ id_adoptante: 1, id_mascota: 5 });

        const result = await matchService.descartarMascota(1, 5);

        expect(result.success).toBe(false);
        expect(result.status).toBe(409);
    });

    it('crea descarte y elimina match pendiente', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce({ id_mascota: 6, nombre: 'Cookie' });
        prisma.descarte.findUnique.mockResolvedValueOnce(null);
        prisma.descarte.create.mockResolvedValueOnce({ id_adoptante: 1, id_mascota: 6 });
        prisma.match.deleteMany.mockResolvedValueOnce({ count: 1 });

        const result = await matchService.descartarMascota(1, 6);

        expect(result.success).toBe(true);
        expect(prisma.descarte.create).toHaveBeenCalledWith({
            data: { id_adoptante: 1, id_mascota: 6 },
        });
        expect(prisma.match.deleteMany).toHaveBeenCalledWith({
            where: { id_adoptante: 1, id_mascota: 6 },
        });
    });
});
