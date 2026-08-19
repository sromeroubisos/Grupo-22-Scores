# Etapa 0 — Runbook de medición (3 escenarios)

> Ejecutar **solo** contra un entorno aislado (branch de Supabase o Supabase local).
> **Nunca** contra producción. Empezar con 1 request, secuencial. Sin concurrencia,
> sin carga, sin crons, sin flags de omisión, sin cambios de arquitectura.

## 0. Preparar el laboratorio (una vez)

> ⚠️ **Ya hay un dev server en :3000 que usa `.env.local` = PRODUCCIÓN.**
> NO lo reutilices. Arrancá el server del laboratorio en un **puerto dedicado**
> con el env del branch, para que sea imposible confundirlos.

1. Poné las credenciales del branch en **`.env.test`** (ya está ignorado por Git).
2. Arrancá el server del laboratorio en un **puerto dedicado**, con el env del branch
   y el trace prendido (cargá `.env.test`, NO `.env.local`):
   ```
   PORT=3100 PERF_EDIT_TRACE=true npm run dev      # con las variables del branch
   ```
3. Exportá para las herramientas (apuntando al **puerto del laboratorio**):
   ```
   export EDIT_TEST_BASE_URL='http://localhost:3100'
   export EDIT_TEST_SUPABASE_URL='https://<branch-ref>.supabase.co'
   export EDIT_TEST_COOKIE='...'          # sesión de un admin de PRUEBA (DevTools → Cookies)
   ```
4. **Probá el cableado antes de medir en serio:** corré S1 (editar `venue`) y confirmá
   en el **Studio del BRANCH** que el cambio aparece ahí (y **no** en producción). Recién
   con esa prueba tenés certeza de que el server usa el branch.

## 1. Compuerta de seguridad (obligatoria, solo lectura)

```
node scripts/etapa0-preflight.mjs
```
No sigas si no ves **✔ PREFLIGHT OK**. (Valida: destino ≠ producción, ref redactado,
`.env.test` ignorado, server responde, 1 consulta de solo lectura.)

## 2. Elegir los partidos de prueba (en el branch)

- **S1** — un partido `scheduled` (programado).
- **S2** — un partido `final` de un torneo **fuera** de todo `club_ranking`.
- **S3** — un partido `final` de un torneo de rugby **incluido en un `club_ranking` activo**
  (con temporada cargada suficiente para disparar el rebuild investigado).

Anotá el `matchId` de cada uno.

## 3. Procedimiento por escenario (repetir para S1, S2, S3)

**Antes de escribir**
1. **Guardá el estado inicial** del partido (para restaurar):
   `GET /api/admin/matches/<matchId>` (o Supabase Studio) → guardá `status`, `score`, `venue`,
   puntos, y el estado de standings/ranking del torneo.
2. Anotá qué procesos *deberían* dispararse:
   - S1 (solo `venue`): **ningún** derivado (ni ranking ni standings ni advancement).
   - S2 (final, sin ranking): standings sí; ranking **skipped_no_ranking**.
   - S3 (final, con ranking): ranking (¿**full_rebuild** o **incremental**?) + standings.
3. Preparación de restauración: tené listo el body inverso (los valores originales del paso 1).

**Escribir (1 sola request)**
```
node scripts/etapa0-edit-scenarios.mjs --confirm-test-env \
  --label s1-programado \
  --path '/api/admin/matches/<matchId>' \
  --body-file scripts/etapa0-bodies/scenario1-programado.json
# (en Git Bash: usar EDIT_TEST_PATH=/api/... en vez de --path)
```
Guardá el **`x-request-id`** que imprime.

**Después de escribir**
4. **Capturá la línea `[EDIT_TRACE]`** del server con ese `requestId` (habrá otra `label:"standings_async"`
   correlacionada por `correlationId`).
5. **Verificá el estado final en la DB** (Studio): que el partido tenga lo esperado.
6. **Verificá ranking y standings**: ¿se actualizaron? ¿coincide con lo esperado?
   (Ojo: en server local long-lived el `standings_async` sí termina; en Vercel no está garantizado.)
7. **Restaurá el estado inicial** con un PATCH inverso (body con los valores del paso 1).
8. **Confirmá que la restauración terminó** (GET de nuevo y comparar).

## 4. Entrega — tabla

| Escenario | totalMs | ranking_sync | queries | writes | avgObservedOpMs | standings | HTTP | Estado consistente |
|-----------|--------:|-------------:|--------:|-------:|----------------:|----------:|-----:|--------------------|
| S1 programado |  |  |  |  |  |  |  |  |
| S2 final sin ranking |  |  |  |  |  |  |  |  |
| S3 final con ranking |  |  |  |  |  |  |  |  |

Además separá, por escenario:
- **Dentro de la respuesta** (stages de `updateMatch`) vs **posterior a la respuesta** (`standings_async`).
- **Rebuild completo o incremental** (`rankingFullRebuild` / `rankingIncremental` + `rankingRebuildClubs`/`...SeasonMatches`).
- **Errores/timeouts** (`errored`, `errorClass`, `dbErrors`).
- **Estado de ranking y posiciones** tras el paso 6.
- **Diferencia estimado vs medido** (contra el modelo de la Etapa 0).

## 5. Veredicto

Con S3, determinar con evidencia si **`ranking_sync` es el cuello dominante**:
- **Sí** si `stages.ranking_sync ≈ totalMs`, `rankingFullRebuild:true` y `writes` en cientos.
- **No/matiz** si el tiempo está en otra etapa o `dbMs` es bajo con `totalMs` alto.

**Frenar acá.** No concurrencia, no carga, no imports, no crons, no flags de omisión, no U1/U2/U3.
