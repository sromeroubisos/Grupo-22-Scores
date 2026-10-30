# Auditoría — Match Center `/admin/super/partidos/[id]`

> **Estado de reparación (2026-08-19, mismo día):** se corrigieron los ítems de
> seguridad, crashes y errores. **Cerrados:** C1 (IDOR club-admin → autoriza
> contra `getManagedClubSummaries`), C2 (el minuto tipeado ahora se usa cuando
> el reloj no corre), C3 (el saneo no toca eventos con lineup vacío y el matcheo
> ignora acentos), A1 (PATCH/DELETE de `/api/matches/[id]` →
> `ensureMatchManagementAccess`), A2 (Guardar y Guardar puntos entran por la
> cola `enqueueMatchPatch`), A3 (rollback del status optimista), A4 (realtime
> normaliza events/lineups al entrar), M1 (mensajes crudos de Supabase solo al
> log — `throwSupplementalWriteError` + `updateMatch`), M2 (validación de forma
> del `score`), M3 (el deporte no degrada a rugby ante un fallo), M4
> (`normalizeMatchLineups` garantiza arrays + `hasAnyLineupPlayers` hardened),
> M5 (editar/borrar eventos sin id matchea por identidad; keys de React únicas),
> M6 (`getEventPeriodForType` recibe el deporte en los 3 sitios), M7
> (`handleSavePoints` con catch y toast de error), M8 (las páginas relanzan
> fallos reales en vez de 404), B2 (el error no lo borra el timer del toast
> optimista), B11 (`.recover` borrado), y el sanitizado del DELETE público.
> Verificado: `tsc` limpio, `npm run build` en verde, smoke test de las cuatro
> superficies sin sesión (307/401/401/403/401).
> **Siguen abiertos:** los ítems de UI/a11y (A5-A8, M9-M12) y B1, B3-B10, B12.

## Investigación de performance (2026-08-19, medida contra la base real)

**Método:** sonda de solo lectura por ruta temporal de dev con el `fetch` del cliente
Supabase instrumentado (cada request con timestamp, duración y bytes), partido
`07ab4e57` (Top 10 del Centro). Baseline **~330 ms por round-trip** desde esta máquina.

**El cuello de botella es el escudo del torneo en base64 dentro de la consulta principal.**
`tournaments.logo_url` de este torneo es un `data:image/png` de **133.274 caracteres**;
`MATCH_CENTER_MATCH_SELECT` lo trae en el join en cada lectura. Descompuesto:

| consulta | ms | bytes |
|---|---|---|
| select completo actual | **925** | **134.776** |
| el mismo select SIN `logo_url`/`banner_url` del torneo | **286** | **1.470** |
| join tournament con logos | 946 | 133.493 |
| join tournament sin logos | 300 | 187 |
| lineups / score / events / clubs joins | 257-286 | 12-347 |

En frío la consulta principal llegó a **3,6 s**. La lectura completa del Match Center
(`fetchMatchCenterMatch`) son **15 requests en ~6 olas secuenciales: 6,6 s fría / 4,0 s
caliente**. La pagan: la carga de la página, el GET del admin, **cada "Guardar" no
compacto** (la respuesta rehidrata con la misma lectura) y el **GET público**
`/api/matches/[id]` (misma función) — el problema es sitio-wide: **67 de 905 torneos**
tienen `logo_url` en base64 (`banner_url` está limpio). Es el patrón #1d ya corregido
para clubes en `36c227b`, que no cubrió `tournaments`.

**Cuellos secundarios medidos:**
- `resolveTeamDivisionId`: hasta 2 consultas secuenciales por equipo (4 × `club_divisions`,
  ~0,7-0,8 s) aunque el club no tenga divisiones — todas volvieron vacías.
- Fallback de eventos legacy: +1 RTT (~360 ms) en cada carga de un partido sin eventos
  relacionales (lee la columna JSONB `events` aparte).
- Config de plantel fijo: +1 ola (~430 ms) por lectura, sin caché por torneo+temporada.
- En el PATCH: `getMatchScope` ×2 (prev/next, ~430 ms c/u) y, si un evento lleva jugador
  de texto libre sin `playerId` (inevitable con lineup vacío), `resolveEventsForPersistence`
  dispara la construcción de contextos de plantel + autoalta de personas dentro del request.

