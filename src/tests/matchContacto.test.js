const matchService = require('../services/matchService');
const prisma = require('../config/prisma');

jest.mock('../config/prisma', () => ({
    $transaction: jest.fn(),
    match: {
        findUnique: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn()
    },
    albergue: {
        findUnique: jest.fn()
    },
    notificacion: {
        create: jest.fn()
    },
    contactoWhatsapp: {
        create: jest.fn()
    }
}));

describe('matchService - contactarAdoptante', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    });

    it('debe retornar 404 si el match no existe', async () => {
        prisma.match.findUnique.mockResolvedValue(null);

        const result = await matchService.contactarAdoptante(1, 999);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        expect(result.message).toBe('Match no encontrado.');
    });

    it('debe retornar 403 si el albergue no es dueno de la mascota', async () => {
        prisma.match.findUnique.mockResolvedValue({
            id_match: 1,
            mascota: { id_albergue: 2 } // Otro albergue
        });

        const result = await matchService.contactarAdoptante(1, 1);

        expect(result.success).toBe(false);
        expect(result.status).toBe(403);
    });

    it('debe retornar 400 si el adoptante no tiene WhatsApp', async () => {
        prisma.match.findUnique.mockResolvedValue({
            id_match: 1,
            mascota: { id_albergue: 1 },
            adoptante: { whatsapp_adoptante: null }
        });
        prisma.albergue.findUnique.mockResolvedValue({ nombre_albergue: 'Refugio' });

        const result = await matchService.contactarAdoptante(1, 1);

        expect(result.success).toBe(false);
        expect(result.status).toBe(400);
        expect(result.message).toContain('no tiene un número de WhatsApp');
    });

    it('debe generar el enlace y notificar si es la primera vez', async () => {
        prisma.match.findUnique.mockResolvedValue({
            id_match: 1,
            estado: 'pendiente',
            mascota: { id_albergue: 1, nombre: 'Firulais' },
            adoptante: { id_usuario: 5, nombre_completo: 'Juan Perez', whatsapp_adoptante: '+573001234567' }
        });
        prisma.albergue.findUnique.mockResolvedValue({ nombre_albergue: 'Refugio' });

        const result = await matchService.contactarAdoptante(1, 1);

        expect(result.success).toBe(true);
        expect(result.data.estado).toBe('contactado_actualizado');
        expect(result.data.enlace_whatsapp).toContain('wa.me/573001234567');
        expect(result.data.enlace_whatsapp).toContain('text=');
        
        // Verifica que se actualice el estado del match
        expect(prisma.match.update).toHaveBeenCalledWith({
            where: { id_match: 1 },
            data: { estado: 'contactado' }
        });

        // Verifica que se cree la notificación
        expect(prisma.notificacion.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                id_usuario: 5,
                tipo_notificacion: 'contacto_albergue'
            })
        });

        // Verifica que se guarde el registro en la tabla de auditoría
        expect(prisma.contactoWhatsapp.create).toHaveBeenCalledWith({
            data: { id_match: 1, id_albergue: 1 }
        });
    });

    it('debe generar el enlace pero NO cambiar estado ni notificar si ya fue contactado', async () => {
        prisma.match.findUnique.mockResolvedValue({
            id_match: 1,
            estado: 'contactado', // Ya contactado
            mascota: { id_albergue: 1, nombre: 'Firulais' },
            adoptante: { id_usuario: 5, nombre_completo: 'Juan Perez', whatsapp_adoptante: '+573001234567' }
        });
        prisma.albergue.findUnique.mockResolvedValue({ nombre_albergue: 'Refugio' });

        const result = await matchService.contactarAdoptante(1, 1);

        expect(result.success).toBe(true);
        expect(result.data.estado).toBe('contactado');
        
        // No debe actualizar estado ni notificar
        expect(prisma.match.update).not.toHaveBeenCalled();
        expect(prisma.notificacion.create).not.toHaveBeenCalled();

        // Sí debe guardar el registro en contactoWhatsapp (auditoría de reenvío/reintento)
        expect(prisma.contactoWhatsapp.create).toHaveBeenCalled();
    });

    it('debe codificar correctamente el mensaje en el enlace', async () => {
        prisma.match.findUnique.mockResolvedValue({
            id_match: 1,
            estado: 'pendiente',
            mascota: { id_albergue: 1, nombre: 'Firulais' },
            adoptante: { id_usuario: 5, nombre_completo: 'Juan Perez', whatsapp_adoptante: '300-123-4567' }
        });
        prisma.albergue.findUnique.mockResolvedValue({ nombre_albergue: 'Refugio Amigo' });

        const result = await matchService.contactarAdoptante(1, 1);

        // El numero debe estar limpio de guiones
        expect(result.data.enlace_whatsapp).toContain('wa.me/3001234567');
        
        // El texto debe estar url-encoded
        const expectedMessage = '!Hola Juan Perez! Somos Refugio Amigo y vimos que hiciste match con Firulais. Nos gustaria conversar contigo sobre el proceso de adopcion.';
        const encodedMessage = encodeURIComponent(expectedMessage);
        expect(result.data.enlace_whatsapp).toContain(`text=${encodedMessage}`);
    });
});
