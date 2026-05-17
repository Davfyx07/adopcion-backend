# Cambios — Centro de Notificaciones

## Archivos modificados

### `src/services/notificacionService.js`

| Qué cambió | Detalle |
|---|---|
| `obtenerNotificaciones` | Agregado filtro por `tipo`, paginación (`page`, `limit` default 20), campo `leida` como booleano, campo `titulo` derivado del tipo, objeto `meta` con `total` y `pages`. Las tres queries se ejecutan en paralelo con `Promise.all`. |
| `marcarLeida` | Ahora retorna la notificación actualizada completa en `result.data` en lugar de solo `{ success: true }`. |
| Nueva función `limpiarNotificacionesAntiguas` | Elimina notificaciones con `fecha_creacion < NOW() - 30 días`. Retorna `{ success, eliminadas }`. |
| Nueva función exportada `derivarTitulo` | Convierte `tipo_notificacion` a un título legible. Exportada para poder testearse directamente. |

### `src/controllers/notificacionController.js`

| Qué cambió | Detalle |
|---|---|
| `getNotificaciones` | Lee `tipo`, `page`, `limit` desde query params. Retorna `meta` de paginación en la respuesta. |
| `marcarNotificacionLeida` | Agrega validación de ID (400 si no es entero positivo). Retorna `data` con la notificación actualizada. |
| `marcarTodasLeidasController` → renombrado a `leerTodasController` | Sin cambios de lógica, solo renombre interno para consistencia. Exportado como `leerTodas`. |

### `src/routes/notificacionRoutes.js`

| Qué cambió | Detalle |
|---|---|
| Ruta `PATCH /leidas` eliminada | Reemplazada por `PATCH /leer-todas` para mayor claridad semántica. |
| Nueva ruta `PATCH /leer-todas` | Registrada **antes** de `/:id/leida` para evitar que Express interprete `leer-todas` como parámetro `:id`. |
| Swagger actualizado | Documentación completa para los tres endpoints con query params, body y respuestas. |

### `src/index.js`

| Qué cambió | Detalle |
|---|---|
| Import de `iniciarJobLimpieza` | Agregado `require('./jobs/notificacionCleanupJob')`. |
| Llamada al job | `iniciarJobLimpieza()` invocado después de registrar rutas, antes de `app.listen`. |

---

## Archivos creados

### `src/jobs/notificacionCleanupJob.js`

Job programado con `node-cron`. Expresión `0 3 * * *` (3:00 AM diario, zona `America/Bogota`). Llama a `limpiarNotificacionesAntiguas()` y registra el resultado en consola.

### `src/tests/notificacionCentro.test.js`

33 tests nuevos distribuidos en 6 grupos:

- Lista de notificaciones (9)
- Filtros por tipo (6)
- Marcar como leída individualmente (5)
- Validación de pertenencia (3)
- Marcar todas como leídas (4)
- Job de limpieza (5)

---

## Dependencia instalada

```
node-cron
```
