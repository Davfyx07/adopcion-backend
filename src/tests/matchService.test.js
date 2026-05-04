jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
const matchService = require('../services/matchService');

describe('matchService — calcularCompatibilidad', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('debe retornar [] cuando el adoptante no tiene tags', async () => {
        prisma.adoptanteTag.findMany.mockResolvedValueOnce([]);

        const result = await matchService.calcularCompatibilidad(1);

        expect(result).toEqual([]);
        expect(prisma.descarte.findMany).not.toHaveBeenCalled();
    });

    it('debe calcular compatibilidad con fórmula ponderada correctamente', async () => {
        prisma.adoptanteTag.findMany.mockResolvedValueOnce([
            { id_opcion: 10 },
            { id_opcion: 20 },
            { id_opcion: 30 },
        ]);

        prisma.$queryRaw
            .mockResolvedValueOnce([
                { id_opcion: 10, id_tag: 1, peso_matching: '0', es_filtro_absoluto: true },
                { id_opcion: 20, id_tag: 2, peso_matching: '50', es_filtro_absoluto: false },
                { id_opcion: 30, id_tag: 3, peso_matching: '30', es_filtro_absoluto: false },
            ]);

        prisma.descarte.findMany.mockResolvedValueOnce([]);

        prisma.mascota.findMany.mockResolvedValueOnce([
            { id_mascota: 1, nombre: 'Luna', descripcion: 'Perrita' },
        ]);

        prisma.$queryRaw
            .mockResolvedValueOnce([
                { id_mascota: 1, id_opcion: 20, id_tag: 2 },
                { id_mascota: 1, id_opcion: 10, id_tag: 1 },
            ])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const result = await matchService.calcularCompatibilidad(1);

        expect(result).toHaveLength(1);
        expect(result[0].compatibilidad).toBe(63);
        expect(result[0].nombre).toBe('Luna');
    });

    it('debe excluir mascotas que no pasen filtros absolutos', async () => {
        prisma.adoptanteTag.findMany.mockResolvedValueOnce([
            { id_opcion: 10 },
        ]);

        prisma.$queryRaw
            .mockResolvedValueOnce([
                { id_opcion: 10, id_tag: 1, peso_matching: '0', es_filtro_absoluto: true },
            ]);

        prisma.descarte.findMany.mockResolvedValueOnce([]);

        prisma.mascota.findMany.mockResolvedValueOnce([
            { id_mascota: 2, nombre: 'Rocky', descripcion: 'Perro' },
        ]);

        prisma.$queryRaw
            .mockResolvedValueOnce([
                { id_mascota: 2, id_opcion: 99, id_tag: 5 },
            ])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const result = await matchService.calcularCompatibilidad(1);

        expect(result).toHaveLength(0);
    });

    it('debe excluir mascotas descartadas', async () => {
        prisma.adoptanteTag.findMany.mockResolvedValueOnce([]);

        const result = await matchService.calcularCompatibilidad(1);

        expect(result).toEqual([]);
    });

    it('debe retornar [] si ninguna mascota supera el 30%', async () => {
        prisma.adoptanteTag.findMany.mockResolvedValueOnce([
            { id_opcion: 10 },
        ]);

        prisma.$queryRaw
            .mockResolvedValueOnce([
                { id_opcion: 10, id_tag: 1, peso_matching: '10', es_filtro_absoluto: false },
            ]);

        prisma.descarte.findMany.mockResolvedValueOnce([]);

        prisma.mascota.findMany.mockResolvedValueOnce([
            { id_mascota: 3, nombre: 'Mishi', descripcion: 'Gato' },
        ]);

        prisma.$queryRaw
            .mockResolvedValueOnce([
                { id_mascota: 3, id_opcion: 99, id_tag: 5 },
            ])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        prisma.match.deleteMany.mockResolvedValueOnce({ count: 0 });
        prisma.match.createMany.mockResolvedValueOnce({ count: 0 });

        const result = await matchService.calcularCompatibilidad(1);

        expect(result).toEqual([]);
    });

    it('debe persistir matches que superan el umbral', async () => {
        prisma.adoptanteTag.findMany.mockResolvedValueOnce([
            { id_opcion: 10 },
            { id_opcion: 20 },
        ]);

        prisma.$queryRaw
            .mockResolvedValueOnce([
                { id_opcion: 10, id_tag: 1, peso_matching: '50', es_filtro_absoluto: false },
                { id_opcion: 20, id_tag: 2, peso_matching: '50', es_filtro_absoluto: false },
            ]);

        prisma.descarte.findMany.mockResolvedValueOnce([]);

        prisma.mascota.findMany.mockResolvedValueOnce([
            { id_mascota: 4, nombre: 'Max', descripcion: 'Cachorro' },
        ]);

        prisma.$queryRaw
            .mockResolvedValueOnce([
                { id_mascota: 4, id_opcion: 10, id_tag: 1 },
                { id_mascota: 4, id_opcion: 20, id_tag: 2 },
            ])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const result = await matchService.calcularCompatibilidad(1);

        expect(result).toHaveLength(1);
        expect(result[0].compatibilidad).toBe(100);
        expect(prisma.match.deleteMany).toHaveBeenCalledWith({
            where: { id_adoptante: 1, estado: 'pendiente' },
        });
        expect(prisma.match.createMany).toHaveBeenCalled();
    });
});

describe('matchService — descartarMascota', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('debe retornar error si la mascota no existe', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce(null);

        const result = await matchService.descartarMascota(1, 999);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('debe retornar error si ya fue descartada', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce({
            id_mascota: 5,
            nombre: 'Toby',
        });

        prisma.descarte.findUnique.mockResolvedValueOnce({
            id_adoptante: 1,
            id_mascota: 5,
        });

        const result = await matchService.descartarMascota(1, 5);

        expect(result.success).toBe(false);
        expect(result.status).toBe(409);
    });

    it('debe crear descarte y eliminar match pendiente', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce({
            id_mascota: 6,
            nombre: 'Cookie',
        });

        prisma.descarte.findUnique.mockResolvedValueOnce(null);

        prisma.descarte.create.mockResolvedValueOnce({
            id_adoptante: 1,
            id_mascota: 6,
        });

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