**Lo que NO es cuello (verificado):** `checkMatchColumnSupport` cachea con TTL y dedup
en vuelo (0 ms caliente); el recálculo de standings es fire-and-forget con coalescing por
fase y gate por status final; el camino compacto de eventos en vivo evita la rehidratación
a propósito; el reloj va por su canal corto.

**APLICADO (2026-08-19, mismo día): fix 1 ejecutado — los 67 logos migrados a Storage.**
- **Causa raíz confirmada:** el bucket `tournaments` NO existía — por eso
  `persistTournamentLogo` caía siempre a su fallback base64. Se creó el bucket
  (público) y se migraron los 67 con el mismo patrón de la app
  (`logos/{id}-{timestamp}.{ext}`), verificando byte a byte cada URL pública antes
  de actualizar la fila, con guard optimista (`LIKE 'data:%'`) contra ediciones
  concurrentes. Resultado: **67/67 migrados, 0 fallos, 0 base64 restantes.**
- **Backup para rollback:** `TOURNAMENT_LOGOS_BASE64_BACKUP.jsonl` (repo root, sin
  trackear) — restaurar = update de `logo_url` por id desde ese archivo.
- **Medido después:** select principal del Match Center **925 ms / 135 KB → ~290 ms /
  1,6 KB**; GET público `/api/matches/[id]` devuelve 2,7 KB (antes embebía los 135 KB).
- **El logo se sigue viendo:** mismo campo `logo_url`, ahora con URL corta que sirve
  el MISMO PNG (bytes idénticos, CORS `*`); el PDF (`inlineLogosAsDataUris`) y el
  export de canvas (`loadImage` con proxy + `crossOrigin`) ya estaban preparados para
  URLs de Storage — ese era el estado previsto por el código. Y con el bucket creado,
  las subidas futuras desde el admin dejan de degradar a base64.

**Fixes por palanca:**
1. ~~**Datos (arregla todo sin tocar código):** migrar los 67 `tournaments.logo_url` base64
   a Storage/URL corta. Censo: `logo_url LIKE 'data:%'`.~~ **HECHO (arriba).**
2. **Código (patrón `36c227b` probado):** sacar `logo_url, banner_url` del join de torneo en
   `MATCH_CENTER_MATCH_SELECT[_REDUCED]` y resolver por proxy (`buildMatchCenterLogoUrl` ya
   existe como fallback). OJO: el data-URI directo se prefiere hoy para PDF/popup
   (`exportMatchSheetPdf`) — verificar ese camino con URL de proxy antes de aplicar.
3. `resolveTeamDivisionId`: cortocircuitar cuando el club no tiene divisiones y paralelizar
   sus dos consultas.
4. Cachear `loadFixedRosterConfigForMatch` por torneo+temporada (TTL corto, mismo patrón que
   `checkMatchColumnSupport`).
5. Piggyback de `getMatchScope` prev (ya se lee la fila en `selectMatchForUpdate`).

---

**Fecha:** 2026-08-19 · **Alcance:** ruta auditada + su cadena completa (página server, cliente, API, autorización, CSS) + endpoints hermanos que escriben sobre los mismos partidos. El mismo `MatchCenterClient` se monta también en `/admin/torneo/partidos/[id]`, así que todo hallazgo del cliente aplica a las dos rutas.

**Archivos centrales:**
`src/app/admin/super/partidos/[id]/page.tsx` · `MatchCenterClient.tsx` (5.088 líneas) · `match-center.css` (3.019 líneas) · `src/lib/server/matchCenterAdmin.ts` · `src/app/api/admin/matches/[id]/route.ts` · `src/app/api/matches/[id]/route.ts` · `src/app/api/club-admin/matches/[id]/route.ts` · `src/lib/club-admin/matchAccess.ts` · `src/lib/services/fixtureService.ts` · `src/lib/services/matchCenterService.ts`

**Prueba en vivo:** sin sesión, la ruta responde `307 → /login?returnTo=/admin/super/partidos/{id}` — la barrera server-side funciona.

---

## Veredicto

