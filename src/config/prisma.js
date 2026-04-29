const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = process.env.DATABASE_URL;

const adapter = new PrismaPg({ connectionString });

// ──────────────────────────────────────────────
// Base PrismaClient (sin middleware)
// ──────────────────────────────────────────────
const basePrisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
});

basePrisma.$on('error', (e) => {
    console.error('Prisma Client error:', e.message);
});

// Flag para bypassear soft-delete (usado por withSoftDeleted)
basePrisma._bypassSoftDelete = false;

// ──────────────────────────────────────────────
// Soft-Delete Middleware (Fase 4.1)
//
// Intercepta findUnique / findMany / findFirst / count
// en modelos con campo `deleted_at` y agrega automáticamente
// `where: { deleted_at: null }`.
//
// Modelos afectados: Usuario, Adoptante, Albergue, Mascota
//
// Para queries de admin/auditoría que necesiten ver registros
// borrados, usar el helper `prisma.withSoftDeleted(callback)`.
//
// Si el usuario especifica `deleted_at` explícitamente en el where,
// se respeta su valor (no se sobreescribe).
// ──────────────────────────────────────────────

const SOFT_DELETE_MODELS = ['Usuario', 'Adoptante', 'Albergue', 'Mascota'];
const SOFT_DELETE_ACTIONS = ['findUnique', 'findMany', 'findFirst', 'count'];

const softDeleteExtension = basePrisma.$extends({
    query: {
        $allModels: {
            async findUnique({ args, query, model }) {
                if (
                    SOFT_DELETE_MODELS.includes(model) &&
                    !basePrisma._bypassSoftDelete
                ) {
                    if (!args.where) args.where = {};
                    if (args.where.deleted_at === undefined) {
                        args.where.deleted_at = null;
                    }
                }
                return query(args);
            },
            async findMany({ args, query, model }) {
                if (
                    SOFT_DELETE_MODELS.includes(model) &&
                    !basePrisma._bypassSoftDelete
                ) {
                    if (!args.where) args.where = {};
                    if (args.where.deleted_at === undefined) {
                        args.where.deleted_at = null;
                    }
                }
                return query(args);
            },
            async findFirst({ args, query, model }) {
                if (
                    SOFT_DELETE_MODELS.includes(model) &&
                    !basePrisma._bypassSoftDelete
                ) {
                    if (!args.where) args.where = {};
                    if (args.where.deleted_at === undefined) {
                        args.where.deleted_at = null;
                    }
                }
                return query(args);
            },
            async count({ args, query, model }) {
                if (
                    SOFT_DELETE_MODELS.includes(model) &&
                    !basePrisma._bypassSoftDelete
                ) {
                    if (!args.where) args.where = {};
                    if (args.where.deleted_at === undefined) {
                        args.where.deleted_at = null;
                    }
                }
                return query(args);
            },
        },
    },
});

/**
 * Helper para ejecutar queries sin filtro de soft-delete.
 * Útil para administración/auditoría cuando se necesita ver registros borrados.
 *
 * @param {Function} callback - async (prisma) => { ... }
 * @returns {Promise<any>} Resultado del callback
 *
 * @example
 * const todosLosUsuarios = await prisma.withSoftDeleted(async (p) => {
 *     return p.usuario.findMany();
 * });
 */
softDeleteExtension.withSoftDeleted = async (callback) => {
    basePrisma._bypassSoftDelete = true;
    try {
        return await callback(softDeleteExtension);
    } finally {
        basePrisma._bypassSoftDelete = false;
    }
};

module.exports = softDeleteExtension;
