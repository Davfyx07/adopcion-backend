const { Pool } = require('pg');

const databaseUrl = process.env.DB_URL || process.env.DB_HOST;
const usesConnectionString = typeof databaseUrl === 'string' && /^postgres(ql)?:\/\//i.test(databaseUrl);

const sslEnabled = usesConnectionString
    ? databaseUrl.includes('azure') || databaseUrl.includes('sslmode=require')
    : process.env.DB_HOST && process.env.DB_HOST.includes('azure');

const pool = new Pool({
    ...(usesConnectionString
        ? { connectionString: databaseUrl }
        : {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 5432,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
        }),
    max: 10,
    idleTimeoutMillis: 30000,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err);
});

module.exports = pool;