/**
 * Benchmark de rendimiento para HU-MT-01: Motor de Matching
 *
 * Mide el tiempo de ejecución de la función calcularCompatibilidad
 * simulando diferentes volúmenes de mascotas (100, 1.000, 5.000, 10.000).
 *
 * Uso:
 *   node src/benchmarks/matchBenchmark.js
 *
 * Requiere variables de entorno configuradas (DATABASE_URL, REDIS_URL opcional).
 */

require('dotenv').config();

const matchService = require('../services/matchService');
const prisma = require('../config/prisma');

// ─── Helpers ───────────────────────────────────────────

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Genera un vector de embedding aleatorio de 384 dimensiones
 * (dimension típica usada por el sistema con pgvector).
 */
const generarEmbedding = () => {
    const dims = 384;
    const vec = [];
    for (let i = 0; i < dims; i++) {
        vec.push((Math.random() * 2 - 1).toFixed(6));
    }
    return `[${vec.join(',')}]`;
};

/**
 * Crea mascotas de prueba con embedding para un albergue dado.
 */
const crearMascotasBenchmark = async (idAlbergue, cantidad) => {
    const mascotas = [];
    for (let i = 0; i < cantidad; i++) {
        mascotas.push({
            id_albergue: idAlbergue,
            nombre: `MascotaBenchmark_${i}`,
            descripcion: 'Generada para benchmark',
            estado_adopcion: 'disponible',
        });
    }

    // Insertar en batch de 500 para no saturar Prisma
    const batchSize = 500;
    const creadas = [];
    for (let i = 0; i < mascotas.length; i += batchSize) {
        const batch = mascotas.slice(i, i + batchSize);
        const result = await prisma.mascota.createMany({
            data: batch,
            skipDuplicates: false,
        });
        // Recuperar IDs insertados
        const ultimas = await prisma.mascota.findMany({
            where: {
                id_albergue: idAlbergue,
                nombre: { in: batch.map(m => m.nombre) },
            },
            select: { id_mascota: true },
        });
        creadas.push(...ultimas);
    }

    // Asignar embeddings via SQL raw (Prisma no soporta vector nativamente)
    for (const m of creadas) {
        await prisma.$executeRaw`
            UPDATE mascota SET embedding = ${generarEmbedding()}::vector
            WHERE id_mascota = ${m.id_mascota}
        `;
    }

    return creadas.map(m => m.id_mascota);
};

/**
 * Crea un adoptante de prueba con embedding.
 */
const crearAdoptanteBenchmark = async () => {
    // Buscar o crear usuario base
    let usuario = await prisma.usuario.findFirst({
        where: { correo: 'benchmark@furmatch.test' },
    });

    if (!usuario) {
        usuario = await prisma.usuario.create({
            data: {
                correo: 'benchmark@furmatch.test',
                contrasena_hash: '$2b$10$fakehashforbenchmark',
                rol: 'adoptante',
                verificado: true,
            },
        });

        await prisma.adoptante.create({
            data: {
                id_usuario: usuario.id_usuario,
                nombre_completo: 'Usuario Benchmark',
            },
        });
    }

    await prisma.$executeRaw`
        UPDATE adoptante SET embedding = ${generarEmbedding()}::vector
        WHERE id_usuario = ${usuario.id_usuario}
    `;

    return usuario.id_usuario;
};

/**
 * Crea un albergue de prueba.
 */
const crearAlbergueBenchmark = async () => {
    let usuario = await prisma.usuario.findFirst({
        where: { correo: 'albergue_benchmark@furmatch.test' },
    });

    if (!usuario) {
        usuario = await prisma.usuario.create({
            data: {
                correo: 'albergue_benchmark@furmatch.test',
                contrasena_hash: '$2b$10$fakehashforbenchmark',
                rol: 'albergue',
                verificado: true,
            },
        });

        await prisma.albergue.create({
            data: {
                id_usuario: usuario.id_usuario,
                nombre_albergue: 'Albergue Benchmark',
            },
        });
    }

    return usuario.id_usuario;
};

/**
 * Limpia datos de benchmark.
 */
const limpiarBenchmark = async (idAlbergue, idAdoptante, idsMascotas) => {
    await prisma.mascota.deleteMany({
        where: { id_mascota: { in: idsMascotas } },
    });
    await prisma.descarte.deleteMany({
        where: { id_adoptante: idAdoptante },
    });
    await prisma.match.deleteMany({
        where: {
            OR: [
                { id_adoptante: idAdoptante },
                { id_mascota: { in: idsMascotas } },
            ],
        },
    });
};

// ─── Benchmark Principal ───────────────────────────────

const runBenchmark = async () => {
    console.log('\n========================================');
    console.log('  BENCHMARK: HU-MT-01 Matching Engine');
    console.log('========================================\n');

    const idAlbergue = await crearAlbergueBenchmark();
    const idAdoptante = await crearAdoptanteBenchmark();

    const volumenes = [100, 1000, 5000, 10000];
    const resultados = [];

    for (const cantidad of volumenes) {
        console.log(`\n--- Volumen: ${cantidad} mascotas ---`);

        // Crear datos
        console.log('  Creando mascotas de prueba...');
        const idsMascotas = await crearMascotasBenchmark(idAlbergue, cantidad);
        console.log(`  ${idsMascotas.length} mascotas creadas con embedding.`);

        // Calentar cache (si aplica)
        console.log('  Calentando cache (1ra ejecución)...');
        const t0 = Date.now();
        await matchService.calcularCompatibilidad(idAdoptante);
        const t1 = Date.now();
        console.log(`  1ra ejecución: ${(t1 - t0).toFixed(2)} ms`);

        // Ejecuciones repetidas
        const repeticiones = 5;
        const tiempos = [];
        for (let r = 0; r < repeticiones; r++) {
            const start = Date.now();
            const matches = await matchService.calcularCompatibilidad(idAdoptante);
            const end = Date.now();
            tiempos.push(end - start);
            console.log(`  Ejecución ${r + 1}: ${end - start} ms | Matches: ${matches.length}`);
        }

        const promedio = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
        const min = Math.min(...tiempos);
        const max = Math.max(...tiempos);

        console.log(`  → Promedio: ${promedio.toFixed(2)} ms | Min: ${min} ms | Max: ${max} ms`);

        resultados.push({
            volumen: cantidad,
            promedio_ms: promedio.toFixed(2),
            min_ms: min,
            max_ms: max,
            cumple_2s: promedio < 2000 ? '✅ SI' : '❌ NO',
        });

        // Limpiar antes del siguiente volumen
        console.log('  Limpiando datos de prueba...');
        await limpiarBenchmark(idAlbergue, idAdoptante, idsMascotas);
        await sleep(500);
    }

    // Resumen final
    console.log('\n========================================');
    console.log('  RESUMEN');
    console.log('========================================');
    console.table(resultados);

    // Criterio de aceptación HU-MT-01
    const todosCumplen = resultados.every(r => parseFloat(r.promedio_ms) < 2000);
    if (todosCumplen) {
        console.log('\n✅ Todos los volúmenes cumplen con el criterio < 2 segundos.');
    } else {
        console.log('\n⚠️  Algunos volúmenes exceden los 2 segundos. Considerar optimización.');
    }

    await prisma.$disconnect();
    process.exit(0);
};

runBenchmark().catch(async (err) => {
    console.error('Error en benchmark:', err);
    await prisma.$disconnect();
    process.exit(1);
});
