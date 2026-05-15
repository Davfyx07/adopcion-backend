const cron = require('node-cron');
const { limpiarNotificacionesAntiguas } = require('../services/notificacionService');

// ──────────────────────────────────────────────
// Job de limpieza de notificaciones antiguas
//
// Ejecuta diariamente a las 3:00 AM.
// Elimina notificaciones con fecha_creacion < NOW() - 30 días.
// Registra en consola la cantidad eliminada.
// ──────────────────────────────────────────────

const iniciarJobLimpieza = () => {
    // Expresión cron: 0 3 * * * → cada día a las 03:00 AM
    cron.schedule('0 3 * * *', async () => {
        console.log(`[notificacionCleanupJob] Iniciando limpieza de notificaciones antiguas — ${new Date().toISOString()}`);
        try {
            const { eliminadas } = await limpiarNotificacionesAntiguas();
            console.log(`[notificacionCleanupJob] Limpieza completada: ${eliminadas} notificaciones eliminadas.`);
        } catch (err) {
            console.error('[notificacionCleanupJob] Error durante la limpieza:', err.message);
        }
    }, {
        timezone: 'America/Bogota',
    });

    console.log('[notificacionCleanupJob] Job de limpieza registrado — se ejecuta diariamente a las 3:00 AM (America/Bogota).');
};

module.exports = { iniciarJobLimpieza };
