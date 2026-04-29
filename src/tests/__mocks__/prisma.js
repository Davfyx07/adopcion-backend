/**
 * Mock de PrismaClient para tests unitarios.
 *
 * Reemplaza la instancia real de Prisma (con soft-delete middleware,
 * $extends, etc.) por un objeto con métodos jest.fn() para cada
 * modelo y helper usado por los servicios.
 *
 * Uso en cada test:
 *   jest.mock('../config/prisma', () => require('./__mocks__/prisma'));
 *   const prisma = require('../config/prisma');
 *
 * Características:
 * - $transaction(fn) ejecuta fn(prisma) y retorna el resultado
 * - $queryRaw es un jest.fn() que retorna [] por defecto
 * - Cada modelo expone: findUnique, findMany, findFirst, create,
 *   update, delete, count, deleteMany, createMany, updateMany
 * - withSoftDeleted(fn) ejecuta fn(prisma)
 *
 * Para resetear entre tests:
 *   beforeEach(() => { jest.clearAllMocks(); });
 *   // o con jest-mock-extended: mockReset(prisma);
 */

const createModelMock = () => ({
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
    updateMany: jest.fn(),
    findFirstOrThrow: jest.fn(),
    upsert: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
});

const prisma = {
    // ── Transacciones ──────────────────────────────────────────
    // Ejecuta el callback pasándole el propio prisma como "tx".
    // Si el callback lanza, la promesa se rechaza.
    $transaction: jest.fn(async (fn) => {
        if (typeof fn === 'function') {
            return fn(prisma);
        }
        // $transaction también acepta un array de queries (interactive vs batch)
        return Promise.all(fn);
    }),

    // ── Raw queries ────────────────────────────────────────────
    $queryRaw: jest.fn().mockResolvedValue([]),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue([]),
    $executeRawUnsafe: jest.fn().mockResolvedValue([]),

    // ── Conexión ───────────────────────────────────────────────
    $connect: jest.fn(),
    $disconnect: jest.fn(),

    // ── Soft-delete helper (custom de config/prisma.js) ────────
    withSoftDeleted: jest.fn(async (callback) => {
        return callback(prisma);
    }),

    // ── Flag de bypass (usado internamente por config/prisma.js) ─
    _bypassSoftDelete: false,

    // ── Modelos ────────────────────────────────────────────────
    usuario: createModelMock(),
    rol: createModelMock(),
    adoptante: createModelMock(),
    albergue: createModelMock(),
    mascota: createModelMock(),
    mascota_foto: createModelMock(),
    mascota_tag: createModelMock(),
    opcion_tag: createModelMock(),
    tag: createModelMock(),
    termino_aceptado: createModelMock(),
    log_auditoria: createModelMock(),
    recuperacion_password: createModelMock(),
    blacklist_token: createModelMock(),
    match: createModelMock(),
    notificacion: createModelMock(),
    historial_whatsapp_albergue: createModelMock(),
    adoptante_tag: createModelMock(),
    adopcion: createModelMock(),
    descarte: createModelMock(),
    envio_notificacion: createModelMock(),
    configuracion_sistema: createModelMock(),
};

module.exports = prisma;