La **puerta de esta ruta está bien**: `ensureMatchManagementAccess` implementa exactamente la regla del proyecto (scoping por torneo, sin acceso blanket por rol) y los tres métodos de `/api/admin/matches/[id]` la exigen antes de tocar datos. Los problemas graves están en (a) **dos endpoints hermanos** que escriben sobre los mismos partidos con autorización más débil, y (b) **dos bugs de pérdida de datos** en el cliente en flujos habituales del operador.

Todo escribe con **service-role** (`getWriteClient`/`getReadClient` → `createAdminClient` cuando `SUPABASE_SERVICE_ROLE_KEY` existe), o sea que **RLS no es red de contención**: la autorización de aplicación es la única barrera.

---

## CRÍTICOS

### C1. IDOR en `/api/club-admin/matches/[id]`: el club a editar lo elige el cliente por query string
`src/lib/club-admin/matchAccess.ts:84-101`, invocado desde `src/app/api/club-admin/matches/[id]/route.ts` (GET y PATCH).

`checkClubMatchAccess(matchId, ?club=...)`: el chequeo de membresía de las líneas 51-54 solo pide tener **alguna** membresía de gestión club/club_family — no la del club pedido. En la rama con `?club=`, si el partido involucra a ese club, `allowed: true` se devuelve sin verificar que el usuario administre ese club: la búsqueda de membresía de las líneas 86-90 solo alimenta el campo `role` para display (y además su condición `|| m.scopeType === 'club_family'` matchea cualquier familia sin comparar `scopeId`).

**Consecuencia:** un gestor del club A puede hacer PATCH (score, status, events, lineups, puntos, fecha, sede) sobre cualquier partido del club B pasando `?club=<id-del-B>` — con impacto en standings y rankings, y sin RLS que lo frene. La rama de fallback sin `?club=` (líneas 108-127) sí está bien scopeada; el agujero es exclusivo de la rama controlada por query.

**Fix sugerido:** exigir que la membresía encontrada (con `scopeId === resolvedExpectedClubId`, también para `club_family` vía la familia del club) sea condición de `allowed`, no solo decorativa.

### C2. El minuto tipeado en el modal guiado se descarta — eventos post-hoc quedan en minuto 0
`MatchCenterClient.tsx:2485-2492` vs. `4265-4276`.

El input "Minuto" del modal es editable cuando el reloj no corre (`guidedEventUsesClockMinute` falso) y su `onChange` escribe `guidedEvent.minute` — pero `saveGuidedEvent` hace `const minute = clock.readEventMinute()` incondicionalmente y **nunca lee `guidedEvent.minute`**. Con el reloj sin uso, `readEventMinute()` devuelve 0.

**Escenario:** el flujo más común — cargar los eventos después del partido, sin reloj. El operador tipea minuto 53, guarda, y el evento se persiste con `minute: 0`. Corrompe timeline, parciales por tiempo y estadísticas por minuto. Único workaround: reeditar cada minuto en la grilla de Eventos.

### C3. Borrado silencioso de jugadores de eventos persistidos cuando el lineup no los contiene
`MatchCenterClient.tsx:2755-2790` (con `1617-1630` y `normalizeLookupKey` en `1083`).

Un efecto recorre `localEvents` y si `event.playerName` no aparece en las opciones derivadas de `localLineups`, lo **vacía** (`playerId: null, playerName: ''`; ídem secundario, y en cambios borra `detail`). Corre también al montar, sobre eventos ya persistidos. Además `normalizeLookupKey` no quita acentos: "Pérez" en el evento vs "Perez" en el lineup no matchea.

**Escenario:** partido con eventos con jugadores pero lineups vacío/rehecho/importado, o simple discrepancia de acentos → al montar se vacían los nombres → `eventsDirty` se enciende → el próximo "Guardar" **persiste el borrado**. Pérdida de datos silenciosa sin que nadie haya tocado esos eventos.

---

## ALTOS

### A1. Bypass del scoping por torneo en el endpoint legacy `/api/matches/[id]` (PATCH y DELETE)
`src/app/api/matches/[id]/route.ts:263-282` + `src/lib/auth/roles.ts:381-392, 121-129`.

