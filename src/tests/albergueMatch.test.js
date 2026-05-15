/**
 * Tests para albergueMatchService (HU-MCH-01)
 * - Listar matches del albergue con filtros
 * - Detalle de match con datos de adoptante, mascota e historial de contactos
 */
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
const albergueMatchService = require('../services/albergueMatchService');

const ID_ALBERGUE = 100;

describe('albergueMatchService — listarMatchesAlbergue (HU-MCH-01)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('retorna lista vacía cuando el albergue no tiene matches', async () => {
        prisma.match.findMany.mockResolvedValueOnce([]);
        prisma.match.count
            .mockResolvedValueOnce(0)  // total
            .mockResolvedValueOnce(0); // pendientes

        const result = await albergueMatchService.listarMatchesAlbergue(ID_ALBERGUE);

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(0);
        expect(result.matches_pendientes).toBe(0);
    });

    it('retorna matches con datos de mascota y adoptante', async () => {
        const mockMatch = {
            id_match: 1,
            estado: 'pendiente',
            puntaje: 75,
            fecha: new Date('2024-01-15'),
            mascota: {
                id_mascota: 10,
                nombre: 'Luna',
                estado_adopcion: 'disponible',
                mascota_foto: [{ url_foto: 'http://img/luna.jpg' }],
            },
            adoptante: {
                id_usuario: 5,
                nombre_completo: 'Juan Pérez',
                foto_perfil: null,
                ciudad: 'Bogotá',
            },
        };

        prisma.match.findMany.mockResolvedValueOnce([mockMatch]);
        prisma.match.count
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(1);

        const result = await albergueMatchService.listarMatchesAlbergue(ID_ALBERGUE);

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].mascota.nombre).toBe('Luna');
        expect(result.data[0].adoptante.nombre_completo).toBe('Juan Pérez');
        expect(result.data[0].puntaje).toBe(75);
        expect(result.matches_pendientes).toBe(1);
    });

    it('aplica filtros de estado y fecha correctamente', async () => {
        prisma.match.findMany.mockResolvedValueOnce([]);
        prisma.match.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

        await albergueMatchService.listarMatchesAlbergue(ID_ALBERGUE, {
            estado: 'contactado',
            fecha_desde: '2024-01-01',
            fecha_hasta: '2024-12-31',
        });

        expect(prisma.match.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    estado: 'contactado',
                    fecha: expect.objectContaining({
                        gte: expect.any(Date),
                        lte: expect.any(Date),
                    }),
                }),
            })
        );
    });

    it('soporta filtro por id_mascota', async () => {
        prisma.match.findMany.mockResolvedValueOnce([]);
        prisma.match.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

        await albergueMatchService.listarMatchesAlbergue(ID_ALBERGUE, {
            id_mascota: 42,
        });

        expect(prisma.match.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ id_mascota: 42 }),
            })
        );
    });

    it('respeta la paginación (limit y offset)', async () => {
        prisma.match.findMany.mockResolvedValueOnce([]);
        prisma.match.count.mockResolvedValueOnce(50).mockResolvedValueOnce(5);

        const result = await albergueMatchService.listarMatchesAlbergue(ID_ALBERGUE, {
            limit: 10,
            offset: 20,
        });

        expect(prisma.match.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 20, take: 10 })
        );
        expect(result.pagination.total).toBe(50);
    });
});

describe('albergueMatchService — obtenerDetalleMatchAlbergue (HU-MCH-01)', () => {
    beforeEach(() => jest.clearAllMocks());

    it('retorna 404 si el match no existe', async () => {
        prisma.match.findFirst.mockResolvedValueOnce(null);

        const result = await albergueMatchService.obtenerDetalleMatchAlbergue(999, ID_ALBERGUE);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('retorna detalle completo del match con adoptante y historial', async () => {
        const mockMatch = {
            id_match: 1,
            estado: 'contactado',
            puntaje: 80,
            fecha: new Date('2024-02-10'),
            mascota: {
                id_mascota: 10,
                nombre: 'Luna',
                estado_adopcion: 'disponible',
                mascota_foto: [{ id_foto: 1, url_foto: 'http://img.jpg', orden: 0 }],
                mascota_tag: [{
                    opcion_tag: {
                        tag: { id_tag: 1, nombre_tag: 'Tamaño', categoria: 'fisica' },
                        valor: 'Pequeño',
                    },
                }],
            },
            adoptante: {
                id_usuario: 5,
                nombre_completo: 'Ana García',
                foto_perfil: null,
                whatsapp_adoptante: '+573001234567',
                ciudad: 'Medellín',
                adoptante_tag: [{
                    opcion_tag: {
                        tag: { id_tag: 2, nombre_tag: 'Tipo', categoria: 'animal' },
                        valor: 'Perro',
                    },
                }],
            },
            contacto_whatsapp: [
                { id_contacto: 1, fecha_contacto: new Date('2024-02-11'), id_albergue: ID_ALBERGUE },
            ],
        };

        prisma.match.findFirst.mockResolvedValueOnce(mockMatch);

        const result = await albergueMatchService.obtenerDetalleMatchAlbergue(1, ID_ALBERGUE);

        expect(result.success).toBe(true);
        expect(result.data.adoptante.nombre_completo).toBe('Ana García');
        expect(result.data.adoptante.tags).toHaveLength(1);
        expect(result.data.mascota.nombre).toBe('Luna');
        expect(result.data.historial_contactos).toHaveLength(1);
        expect(result.data.puntaje_compatibilidad).toBe(80);
    });
});
