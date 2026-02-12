# Scripts de Prueba - G22 SCORES

Este directorio contiene scripts de prueba para validar el funcionamiento del API de deportes y torneos.

## Scripts Disponibles

### 1. `test-all-sports.js`
**Propósito:** Prueba todos los deportes disponibles en el SPORT_MAPPING para verificar conectividad con FlashScore API.

**Uso:**
```bash
node scripts/test-all-sports.js
```

**Qué hace:**
- Prueba los 34 deportes únicos configurados
- Cuenta torneos y partidos disponibles para cada deporte
- Identifica cuáles deportes tienen datos activos
- Genera la configuración sugerida para `sports.ts`
- Muestra íconos y nombres en español para cada deporte

**Salida:**
- Tabla con estado de cada deporte (OK/FAIL)
- Lista de deportes con datos activos
- Configuración TypeScript lista para copiar/pegar
- Estadísticas de éxito/fallo

---

### 2. `test-tournament-api.js`
**Propósito:** Prueba torneos específicos para validar la extracción de IDs y detalles de torneos.

**Uso:**
```bash
node scripts/test-tournament-api.js
```

**Qué hace:**
- Prueba 14 torneos de muestra de diferentes deportes
- Extrae IDs necesarios (tournament_id, stage_id, template_id, season_id)
- Obtiene detalles de cada torneo
- Valida que los endpoints de FlashScore funcionen correctamente

**Salida:**
- Tabla con estado de cada torneo
- IDs extraídos para torneos exitosos
- Ejemplos de uso del API
- Reporte de torneos fallidos con razones

---

### 3. `test-local-api.js`
**Propósito:** Prueba el endpoint local `/api/tournaments` de Next.js.

**⚠️ Prerequisitos:**
1. El servidor de desarrollo debe estar corriendo:
   ```bash
   npm run dev
   ```
2. El servidor debe estar en `http://localhost:3000`

**Uso:**
```bash
# En una terminal, inicia el servidor
npm run dev

# En otra terminal, ejecuta el script de prueba
node scripts/test-local-api.js
```

**Qué hace:**
- Verifica que el servidor local esté corriendo
- Prueba el endpoint `/api/tournaments` con diferentes formatos de consulta:
  - Por ID con prefijo `fs-`
  - Por IDs específicos (tournamentId, stageId)
  - Por URL del torneo
- Mide tiempos de respuesta
- Valida que los datos retornados sean correctos
- Analiza completitud de la respuesta (IDs, detalles, results, fixtures, standings)

**Salida:**
- Tabla con estado de cada prueba
- Tiempos de respuesta
- Análisis detallado de datos retornados
- IDs extraídos y contadores de datos
- Mensajes de troubleshooting si hay fallos

---

## Resultados de las Pruebas

### Última Ejecución: 9 de febrero de 2026

#### test-all-sports.js
- ✅ **34/34 deportes funcionan correctamente (100%)**
- ✅ **17 deportes con datos activos**
- ✅ **0 fallos**

Deportes con más datos:
1. Tennis: 265 partidos, 42 torneos
2. Football: 233 partidos, 77 torneos
3. Basketball: 99 partidos, 37 torneos
4. Hockey: 86 partidos, 27 torneos
5. Volleyball: 54 partidos, 30 torneos

#### test-tournament-api.js
- ✅ **10/14 torneos probados con éxito (71%)**
- ⚠️ **4 torneos fallaron** (URLs incorrectas o no disponibles)

Torneos exitosos:
- ✅ Premier League (Football)
- ✅ Australian Open (Tennis)
- ✅ NBA (Basketball)
- ✅ NHL (Hockey)
- ✅ World Championship (Volleyball)
- ✅ World Championship (Handball)
- ✅ MLB (Baseball)
- ✅ World Cup (Futsal)
- ✅ World Championship (Snooker)
- ✅ World Cup (Field Hockey)

---

## Interpretación de Resultados

### Símbolos
- ✓ = Prueba exitosa
- ✗ = Prueba fallida
- ⚠️ = Advertencia o nota importante

### Códigos de Estado
- **OK** - La prueba pasó correctamente
- **FAIL** - La prueba falló
- **Yes/No** - Indica presencia o ausencia de datos

### Contadores
- **Tournaments** - Número de torneos disponibles
- **Matches** - Número de partidos disponibles
- **Results** - Partidos con resultados finales
- **Fixtures** - Partidos programados
- **Standings** - Tablas de posiciones

---

## Troubleshooting

### Error: "Local server is not running"
**Solución:**
```bash
npm run dev
```
Asegúrate que el servidor esté corriendo en `http://localhost:3000`

### Error: "HTTP 401" o "Unauthorized"
**Problema:** La API key de FlashScore puede ser inválida o haber expirado

**Solución:**
1. Verifica la API key en `src/lib/services/flashscore.ts`
2. Actualiza la constante `API_KEY` si es necesario

### Error: "No IDs found"
**Problema:** La URL del torneo es incorrecta o el torneo no existe

**Solución:**
- Verifica la URL del torneo en FlashScore
- Intenta con otro torneo del mismo deporte
- Algunos torneos pueden no estar disponibles fuera de temporada

### Tiempos de respuesta lentos
**Causas posibles:**
- Rate limiting del API de FlashScore
- Conexión a internet lenta
- Muchas peticiones simultáneas

**Solución:**
- Los scripts ya incluyen delays entre peticiones
- Considera aumentar el cache TTL en `flashscore.ts`

---

## Agregar Nuevas Pruebas

### Para agregar un nuevo deporte:
1. Agrega el deporte en `SPORT_MAPPING` en `flashscore.ts`
2. Ejecuta `test-all-sports.js` para verificar
3. Agrega el deporte en `sports.ts` si funciona

### Para agregar un nuevo torneo de prueba:
1. Edita `SAMPLE_TOURNAMENTS` en `test-tournament-api.js`
2. Agrega la entrada con URL y nombre del torneo
3. Ejecuta el script para validar

### Para agregar un nuevo caso de prueba local:
1. Edita `TEST_CASES` en `test-local-api.js`
2. Agrega el caso con parámetros de consulta
3. Ejecuta el script para validar

---

## Mantenimiento

### Ejecutar todas las pruebas
```bash
# Prueba 1: Deportes
node scripts/test-all-sports.js

# Prueba 2: Torneos
node scripts/test-tournament-api.js

# Prueba 3: API Local (requiere servidor corriendo)
npm run dev
# En otra terminal:
node scripts/test-local-api.js
```

### Frecuencia recomendada
- **Diariamente:** `test-all-sports.js` (para monitorear disponibilidad de datos)
- **Semanalmente:** `test-tournament-api.js` (para validar torneos)
- **Después de cambios:** `test-local-api.js` (para validar el endpoint local)

---

## Reporte Completo

Para ver el reporte completo de las pruebas, consulta:
📄 [`docs/SPORTS_API_TEST_REPORT.md`](../docs/SPORTS_API_TEST_REPORT.md)

---

**Última actualización:** 9 de febrero de 2026