`ensureMatchAccess` da acceso blanket vía `hasFederationAdminAccess`: cualquier `admin_union`, `admin_torneo`, `operador`, `gestor_*` — o cualquiera con **una** membresía admin/editor/operator en cualquier scope union/sport/tournament/match — puede editar o borrar **cualquier partido**, del torneo que sea. Es exactamente lo que la regla del proyecto prohíbe y que `/api/admin/matches/[id]` sí cumple con `ensureMatchManagementAccess`. Un admin de torneo X puede editar partidos del torneo Y llamando este endpoint directo.

**Fix sugerido:** reemplazar `ensureMatchAccess` por `ensureMatchManagementAccess` (ya existe y hace lo correcto), o retirar PATCH/DELETE del endpoint público.

### A2. `handleSave` y `handleSavePoints` esquivan la cola anti-carrera
`MatchCenterClient.tsx:2241, 2085-2091` vs. cola `matchPatchQueueRef` en `1481`.

Por la cola van solo `persistClockTransition`, `ensureLiveStatus` y `saveGuidedEvent`; `handleSave` y `handleSavePoints` disparan `persistMatchPatch` en paralelo con lo encolado. `applyMatchResponse` muta refs compartidos (`persistedEventsRef`, `persistedScoreRef`, `persistedMatchRef`) sin orden garantizado: un "Guardar" rápido durante un evento optimista lento hace retroceder marcador y puntos en pantalla (o pisa refs con estado pre-commit). Es la carrera que la cola existe para impedir, según su propio comentario (1479-1480).

### A3. Rollback incompleto en `saveGuidedEvent`: el status optimista no se revierte
`MatchCenterClient.tsx:2504-2516` y `2544-2548`.

Un evento `match_end`/`match_start` adelanta el status optimísticamente; si el PATCH falla, el catch revierte el evento pero **no el status**: la cabecera queda en "FINAL" con la DB en `live`, el efecto de puntos calcula puntos de partido terminado, y un "Guardar" posterior puede persistir un `final` sin evento de cierre.

### A4. El handler de realtime mete eventos/lineups crudos, salteando los normalizadores
`MatchCenterClient.tsx:2122-2123, 2160-2172` vs. `1564-1566`.

`incomingEvents` va directo a `localEvents` sin `normalizeMatchEvents` (que rellena `order`, deriva `period` por deporte). Con eventos legacy, cualquier UPDATE por realtime (incluido el eco del propio guardado) enciende un dirty fantasma ("Guardar cambios" sin ediciones) y el próximo guardado re-upserta eventos "distintos" que no cambiaron. Lo que sí está bien: los drafts sucios no se pisan, la suscripción no se recrea y el cleanup existe.

### A5. Sticky de pestañas muerto en la ruta super
`match-center.css:218-220` + `globals.css:257` (`body { overflow-x: hidden }`) + **cero** `data-sticky-tabs` en el cliente.

El patrón del proyecto (`body:has([data-sticky-tabs]) { overflow-x: clip }`) nunca se activa: la barra de pestañas no pega al scrollear en `/admin/super/partidos/[id]`. En `/admin/torneo` funciona de casualidad (el shell del layout crea su propio contexto de scroll). **Ojo al fix:** `match-center.css:2133` pone `overflow-x: hidden` en el propio contenedor a ≤600px — debe pasar a `clip` o el fix muere en mobile.

### A6. Workspaces desbordan 48px a su contenedor entre ~601 y ~1300px
`match-center.css:1104, 1387, 1392`: `width: min(1220px, calc(100vw - 32px))` contra un padre que deja `100vw − 80px`. A 900 y 1024 px (los anchos que la regla del proyecto manda medir) el borde derecho de la consola de eventos y estadísticas queda recortado en silencio (el `overflow-x: hidden` del body esconde el scrollbar). Fix: `width: min(1220px, 100%)`.

### A7. El botón "Publicar" no hace nada
`MatchCenterClient.tsx:3350-3352`: botón primario de cabecera sin `onClick`.

