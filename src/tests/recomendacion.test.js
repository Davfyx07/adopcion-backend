jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
const service = require('../services/recomendacionService');

describe('recomendacionService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('obtenerRecomendaciones', () => {
        it('debe calcular compatibilidad y filtrar mascotas', async () => {
            // Mock adoptante y sus tags
            prisma.adoptante.findUnique.mockResolvedValue({
                id_usuario: 1,
                adoptante_tag: [
                    { id_opcion: 10, opcion_tag: { id_tag: 1 } }, // Categoría 1, Opción 10
                ]
            });

            // Mock no hay procesadas
            prisma.match.findMany.mockResolvedValue([]);
            prisma.descarte.findMany.mockResolvedValue([]);

            // Mock tags config (pesos)
            prisma.tag.findMany.mockResolvedValue([
                { id_tag: 1, peso_matching: 100, es_filtro_absoluto: true, estado: 'activo' }
            ]);

            // Mock mascotas disponibles
            prisma.mascota.findMany.mockResolvedValue([
                {
                    id_mascota: 100,
                    nombre: 'Rex',
                    estado_adopcion: 'disponible',
                    mascota_tag: [{ id_opcion: 10, opcion_tag: { id_tag: 1 } }],
                    mascota_foto: [{ url_foto: 'foto1.jpg', orden: 0 }],
                    albergue: { id_usuario: 50, nombre_albergue: 'Albergue 1', logo: 'logo.png' }
                },
                {
                    id_mascota: 101,
                    nombre: 'Fifi',
                    estado_adopcion: 'disponible',
                    mascota_tag: [{ id_opcion: 11, opcion_tag: { id_tag: 1 } }],
                    mascota_foto: [],
                    albergue: { id_usuario: 50, nombre_albergue: 'Albergue 1', logo: 'logo.png' }
                }
            ]);

            const result = await service.obtenerRecomendaciones(1);

            expect(result.success).toBe(true);
            expect(result.data).toHaveLength(1); // Fifi debe ser filtrada por filtro absoluto (opción 11 != 10)
            expect(result.data[0].nombre).toBe('Rex');
            expect(result.data[0].compatibilidad).toBe(100);
        });

        it('debe excluir mascotas con match o descarte previo', async () => {
            prisma.adoptante.findUnique.mockResolvedValue({ id_usuario: 1, adoptante_tag: [] });
            prisma.match.findMany.mockResolvedValue([{ id_mascota: 100 }]);
            prisma.descarte.findMany.mockResolvedValue([{ id_mascota: 101 }]);
            prisma.tag.findMany.mockResolvedValue([]);
            prisma.mascota.findMany.mockResolvedValue([]);

            await service.obtenerRecomendaciones(1);

            // Verificar que el where de findMany excluye los IDs 100 y 101
            const callArgs = prisma.mascota.findMany.mock.calls[0][0];
            expect(callArgs.where.id_mascota.notIn).toContain(100);
            expect(callArgs.where.id_mascota.notIn).toContain(101);
        });
    });

    describe('registrarInteres', () => {
        it('debe crear un match y una notificación', async () => {
            prisma.mascota.findUnique.mockResolvedValue({
                id_mascota: 100,
                nombre: 'Rex',
                estado_adopcion: 'disponible',
                id_albergue: 50
            });
            prisma.match.findFirst.mockResolvedValue(null);
            
            // Mock transaction result
            prisma.match.create.mockResolvedValue({ id_match: 1 });

            const result = await service.registrarInteres(1, 100);

            expect(result.success).toBe(true);
            expect(prisma.match.create).toHaveBeenCalled();
            expect(prisma.notificacion.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    id_usuario: 50,
                    tipo_notificacion: 'match'
                })
            });
        });

        it('no debe permitir match duplicado', async () => {
            prisma.mascota.findUnique.mockResolvedValue({ id_mascota: 100, estado_adopcion: 'disponible' });
            prisma.match.findFirst.mockResolvedValue({ id_match: 1 });

            const result = await service.registrarInteres(1, 100);

            expect(result.success).toBe(false);
            expect(result.status).toBe(400);
        });
    });

    describe('deshacerUltimaAccion', () => {
        it('debe deshacer un descarte reciente', async () => {
            const fechaReciente = new Date();
            const fechaAntigua = new Date(Date.now() - 10000);

            prisma.match.findFirst.mockResolvedValue({ id_match: 1, id_mascota: 100, fecha: fechaAntigua });
            prisma.descarte.findFirst.mockResolvedValue({ id_adoptante: 1, id_mascota: 101, fecha: fechaReciente });
            prisma.mascota.findUnique.mockResolvedValue({ id_mascota: 101, nombre: 'Fifi' });

            const result = await service.deshacerUltimaAccion(1);

            expect(result.success).toBe(true);
            expect(prisma.descarte.delete).toHaveBeenCalled();
            expect(result.data.nombre).toBe('Fifi');
        });
    });
});
