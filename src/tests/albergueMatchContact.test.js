/**
 * Tests para albergueMatchController — contactarAdoptante + obtenerHistorialContactos (HU-MCH-02)
 * - Contactar adoptante vía WhatsApp
 * - Obtener historial de contactos de un match
 */
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));
jest.mock('../config/redis', () => null);

const prisma = require('../config/prisma');
const albergueMatchController = require('../controllers/albergueMatchController');
const matchService = require('../services/matchService');

const ID_ALBERGUE = 100;
const ID_MATCH = 1;

// Helper para crear mock req/res
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('albergueMatchController — contactarAdoptante (HU-MCH-02)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 200 con enlace_whatsapp cuando el contacto es exitoso', async () => {
    const req = {
      user: { id: ID_ALBERGUE },
      params: { id: String(ID_MATCH) },
    };
    const res = mockRes();

    jest.spyOn(matchService, 'contactarAdoptante').mockResolvedValueOnce({
      success: true,
      data: {
        enlace_whatsapp: 'https://wa.me/573001234567?text=Hola',
        estado: 'contactado',
      },
    });

    await albergueMatchController.contactarAdoptante(req, res);

    expect(matchService.contactarAdoptante).toHaveBeenCalledWith(ID_ALBERGUE, ID_MATCH);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          enlace_whatsapp: expect.any(String),
        }),
      })
    );
  });

  it('retorna 404 cuando el match no existe', async () => {
    const req = {
      user: { id: ID_ALBERGUE },
      params: { id: '999' },
    };
    const res = mockRes();

    jest.spyOn(matchService, 'contactarAdoptante').mockResolvedValueOnce({
      success: false,
      status: 404,
      message: 'Match no encontrado.',
    });

    await albergueMatchController.contactarAdoptante(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('retorna 403 cuando el albergue no es dueño de la mascota', async () => {
    const req = {
      user: { id: ID_ALBERGUE },
      params: { id: String(ID_MATCH) },
    };
    const res = mockRes();

    jest.spyOn(matchService, 'contactarAdoptante').mockResolvedValueOnce({
      success: false,
      status: 403,
      message: 'No tienes permiso para contactar este match.',
    });

    await albergueMatchController.contactarAdoptante(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('retorna 400 cuando el adoptante no tiene WhatsApp', async () => {
    const req = {
      user: { id: ID_ALBERGUE },
      params: { id: String(ID_MATCH) },
    };
    const res = mockRes();

    jest.spyOn(matchService, 'contactarAdoptante').mockResolvedValueOnce({
      success: false,
      status: 400,
      message: 'El adoptante no tiene un número de WhatsApp registrado.',
    });

    await albergueMatchController.contactarAdoptante(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('retorna 400 cuando el ID de match es inválido', async () => {
    const req = {
      user: { id: ID_ALBERGUE },
      params: { id: 'abc' },
    };
    const res = mockRes();

    await albergueMatchController.contactarAdoptante(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('inválido'),
      })
    );
  });
});

describe('albergueMatchController — obtenerHistorialContactos (HU-MCH-02)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna lista de contactos cuando el match existe', async () => {
    const req = {
      user: { id: ID_ALBERGUE },
      params: { id: String(ID_MATCH) },
    };
    const res = mockRes();

    const mockContactos = [
      { id_contacto: 1, id_match: ID_MATCH, id_albergue: ID_ALBERGUE, fecha_enlace: new Date('2024-03-01') },
      { id_contacto: 2, id_match: ID_MATCH, id_albergue: ID_ALBERGUE, fecha_enlace: new Date('2024-03-15') },
    ];

    prisma.match.findUnique.mockResolvedValueOnce({
      id_match: ID_MATCH,
      mascota: { id_albergue: ID_ALBERGUE },
    });
    prisma.contactoWhatsapp.findMany.mockResolvedValueOnce(mockContactos);

    await albergueMatchController.obtenerHistorialContactos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id_contacto: 1 }),
          expect.objectContaining({ id_contacto: 2 }),
        ]),
      })
    );
  });

  it('retorna lista vacía cuando no hay contactos registrados', async () => {
    const req = {
      user: { id: ID_ALBERGUE },
      params: { id: String(ID_MATCH) },
    };
    const res = mockRes();

    prisma.match.findUnique.mockResolvedValueOnce({
      id_match: ID_MATCH,
      mascota: { id_albergue: ID_ALBERGUE },
    });
    prisma.contactoWhatsapp.findMany.mockResolvedValueOnce([]);

    await albergueMatchController.obtenerHistorialContactos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: [],
      })
    );
  });

  it('retorna 404 cuando el match no existe', async () => {
    const req = {
      user: { id: ID_ALBERGUE },
      params: { id: '999' },
    };
    const res = mockRes();

    prisma.match.findUnique.mockResolvedValueOnce(null);

    await albergueMatchController.obtenerHistorialContactos(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('retorna 403 cuando el albergue no es dueño de la mascota', async () => {
    const req = {
      user: { id: ID_ALBERGUE },
      params: { id: String(ID_MATCH) },
    };
    const res = mockRes();

    prisma.match.findUnique.mockResolvedValueOnce({
      id_match: ID_MATCH,
      mascota: { id_albergue: 999 }, // otro albergue
    });

    await albergueMatchController.obtenerHistorialContactos(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('retorna 400 cuando el ID de match es inválido', async () => {
    const req = {
      user: { id: ID_ALBERGUE },
      params: { id: 'invalid' },
    };
    const res = mockRes();

    await albergueMatchController.obtenerHistorialContactos(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
