// ──────────────────────────────────────────────
// Mock de Prisma (reemplaza instancia real)
// ──────────────────────────────────────────────
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
const request = require('supertest');
const express = require('express');
const adminStatsRoutes = require('../routes/adminStatsRoutes');

// ── Auth middleware mocks ──────────────────────────────────────
// Default: authenticated administrador
jest.mock('../middlewares/authMiddleware', () => (req, res, next) => {
    req.user = { id: 1, role: 'administrador' };
    next();
});
jest.mock('../middlewares/authorizeRole', () =>
    jest.requireActual('../middlewares/authorizeRole')
);

// ── App ────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use((req, res, next) => {
    req.socket = { remoteAddress: '127.0.0.1' };
    next();
});
app.use('/api', adminStatsRoutes);

// ── Fixtures ───────────────────────────────────────────────────
const rawMesesFixture = [
    { mes: new Date('2026-04-01T00:00:00Z'), total: 3 },
    { mes: new Date('2026-05-01T00:00:00Z'), total: 5 },
];

const rawRankingFixture = [
    { nombre: 'Albergue Esperanza', adopciones: 10 },
    { nombre: 'Patitas Felices',    adopciones: 7 },
];

/**
 * Configura todos los mocks de Prisma para que getEstadisticas() resuelva
 * satisfactoriamente con datos de prueba coherentes.
 */
const setupHappyPath = () => {
    // usuario.count — se llama 8 veces en Promise.all
    prisma.usuario.count
        .mockResolvedValueOnce(50)  // total_adoptantes
        .mockResolvedValueOnce(40)  // adoptantes_activos
        .mockResolvedValueOnce(8)   // adoptantes_inactivos
        .mockResolvedValueOnce(20)  // total_albergues
        .mockResolvedValueOnce(18)  // albergues_activos
        .mockResolvedValueOnce(2)   // suspendidos
        .mockResolvedValueOnce(65)  // totalConPerfil
        .mockResolvedValueOnce(72); // totalUsuarios

    // mascota.count — se llama 5 veces
    prisma.mascota.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(60)  // disponible
        .mockResolvedValueOnce(15)  // en_proceso
        .mockResolvedValueOnce(20)  // adoptado
        .mockResolvedValueOnce(5);  // archivado

    // match y adopcion counts
    prisma.match.count.mockResolvedValueOnce(200);
    prisma.adopcion.count.mockResolvedValueOnce(20);

    // $queryRaw — primera llamada = meses, segunda = ranking
    prisma.$queryRaw
        .mockResolvedValueOnce(rawMesesFixture)
        .mockResolvedValueOnce(rawRankingFixture);
};