### A8. Accesibilidad de cabecera y fila de eventos
- La X de borrar evento (`4184-4186`) no tiene nombre accesible — único botón destructivo de la fila (el de cerrar modal, en el mismo archivo, sí lo tiene).
- "Guardar" y "Publicar" pierden el nombre bajo 1200px: `.btn-label { display: none }` (`match-center.css:200-203`) los saca del árbol de accesibilidad.
- `.empty-msg` ("Sin eventos registrados"): `#444` sobre `#181818` = **1,8:1** de contraste (`match-center.css:2106-2111`).

---

## MEDIOS

**M1. Fuga de mensajes internos de Supabase al cliente.** `admin/matches/[id]/route.ts:185-188` (y GET/DELETE): el catch devuelve `error.message` crudo con 500; `FixtureService.updateMatch` y `persistMatchCenterSupplementalData` re-lanzan el error de Supabase textual (columnas, constraints). Mismo patrón en club-admin, y en el DELETE del endpoint público (`api/matches/[id]/route.ts:508-513`). Inconsistente: el PATCH público sí sanea (`route.ts:477-479`).

**M2. `score` (JSONB) se persiste sin validar forma.** `fixtureService.ts:1299`: JSON arbitrario del body entra crudo a la columna; un caller autorizado puede romper lectores downstream (standings, export). `lineups` tiene un agujero menor análogo: claves extra fuera de `home`/`away` pasan verbatim (`matchCenterService.ts:465-475`).

**M3. `fetchMatchConfiguration` degrada el deporte a rugby ante cualquier fallo.** `MatchCenterClient.tsx:1328-1386, 2042-2052`: las tres lecturas a Supabase ignoran `error` y el catch devuelve `sportId: null`, pisando el `sport_id` que ya venía en `initialMatch`. En hockey: botonera de rugby, períodos de dos tiempos en vez de Q1-Q4, planilla de 23.

**M4. `normalizeMatchLineups` no garantiza arrays → TypeError.** `MatchCenterClient.tsx:258-260` vs. `444-446, 3683`: un JSONB no-nulo sin `home`/`away` (o `home: null`) crashea toda la vista al montar (`lineups?.home.length`).

**M5. Eventos sin `id` estable: editar/borrar uno afecta a todos.** `MatchCenterClient.tsx:227-256, 2329-2337`: `updateLocalEvent`/`removeLocalEvent` matchean por `id`; con eventos importados sin id (input esperado según `buildEventsPatch`), editar uno edita todos y las keys de React se duplican.

**M6. Flujo guiado llama `getEventPeriodForType` sin `sportId`.** `MatchCenterClient.tsx:2393, 2488, 4281`: cae a la secuencia de dos tiempos — "Inicio partido" en hockey se persiste como `1T` en vez de `Q1`.

**M7. `handleSavePoints` sin catch: el fallo es mudo.** `MatchCenterClient.tsx:2081-2100`: PATCH fallido → unhandled rejection y cero feedback; el operador cree que los puntos se guardaron.

**M8. `page.tsx` enmascara todo fallo como 404.** `page.tsx:14-22`: cualquier error no-'Unauthorized' (incluido un fallo transitorio de DB en la lectura service-role) termina en `notFound()`. El mismo antipatrón "fallo disfrazado de vacío" ya documentado en el proyecto. (El 'Forbidden' → 404 puede ser deliberado para no revelar existencia; el problema es el catch-all.)

**M9. Formularios sin asociación programática.** 13 labels hermanas sin `htmlFor` (tab Ajustes, crónica), 8 controles de la fila editable de eventos sin nombre, textareas de carga rápida y buscadores de jugador solo con placeholder. El patrón correcto (labels envolventes) existe en el mismo archivo (modal guiado, 4263-4387).

**M10. Botones deshabilitados que no dicen qué falta** (Transmisión/Replay, `3544-3557`), pares de selección sin estado accesible (convertida sí/no, ganado/perdido, `4304-4339`), pestañas principales sin `role="tab"`/`aria-current` (las de estadísticas sí lo hacen completo — inconsistencia interna).

**M11. Contrastes y tipografías fuera de rango en la paleta gris.** `.tab-btn` 3,3:1; `.live-event-group-title small` 2,5:1 a ~11px; panel de jugadores con fuentes de 6,9-9,3px (`match-center.css:1743-1754, 1671-1695`).

