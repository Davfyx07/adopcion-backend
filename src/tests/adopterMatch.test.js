/**
 * Tests para HU-MCH-03: Gestión de matches para el Adoptante
 * Valida listado, filtros, paginación y detalle.
 */
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
const matchService = require('../services/matchService');

const ID_ADOPTANTE = 5;

describe('HU-MCH-03 — Listado de Matches (Adoptante)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('debe listar matches con filtros de estado y fechas', async () => {
        prisma.match.findMany.mockResolvedValueOnce([]);
        prisma.match.count.mockResolvedValueOnce(0);

        const filtros = {
            estado: 'pendiente',
            fecha_desde: '2024-01-01',
            fecha_hasta: '2024-12-31'
        };

        await matchService.obtenerMatches(ID_ADOPTANTE, filtros);

        expect(prisma.match.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                id_adoptante: ID_ADOPTANTE,
                estado: 'pendiente',
                fecha: expect.objectContaining({
                    gte: expect.any(Date),
                    lte: expect.any(Date)
                })
            })
        }));
    });

    it('debe aplicar paginación correctamente (limit y offset)', async () => {
        prisma.match.findMany.mockResolvedValueOnce([]);
        prisma.match.count.mockResolvedValueOnce(0);

        await matchService.obtenerMatches(ID_ADOPTANTE, { limit: 10, offset: 20 });

        expect(prisma.match.findMany).toHaveBeenCalledWith(expect.objectContaining({
            take: 10,
            skip: 20
        }));
    });

    it('debe ordenar por fecha descendente por defecto', async () => {
        prisma.match.findMany.mockResolvedValueOnce([]);
        prisma.match.count.mockResolvedValueOnce(0);

        await matchService.obtenerMatches(ID_ADOPTANTE, {});

        expect(prisma.match.findMany).toHaveBeenCalledWith(expect.objectContaining({
            orderBy: { fecha: 'desc' }
        }));
    });
});

describe('HU-MCH-03 — Detalle de Match (Adoptante)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('debe retornar 404 si el match no existe o no pertenece al adoptante', async () => {
        prisma.match.findFirst.mockResolvedValueOnce(null);

        const result = await matchService.obtenerDetalleMatch(999, ID_ADOPTANTE);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('debe incluir datos completos de mascota y albergue en el detalle', async () => {
        const mockMatch = {
            id_match: 1,
            estado: 'pendiente',
            puntaje: 85,
            fecha: new Date(),
            mascota: {
                id_mascota: 10,
                nombre: 'Firulais',
                descripcion: 'Amistoso',
                estado_adopcion: 'disponible',
                mascota_foto: [],
                mascota_tag: [],
                albergue: {
                    id_usuario: 100,
                    nombre_albergue: 'Refugio Canino',
                    whatsapp_actual: '123456789'
                }
            }
        };

        prisma.match.findFirst.mockResolvedValueOnce(mockMatch);

        const result = await matchService.obtenerDetalleMatch(1, ID_ADOPTANTE);

        expect(result.success).toBe(true);
        expect(result.data.mascota.nombre).toBe('Firulais');
        expect(result.data.albergue.nombre_albergue).toBe('Refugio Canino');
        expect(result.data.puntaje_compatibilidad).toBe(85);
    });
});
