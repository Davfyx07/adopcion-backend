// ──────────────────────────────────────────────
// Etiqueta Service Tests
// ──────────────────────────────────────────────

jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
const { getEtiquetas, getTagsObligatorios, validarTagsObligatorios } = require('../services/etiquetaService');

describe('etiquetaService — getEtiquetas', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('debe retornar lista de etiquetas con categorías desde $queryRaw', async () => {
        const mockEtiquetas = [
            { id_opcion: 'opt-1', valor: 'Perro', categoria: 'Tipo de animal', es_obligatoria: true },
            { id_opcion: 'opt-2', valor: 'Gato', categoria: 'Tipo de animal', es_obligatoria: true },
            { id_opcion: 'opt-3', valor: 'Pequeño', categoria: 'Tamaño', es_obligatoria: false },
            { id_opcion: 'opt-4', valor: 'Mediano', categoria: 'Tamaño', es_obligatoria: false },
        ];

        prisma.$queryRaw.mockResolvedValueOnce(mockEtiquetas);

        const result = await getEtiquetas();

        expect(prisma.$queryRaw).toHaveBeenCalled();
        expect(result).toEqual(mockEtiquetas);
        expect(result).toHaveLength(4);
        // Verificar que vienen ordenadas por categoría ASC, valor ASC
        expect(result[0].categoria).toBe('Tipo de animal');
        expect(result[3].categoria).toBe('Tamaño');
    });

    it('debe retornar array vacío cuando no hay etiquetas activas', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([]);

        const result = await getEtiquetas();

        expect(result).toEqual([]);
    });

    it('debe incluir campo es_obligatoria mapeado correctamente', async () => {
        const mockData = [
            { id_opcion: 'opt-1', valor: 'Perro', categoria: 'Tipo de animal', es_obligatoria: true },
            { id_opcion: 'opt-5', valor: 'Senior (7+)', categoria: 'Rango de edad', es_obligatoria: false },
        ];
        prisma.$queryRaw.mockResolvedValueOnce(mockData);

        const result = await getEtiquetas();

        expect(result[0].es_obligatoria).toBe(true);
        expect(result[1].es_obligatoria).toBe(false);
    });
});

describe('etiquetaService — getTagsObligatorios', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('debe retornar solo los tags con es_filtro_absoluto=true', async () => {
        prisma.tag.findMany.mockResolvedValueOnce([
            { id_tag: 1 },
            { id_tag: 5 },
        ]);

        const result = await getTagsObligatorios();

        expect(prisma.tag.findMany).toHaveBeenCalledWith({
            where: { es_filtro_absoluto: true, estado: 'activo' },
            select: { id_tag: true },
        });
        expect(result).toEqual([1, 5]);
    });

    it('debe retornar array vacío si no hay tags obligatorios activos', async () => {
        prisma.tag.findMany.mockResolvedValueOnce([]);

        const result = await getTagsObligatorios();

        expect(result).toEqual([]);
    });

    it('debe ignorar tags inactivos aunque tengan es_filtro_absoluto=true', async () => {
        prisma.tag.findMany.mockResolvedValueOnce([
            { id_tag: 2 },
        ]);

        const result = await getTagsObligatorios();

        expect(result).toEqual([2]);
        expect(prisma.tag.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ estado: 'activo' }),
            })
        );
    });
});

describe('etiquetaService — validarTagsObligatorios', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('debe pasar cuando todas las categorías obligatorias están cubiertas', async () => {
        // Tags obligatorios: Tipo de animal (id_tag=1), Tamaño (id_tag=2)
        prisma.tag.findMany.mockResolvedValueOnce([
            { id_tag: 1 },
            { id_tag: 2 },
        ]);

        // Opciones seleccionadas cubren ambos tags obligatorios
        prisma.opcionTag.findMany.mockResolvedValueOnce([
            { id_tag: 1 }, // "Perro" → cubre Tipo de animal
            { id_tag: 2 }, // "Mediano" → cubre Tamaño
        ]);

        const result = await validarTagsObligatorios(['opt-perro', 'opt-mediano']);

        expect(result).toEqual({ valid: true });
    });

    it('debe pasar cuando no hay tags obligatorios configurados', async () => {
        prisma.tag.findMany.mockResolvedValueOnce([]);

        const result = await validarTagsObligatorios([]);

        expect(result).toEqual({ valid: true });
        // No debe consultar opción tag
        expect(prisma.opcionTag.findMany).not.toHaveBeenCalled();
    });

    it('debe fallar cuando falta una categoría obligatoria', async () => {
        // Tags obligatorios: Tipo de animal (id_tag=1), Tamaño (id_tag=2)
        prisma.tag.findMany.mockResolvedValueOnce([
            { id_tag: 1 },
            { id_tag: 2 },
        ]);

        // Solo cubrimos Tipo de animal, NO Tamaño
        prisma.opcionTag.findMany.mockResolvedValueOnce([
            { id_tag: 1 }, // "Perro"
        ]);

        const result = await validarTagsObligatorios(['opt-perro']);

        expect(result.valid).toBe(false);
        expect(result.tagsFaltantes).toEqual([2]);
    });

    it('debe fallar cuando falta más de una categoría obligatoria', async () => {
        prisma.tag.findMany.mockResolvedValueOnce([
            { id_tag: 1 },
            { id_tag: 2 },
            { id_tag: 3 },
        ]);

        // Solo cubrimos 1 de 3
        prisma.opcionTag.findMany.mockResolvedValueOnce([
            { id_tag: 1 },
        ]);

        const result = await validarTagsObligatorios(['opt-perro']);

        expect(result.valid).toBe(false);
        expect(result.tagsFaltantes).toEqual([2, 3]);
    });

    it('debe usar distinct en id_tag para evitar duplicados', async () => {
        prisma.tag.findMany.mockResolvedValueOnce([
            { id_tag: 1 },
        ]);

        // El adoptante seleccionó 2 opciones del mismo tag obligatorio
        prisma.opcionTag.findMany.mockResolvedValueOnce([
            { id_tag: 1 },
            { id_tag: 1 },
        ]);

        const result = await validarTagsObligatorios(['opt-perro', 'opt-gato']);

        expect(result).toEqual({ valid: true });
        expect(prisma.opcionTag.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                distinct: ['id_tag'],
            })
        );
    });
});