**M12. Doble landmark `<main>` anidado en ambas rutas.** `MatchCenterClient.tsx:3290` renderiza `<main>` dentro del `<main>` de `AdminWrapper`/layout de torneo — HTML inválido.

---

## BAJOS

- **B1.** `ensureLiveStatus` en fallo deja "EN VIVO" sin revertir (mitigado: muestra error y permite reintento).
- **B2.** Toast compartido: el clear de 3s del "Evento guardado." optimista puede borrar el mensaje de error posterior al rollback.
- **B3.** Opción muerta `syncDirtyEvents` (`219, 1917`), selectores CSS muertos (`.status-check`, `.squad-column`), ~100 líneas duplicadas dentro del mismo `@media` de 600px (`2500-2593` vs `2816-2923`).
- **B4.** `updated_at` de la respuesta compacta estampado con reloj del dispositivo (`2014`).
- **B5.** Un `dateTimeDraft` vacío nunca viaja: no hay forma de des-setear la fecha desde esta vista.
- **B6.** GET de `/api/admin/matches/[id]` no valida `isUuid` antes del auth; para un admin global el id crudo llega a `fetchMatchCenterMatch` (termina en 404).
- **B7.** `loadManagedMatchCenterMatch` dispara la lectura pesada (service-role) antes de resolver el auth: un usuario prohibido igual cuesta una lectura completa (los datos no se exponen).
- **B8.** Los 6 `alt` de escudos duplican el texto adyacente (por convención del proyecto deberían ser `alt=""`); 2 imágenes bajo el pliegue sin `loading="lazy"`; la página no tiene `<h1>` (la jerarquía arranca en `<h3>`).
- **B9.** `min-width: 360px` del reloj en vivo aplasta el header entre 601 y ~900px (`match-center.css:1136`).
- **B10.** 65 `!important` en match-center.css, mayormente para pisar estilos inline del JSX (`style={{ maxWidth: 1000 }}` en `3568`) — el conflicto es interno JSX↔stylesheet, no de cascada externa.
- **B11.** `MatchCenterClient.tsx.recover` (0 bytes) junto al código vivo — basura a borrar.
- **B12.** `console.log` de producción en el PATCH público y en `matchAccess.ts` (ruido con matchId y keys del body).

---

## Verificado y sano

- **Autorización de esta ruta:** los tres métodos de `/api/admin/matches/[id]` exigen `ensureMatchManagementAccess`; scoping por torneo correcto (membership match/tournament/sport/union o scope de torneos propios, siempre acotado al torneo de ESTE partido). DELETE más estricto que PATCH (deliberado). Identidad vía `supabase.auth.getUser()` (JWT validado contra server).
- **Whitelist de escritura:** `updateMatch` mapea campo por campo; `tournament_id`/`season_id` nunca salen del body; cambios de fase/clubes se validan contra el torneo del partido. Claves desconocidas se descartan.
- **`isUuid` en PATCH/DELETE** antes de tocar nada (consistente con la lección del outage de UUIDs).
- **Timezone:** round-trip local↔UTC con `APP_TIMEZONE` explícito en todos lados; ni un `toLocale*String` sin timezone.
- **Sin fugas en el cliente:** timeouts, listeners, canal realtime e interval del reloj, todos con cleanup; suscripción única.
- **Rollback del reloj correcto** (`useMatchClock` restaura el clock previo e ignora ecos).
- **Tema:** cero `prefers-color-scheme`; dark deliberado. Modal guiado con `role="dialog"`/`aria-modal`; tablist de estadísticas completo; botones de evento en vivo con `aria-label` dinámico.
- **307 → login con `returnTo`** verificado en vivo contra el dev server.

---

## Prioridad sugerida

1. **C1 (IDOR club-admin)** — fix de una condición; agujero de escritura cross-club activo.
2. **A1 (bypass del endpoint legacy)** — reemplazar `ensureMatchAccess` por `ensureMatchManagementAccess`.
3. **C2 + C3** — pérdida de datos en flujos habituales del operador.
4. **A2-A4** — integridad del estado en vivo.
5. **A5-A8 y los medios de UI** — tres fixes de palanca: `data-sticky-tabs` + `hidden→clip` en 2133; `min(1220px, 100%)` en los tres workspaces; nombres accesibles de X/Guardar/Publicar.
