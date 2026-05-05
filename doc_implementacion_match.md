# Implementación del Motor de Matching (HU-MT-01)

## Arquitectura de Matching

Se implementó un **motor de scoring por aritmética ponderada** basado en tags. Cada tag en el sistema tiene un `peso_matching` configurable y un flag `es_filtro_absoluto`. El algoritmo reemplaza el anterior Jaccard index simple que estaba en `mascotaService.calcularCompatibilidad`.

### Servicio de Match

| Archivo | Propósito |
|---------|-----------|
| `src/services/matchService.js` | Lógica central del matching: scoring, filtros absolutos, persistencia |

### Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `src/index.js` | Registro de la ruta `app.use('/api/match', matchRoutes)` |

### Endpoints

| Método | Ruta | Auth | Rol | Descripción |
|--------|------|------|-----|-------------|
| `POST` | `/api/match/calcular/:id_adoptante` | JWT | adoptante | Ejecuta el motor de matching y persiste resultados |
| `GET` | `/api/match` | JWT | adoptante | Obtiene los matches del adoptante autenticado |
| `POST` | `/api/match/descartar/:id_mascota` | JWT | adoptante | Descarta una mascota y elimina su match pendiente |

Los endpoints están documentados en Swagger accesible en `/api-docs`.

---

## Algoritmo de Scoring

### Fórmula

```
Puntaje = (suma_obtenida / suma_total_pesos_adoptante) * 100
```

Donde:
- **suma_obtenida**: suma de `peso_matching` de los tags del adoptante que coinciden EXACTAMENTE con los de la mascota (mismo `id_opcion`)
- **suma_total_pesos_adoptante**: suma de todos los `peso_matching` del adoptante (excluyendo filtros absolutos)

### Flujo de cálculo

1. **Obtener preferencias del adoptante** — tags y opciones seleccionadas
2. **Obtener detalle de cada tag** — peso, filtro absoluto (JOIN con `opcion_tag` y `tag`)
3. **Excluir mascotas descartadas** — consulta tabla `Descarte`
4. **Filtrar solo mascotas disponibles** — `estado_adopcion = 'disponible'`
5. **Para cada mascota**:
   - **Validar filtros absolutos**: si un tag del adoptante tiene `es_filtro_absoluto=true`, la mascota DEBE tener al menos una opción de ese tag. Si no → mascota excluida.
   - **Calcular coincidencias**: por cada tag del adoptante (no filtro absoluto), si el mismo `id_opcion` existe en la mascota, se acumula su `peso_matching`.
   - **Normalizar**: dividir entre la suma total de pesos del adoptante.
6. **Aplicar umbral del 30%**: solo se incluyen mascotas con compatibilidad ≥ 30%
7. **Ordenar** por puntaje descendente
8. **Persistir**: dentro de una transacción:
   - Eliminar matches previos en estado `pendiente` para ese adoptante
   - Insertar nuevos matches
9. **Retornar** lista ordenada

---

### Ejemplo

**Tags disponibles:**

| Tag | `peso_matching` | `es_filtro_absoluto` |
|-----|----------------|---------------------|
| Tipo de animal | 0 | true |
| Nivel de Energía | 50 | false |
| Tamaño | 30 | false |
| Tiempo disponible | 20 | false |

**Adoptante** busca: Perro (filtro), Energía Baja (50pts), Tamaño Grande (30pts), Tiempo Mucho (20pts). Suma total = 100.

**Mascota "Luna"**: Perro ✅, Energía Baja ✅ (50), Tamaño Mediano ❌ (0), Tiempo Mucho ✅ (20).

**Cálculo**: `(50 + 0 + 20) / 100 × 100 = 70%` → supera umbral → se guarda en `Match`.

---

## Reglas de Negocio

| Regla | Condición | Acción |
|-------|-----------|--------|
| Filtro absoluto | `es_filtro_absoluto = true` en tag del adoptante | La mascota debe tener ese tag. Si no → excluir |
| Exclusión por descarte | Registro en `Descarte` con mismo adoptante | No procesar ni mostrar esa mascota |
| Disponibilidad | `estado_adopcion = 'disponible'` | Solo incluir mascotas disponibles |
| Umbral de éxito | Puntaje ≥ 30% | Persistir en `Match` y retornar en respuesta |
| Limpieza | Previo al cálculo | Eliminar matches `pendiente` del adoptante |

---

## Funciones exportadas del matchService

| Función | Parámetros | Descripción |
|---------|-------------|-------------|
| `calcularCompatibilidad(idAdoptante)` | `Int` | Ejecuta el motor completo: scoring, limpieza y persistencia |
| `limpiarMatchesPendientes(idAdoptante)` | `Int` | Elimina matches en estado pendiente |
| `registrarMatch({ idAdoptante, idMascota, puntaje })` | `Object` | Crea un match individual con notificación al albergue |
| `obtenerMatches(idAdoptante)` | `Int` | Lista todos los matches del adoptante con datos completos |
| `descartarMascota(idAdoptante, idMascota)` | `Int, Int` | Descarta y elimina match pendiente |

---

## Cómo probar

### Tests unitarios

```bash
npx jest src/tests/matchService.test.js --verbose
```

Cubren 9 escenarios:
- Adoptante sin tags → retorna `[]`
- Cálculo ponderado correcto (pesos, coincidencias, normalización)
- Exclusión por filtro absoluto no cumplido
- Exclusión por mascota descartada
- Umbral mínimo no alcanzado → no persiste
- Persistencia en `Match` (deleteMany + createMany)
- `descartarMascota`: mascota inexistente, ya descartada, éxito

### Prueba manual (Postman)

**1. Calcular matching:**
```
POST /api/match/calcular/1
Authorization: Bearer <token_adoptante>
```

**2. Ver matches del adoptante:**
```
GET /api/match
Authorization: Bearer <token_adoptante>
```

**3. Descartar mascota:**
```
POST /api/match/descartar/5
Authorization: Bearer <token_adoptante>
```

**4. Swagger UI:**
```
GET /api-docs
```

---

## Notas técnicas

- **No se modificó `schema.prisma`** — se respeta la restricción del proyecto
- **No se requieren migraciones** — los modelos `Match`, `Descarte`, `AdoptanteTag`, `MascotaTag` ya existen
- **Los índices ya existen** en `match` (id_adoptante, estado, fecha, id_mascota) y en `mascota_tag` (PK compuesta)
- Las consultas batch usan `$queryRaw` con parámetros vinculados (seguro contra inyección SQL)
- La foto principal se obtiene con `DISTINCT ON (id_mascota) ORDER BY orden ASC`
- Los tags de detalle se obtienen en una sola consulta JOIN por lote de mascotas
