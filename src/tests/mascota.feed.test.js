// ──────────────────────────────────────────────
// Mascota Feed Tests — listarFeed con filtros
// ──────────────────────────────────────────────

jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
const { listarFeed } = require('../services/mascotaService');

describe('mascotaService — listarFeed', () => {
    const mockMascotas = [
        {
            id_mascota: 1,
            nombre: 'Luna',
            descripcion: 'Perrita cariñosa',
            fecha_publicacion: new Date('2026-04-28'),
            id_albergue: 100,
            nombre_albergue: 'Patitas Felices',
        },
        {
            id_mascota: 2,
            nombre: 'Michi',
            descripcion: 'Gato independiente',
            fecha_publicacion: new Date('2026-04-27'),
            id_albergue: 101,
            nombre_albergue: 'Bigotes Unidos',
        },
        {
            id_mascota: 3,
            nombre: 'Toby',
            descripcion: 'Perro juguetón',
            fecha_publicacion: new Date('2026-04-26'),
            id_albergue: 100,
            nombre_albergue: 'Patitas Felices',
        },
    ];

    const mockFotos = [
        { id_mascota: 1, url_foto: 'https://img/foto1.jpg' },
        { id_mascota: 2, url_foto: 'https://img/foto2.jpg' },
        { id_mascota: 3, url_foto: 'https://img/foto3.jpg' },
    ];

    const mockTags = [
        { id_mascota: 1, valor: 'Perro', nombre_tag: 'Tipo de animal' },
        { id_mascota: 1, valor: 'Mediano', nombre_tag: 'Tamaño' },
        { id_mascota: 2, valor: 'Gato', nombre_tag: 'Tipo de animal' },
        { id_mascota: 3, valor: 'Perro', nombre_tag: 'Tipo de animal' },
        { id_mascota: 3, valor: 'Grande', nombre_tag: 'Tamaño' },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('debe retornar mascotas disponibles con paginación por defecto', async () => {
        // 1. Count total
        prisma.$queryRaw.mockResolvedValueOnce([{ total: 3 }]);
        // 2. Query principal
        prisma.$queryRaw.mockResolvedValueOnce(mockMascotas);
        // 3. Fotos batch
        prisma.$queryRaw.mockResolvedValueOnce(mockFotos);
        // 4. Tags batch
        prisma.$queryRaw.mockResolvedValueOnce(mockTags);

        const result = await listarFeed({ page: 1, limit: 10 });

        expect(result.meta.total).toBe(3);
        expect(result.meta.page).toBe(1);
        expect(result.meta.limit).toBe(10);
        expect(result.meta.pages).toBe(1);
        expect(result.data).toHaveLength(3);
        expect(result.data[0].nombre).toBe('Luna');
        expect(result.data[1].nombre).toBe('Michi');
        expect(result.data[2].nombre).toBe('Toby');
    });

    it('debe filtrar por tipo de animal', async () => {
        // 1. Count con filtro de tipo
        prisma.$queryRaw.mockResolvedValueOnce([{ total: 2 }]);
        // 2. Query con filtro
        prisma.$queryRaw.mockResolvedValueOnce([mockMascotas[0], mockMascotas[2]]);
        // 3. Fotos batch
        prisma.$queryRaw.mockResolvedValueOnce([mockFotos[0], mockFotos[2]]);
        // 4. Tags batch
        prisma.$queryRaw.mockResolvedValueOnce([
            { id_mascota: 1, valor: 'Perro', nombre_tag: 'Tipo de animal' },
            { id_mascota: 3, valor: 'Perro', nombre_tag: 'Tipo de animal' },
        ]);

        const result = await listarFeed({ tipo: 'Perro', page: 1, limit: 10 });

        expect(result.data).toHaveLength(2);
        expect(result.data.every(m => m.nombre === 'Luna' || m.nombre === 'Toby')).toBe(true);
        // Verificar que NO incluye "Michi" (es Gato)
        expect(result.data.find(m => m.nombre === 'Michi')).toBeUndefined();
    });

    it('debe filtrar por tamaño y edad combinados', async () => {
        // 1. Count
        prisma.$queryRaw.mockResolvedValueOnce([{ total: 1 }]);
        // 2. Query
        prisma.$queryRaw.mockResolvedValueOnce([mockMascotas[0]]);
        // 3. Fotos
        prisma.$queryRaw.mockResolvedValueOnce([mockFotos[0]]);
        // 4. Tags
        prisma.$queryRaw.mockResolvedValueOnce([
            { id_mascota: 1, valor: 'Perro', nombre_tag: 'Tipo de animal' },
            { id_mascota: 1, valor: 'Mediano', nombre_tag: 'Tamaño' },
        ]);

        const result = await listarFeed({ tipo: 'Perro', tamaño: 'Mediano', page: 1, limit: 10 });

        expect(result.data).toHaveLength(1);
        expect(result.data[0].nombre).toBe('Luna');
    });

    it('debe paginar correctamente (page 2)', async () => {
        const page2Mascotas = [mockMascotas[2]]; // Toby (3ra mascota)

        // 1. Count (total sigue siendo 3)
        prisma.$queryRaw.mockResolvedValueOnce([{ total: 3 }]);
        // 2. Query con OFFSET
        prisma.$queryRaw.mockResolvedValueOnce(page2Mascotas);
        // 3. Fotos
        prisma.$queryRaw.mockResolvedValueOnce([mockFotos[2]]);
        // 4. Tags
        prisma.$queryRaw.mockResolvedValueOnce([
            { id_mascota: 3, valor: 'Perro', nombre_tag: 'Tipo de animal' },
            { id_mascota: 3, valor: 'Grande', nombre_tag: 'Tamaño' },
        ]);

        const result = await listarFeed({ page: 2, limit: 2 });

        expect(result.data).toHaveLength(1);
        expect(result.data[0].nombre).toBe('Toby');
        expect(result.meta.page).toBe(2);
        expect(result.meta.total).toBe(3);
        expect(result.meta.pages).toBe(2); // Math.ceil(3/2) = 2
    });

    it('debe retornar array vacío cuando no hay resultados', async () => {
        // 1. Count = 0
        prisma.$queryRaw.mockResolvedValueOnce([{ total: 0 }]);

        const result = await listarFeed({ tipo: 'Gato', page: 1, limit: 10 });

        expect(result.data).toEqual([]);
        expect(result.meta.total).toBe(0);
        expect(result.meta.pages).toBe(0);
        // No debe hacer más queries
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('debe incluir primera foto y tags en cada mascota', async () => {
        // 1. Count
        prisma.$queryRaw.mockResolvedValueOnce([{ total: 1 }]);
        // 2. Query
        prisma.$queryRaw.mockResolvedValueOnce([mockMascotas[0]]);
        // 3. Fotos
        prisma.$queryRaw.mockResolvedValueOnce([mockFotos[0]]);
        // 4. Tags
        prisma.$queryRaw.mockResolvedValueOnce([
            { id_mascota: 1, valor: 'Perro', nombre_tag: 'Tipo de animal' },
        ]);

        const result = await listarFeed({ page: 1, limit: 10 });

        expect(result.data[0].foto).toBe('https://img/foto1.jpg');
        expect(result.data[0].tags).toEqual([
            { valor: 'Perro', nombre_tag: 'Tipo de animal' },
        ]);
    });

    it('debe retornar foto null si la mascota no tiene fotos', async () => {
        // 1. Count
        prisma.$queryRaw.mockResolvedValueOnce([{ total: 1 }]);
        // 2. Query
        prisma.$queryRaw.mockResolvedValueOnce([mockMascotas[0]]);
        // 3. Fotos vacío
        prisma.$queryRaw.mockResolvedValueOnce([]);
        // 4. Tags
        prisma.$queryRaw.mockResolvedValueOnce([]);

        const result = await listarFeed({ page: 1, limit: 10 });

        expect(result.data[0].foto).toBeNull();
        expect(result.data[0].tags).toEqual([]);
    });
});