// ──────────────────────────────────────────────
// Suite principal
// ──────────────────────────────────────────────
describe('HU-ADM-DASHBOARD: GET /api/admin/estadisticas', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ─────────────────────────────────────────
    // 1. Happy path — 200 con la forma correcta
    // ─────────────────────────────────────────
    describe('200 — respuesta exitosa', () => {
        it('debe retornar 200 con success: true', async () => {
            setupHappyPath();

            const res = await request(app).get('/api/admin/estadisticas');

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('debe incluir la sección usuarios con todas sus claves', async () => {
            setupHappyPath();

            const res = await request(app).get('/api/admin/estadisticas');
            const { usuarios } = res.body.data;

            expect(usuarios).toMatchObject({
                total_adoptantes:    expect.any(Number),
                adoptantes_activos:  expect.any(Number),
                adoptantes_inactivos: expect.any(Number),
                total_albergues:     expect.any(Number),
                albergues_activos:   expect.any(Number),
                suspendidos:         expect.any(Number),
                tasa_completitud:    expect.any(Number),
            });
        });

        it('debe calcular tasa_completitud como porcentaje entero', async () => {
            setupHappyPath();

            const res = await request(app).get('/api/admin/estadisticas');
            // 65 con perfil / 72 total = 90.27... → Math.round = 90
            expect(res.body.data.usuarios.tasa_completitud).toBe(90);
        });

        it('debe incluir la sección mascotas con por_estado', async () => {
            setupHappyPath();

            const res = await request(app).get('/api/admin/estadisticas');
            const { mascotas } = res.body.data;

            expect(mascotas).toMatchObject({
                total: expect.any(Number),
                por_estado: {
                    disponible: expect.any(Number),
                    en_proceso: expect.any(Number),
                    adoptado:   expect.any(Number),
                    archivado:  expect.any(Number),
                },
            });
        });

        it('debe incluir la sección matching con adopciones_por_mes', async () => {
            setupHappyPath();

            const res = await request(app).get('/api/admin/estadisticas');
            const { matching } = res.body.data;

            expect(matching).toMatchObject({
                total_matches:    expect.any(Number),
                total_adopciones: expect.any(Number),
                adopciones_por_mes: expect.any(Array),
            });
        });

        it('cada entrada de adopciones_por_mes debe tener { mes, total }', async () => {
            setupHappyPath();

            const res = await request(app).get('/api/admin/estadisticas');
            const { adopciones_por_mes } = res.body.data.matching;

            expect(adopciones_por_mes.length).toBe(2);
            adopciones_por_mes.forEach((entry) => {
                expect(entry).toMatchObject({
                    mes:   expect.any(String),
                    total: expect.any(Number),
                });
            });
        });

        it('debe mapear correctamente el nombre del mes', async () => {
            setupHappyPath();

            const res = await request(app).get('/api/admin/estadisticas');
            const meses = res.body.data.matching.adopciones_por_mes.map((e) => e.mes);

            // rawMesesFixture usa Abril y Mayo
            expect(meses).toContain('Abr');
            expect(meses).toContain('May');
        });

        it('debe incluir albergues_ranking como array con { nombre, adopciones }', async () => {
            setupHappyPath();

            const res = await request(app).get('/api/admin/estadisticas');
            const { albergues_ranking } = res.body.data;

            expect(albergues_ranking.length).toBe(2);
            albergues_ranking.forEach((entry) => {
                expect(entry).toMatchObject({
                    nombre:     expect.any(String),
                    adopciones: expect.any(Number),
                });
            });
        });

        it('debe retornar los valores numéricos correctos del fixture', async () => {
            setupHappyPath();

            const res = await request(app).get('/api/admin/estadisticas');
            const { data } = res.body;

            expect(data.usuarios.total_adoptantes).toBe(50);
            expect(data.mascotas.total).toBe(100);
            expect(data.matching.total_matches).toBe(200);
            expect(data.matching.total_adopciones).toBe(20);
            expect(data.albergues_ranking[0].nombre).toBe('Albergue Esperanza');
            expect(data.albergues_ranking[0].adopciones).toBe(10);
        });

        it('debe retornar tasa_completitud = 0 cuando no hay usuarios', async () => {
            // totalConPerfil = 0, totalUsuarios = 0
            prisma.usuario.count
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0); // totalUsuarios = 0

            prisma.mascota.count
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0)
                .mockResolvedValueOnce(0);

            prisma.match.count.mockResolvedValueOnce(0);
            prisma.adopcion.count.mockResolvedValueOnce(0);
            prisma.$queryRaw
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([]);

            const res = await request(app).get('/api/admin/estadisticas');
            expect(res.status).toBe(200);
            expect(res.body.data.usuarios.tasa_completitud).toBe(0);
        });

        it('debe retornar adopciones_por_mes = [] si no hay datos', async () => {
            prisma.usuario.count
                .mockResolvedValue(10);
            prisma.mascota.count
                .mockResolvedValue(5);
            prisma.match.count.mockResolvedValue(0);
            prisma.adopcion.count.mockResolvedValue(0);
            prisma.$queryRaw
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([]);

            const res = await request(app).get('/api/admin/estadisticas');
            expect(res.body.data.matching.adopciones_por_mes).toEqual([]);
        });
    });

    // ─────────────────────────────────────────
    // 2. 403 para roles no administrador
    // Usamos el authorizeRole real aplicado directamente sobre la ruta de prueba,
    // sin depender de jest.mock() con variables de closure (no permitido por Jest).
    // ─────────────────────────────────────────
    describe('403 — acceso denegado a roles no autorizados', () => {
        const authorizeRoleReal = require('../middlewares/authorizeRole');
        const { getEstadisticas: ctrl } = require('../controllers/adminStatsController');

        const buildAppForRole = (role) => {
            const testApp = express();
            testApp.use(express.json());
            // Inyecta el rol directamente sin pasar por authMiddleware
            testApp.use((req, _res, next) => {
                req.user = { id: 99, role };
                next();
            });
            testApp.get(
                '/api/admin/estadisticas',
                authorizeRoleReal(['administrador']),
                ctrl
            );
            return testApp;
        };

        it('debe retornar 403 para rol adoptante', async () => {
            const res = await request(buildAppForRole('adoptante')).get('/api/admin/estadisticas');
            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        it('debe retornar 403 para rol albergue', async () => {
            const res = await request(buildAppForRole('albergue')).get('/api/admin/estadisticas');
            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });
    });

    // ─────────────────────────────────────────
    // 3. 500 cuando el servicio lanza error
    // ─────────────────────────────────────────
    describe('500 — error interno', () => {
        it('debe retornar 500 con success: false cuando prisma falla', async () => {
            prisma.usuario.count.mockRejectedValueOnce(new Error('DB connection lost'));

            const res = await request(app).get('/api/admin/estadisticas');

            expect(res.status).toBe(500);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('DB connection lost');
        });
    });
});
