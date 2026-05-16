/**
 * Tests para adopcionHistorialService (HU-HIS-02)
 * - Listar adopciones del albergue con filtros
 * - Detalle de adopción
 * - Exportación CSV
 */
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
const adopcionHistorialService = require('../services/adopcionHistorialService');

const ID_ALBERGUE = 100;

describe('adopcionHistorialService — listarAdopcionesAlbergue (HU-HIS-02)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('retorna lista vacía cuando no hay adopciones', async () => {
        prisma.$queryRaw
            .mockResolvedValueOnce([{ total: 0 }]);

        const result = await adopcionHistorialService.listarAdopcionesAlbergue(ID_ALBERGUE);

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(0);
        expect(result.meta.total).toBe(0);
    });

    it('retorna adopciones paginadas con datos correctos', async () => {
        prisma.$queryRaw
            .mockResolvedValueOnce([{ total: 2 }])
            .mockResolvedValueOnce([
                {
                    id_adopcion: 1,
                    nombre_mascota: 'Luna',
                    nombre_adoptante: 'Juan Pérez',
                    fecha_adopcion: new Date('2024-01-15'),
                    estado: 'en_proceso',
                    porcentaje_compatibilidad: 75,
                },
                {
                    id_adopcion: 2,
                    nombre_mascota: 'Rocky',
                    nombre_adoptante: 'Ana García',
                    fecha_adopcion: new Date('2024-02-20'),
                    estado: 'en_proceso',
                    porcentaje_compatibilidad: 60,
                },
            ]);

        const result = await adopcionHistorialService.listarAdopcionesAlbergue(ID_ALBERGUE, {
            page: 1,
            limit: 20,
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(2);
        expect(result.data[0].nombre_mascota).toBe('Luna');
        expect(result.meta.total).toBe(2);
        expect(result.meta.pages).toBe(1);
    });

    it('aplica filtro de búsqueda por nombre', async () => {
        prisma.$queryRaw
            .mockResolvedValueOnce([{ total: 0 }]);

        await adopcionHistorialService.listarAdopcionesAlbergue(ID_ALBERGUE, {
            busqueda: 'Luna',
        });

        // Verificar que $queryRaw fue llamado (con condición ILIKE)
        expect(prisma.$queryRaw).toHaveBeenCalled();
    });
});

describe('adopcionHistorialService — obtenerDetalleAdopcion (HU-HIS-02)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('retorna 404 si la adopción no existe', async () => {
        prisma.adopcion.findUnique.mockResolvedValueOnce(null);

        const result = await adopcionHistorialService.obtenerDetalleAdopcion(999, ID_ALBERGUE);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('retorna 403 si el albergue no es dueño de la mascota', async () => {
        prisma.adopcion.findUnique.mockResolvedValueOnce({
            id_adopcion: 1,
            fecha: new Date(),
            estado: 'en_proceso',
            observaciones: null,
            fecha_match: null,
            fecha_contacto: null,
            porcentaje_compatibilidad: 70,
            mascota: {
                id_mascota: 10,
                nombre: 'Luna',
                id_albergue: 999, // otro albergue
                mascota_foto: [],
            },
            adoptante: {
                id_usuario: 5,
                nombre_completo: 'Juan',
                whatsapp_adoptante: null,
                usuario: { correo: 'juan@test.com' },
            },
        });

        const result = await adopcionHistorialService.obtenerDetalleAdopcion(1, ID_ALBERGUE);

        expect(result.success).toBe(false);
        expect(result.status).toBe(403);
    });

    it('retorna detalle completo de la adopción', async () => {
        prisma.adopcion.findUnique.mockResolvedValueOnce({
            id_adopcion: 1,
            fecha: new Date('2024-01-15'),
            estado: 'en_proceso',
            observaciones: 'Todo bien',
            fecha_match: new Date('2024-01-10'),
            fecha_contacto: new Date('2024-01-12'),
            porcentaje_compatibilidad: 85,
            mascota: {
                id_mascota: 10,
                nombre: 'Luna',
                id_albergue: ID_ALBERGUE,
                mascota_foto: [{ url_foto: 'http://img/luna.jpg' }],
            },
            adoptante: {
                id_usuario: 5,
                nombre_completo: 'Ana García',
                whatsapp_adoptante: '+573001234567',
                usuario: { correo: 'ana@test.com' },
            },
        });

        const result = await adopcionHistorialService.obtenerDetalleAdopcion(1, ID_ALBERGUE);

        expect(result.success).toBe(true);
        expect(result.data.id_adopcion).toBe(1);
        expect(result.data.mascota.nombre).toBe('Luna');
        expect(result.data.adoptante.nombre_completo).toBe('Ana García');
        expect(result.data.adoptante.correo).toBe('ana@test.com');
        expect(result.data.porcentaje_compatibilidad).toBe(85);
    });
});

describe('adopcionHistorialService — exportarAdopcionesCSV (HU-HIS-02)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('retorna 404 si no hay registros para exportar', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([]);

        const result = await adopcionHistorialService.exportarAdopcionesCSV(ID_ALBERGUE);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('genera CSV con headers correctos', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([
            {
                'Fecha': new Date('2024-01-15'),
                'Mascota': 'Luna',
                'Adoptante': 'Juan Pérez',
                'Email': 'juan@test.com',
                'Porcentaje': 75,
                'Estado': 'en_proceso',
                'Observaciones': 'Sin observaciones',
            },
        ]);

        const result = await adopcionHistorialService.exportarAdopcionesCSV(ID_ALBERGUE);

        expect(result.success).toBe(true);
        expect(result.csv).toContain('Fecha,Mascota,Adoptante,Email,Porcentaje,Estado,Observaciones');
        expect(result.csv).toContain('Luna');
        expect(result.csv).toContain('juan@test.com');
        expect(result.total).toBe(1);
    });

    it('escapa valores con comas en CSV', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([
            {
                'Fecha': new Date('2024-01-15'),
                'Mascota': 'Luna, la perrita',
                'Adoptante': 'Juan',
                'Email': 'juan@test.com',
                'Porcentaje': 75,
                'Estado': 'en_proceso',
                'Observaciones': null,
            },
        ]);

        const result = await adopcionHistorialService.exportarAdopcionesCSV(ID_ALBERGUE);

        expect(result.csv).toContain('"Luna, la perrita"');
    });
});

describe('adopcionHistorialService — exportarAdopcionesExcel (HU-HIS-02)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('retorna 404 si no hay registros para exportar', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([]);

        const result = await adopcionHistorialService.exportarAdopcionesExcel(ID_ALBERGUE);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('genera buffer Excel (.xlsx) con datos correctos', async () => {
        prisma.$queryRaw.mockResolvedValueOnce([
            {
                'Fecha': new Date('2024-01-15'),
                'Mascota': 'Luna',
                'Adoptante': 'Juan Pérez',
                'Email': 'juan@test.com',
                'Porcentaje': 75,
                'Estado': 'en_proceso',
                'Observaciones': 'Sin observaciones',
            },
        ]);

        const result = await adopcionHistorialService.exportarAdopcionesExcel(ID_ALBERGUE);

        expect(result.success).toBe(true);
        expect(Buffer.isBuffer(result.buffer)).toBe(true);
        expect(result.buffer.length).toBeGreaterThan(0);
        expect(result.total).toBe(1);
    });
});
