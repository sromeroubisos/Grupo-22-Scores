# Carga manual de partidos — dos fuentes, dos cargadores, cero escrituras

Bitácora de la rama `claude/tala-universitario-rugby-formaciones-099you`.
Empieza con cuatro capturas de pantalla y termina con dos cargas listas,
verificadas y **sin ejecutar**: la sesión no tuvo credenciales de la base.
Los datos y los scripts están; falta una corrida en una máquina que sí las tenga.

Fecha: 2026-09-05.

---

## Lo que quedó

| Qué | Dónde | Estado |
|---|---|---|
| Universitario vs Tala, 04/09 — 46 jugadores, 16 eventos, 23-30, sede | `src/scripts/formaciones/2026-09-04-universitario-tala.json` | dato listo, **no escrito** |
| TRP A, 05/09 — cuatro resultados de Primera | `src/scripts/resultados/2026-09-05-trp-a-primera.json` | dato listo, **no escrito** |
| Cargador de UN partido (planteles + eventos + marcador + sede) | `src/scripts/carga-partido-local.ts` | anda hasta la línea del cliente de Supabase |
| Cargador de una FECHA de resultados | `src/scripts/carga-resultados.ts` | ídem |

Cinco commits, 1.040 líneas, ni una fila tocada en producción.

---

## Por qué no se ejecutó

El contenedor de la sesión no tiene con qué autenticarse:

- no existe `.env.local`;
- no hay ninguna variable de Supabase en el entorno;
- el `postgresql` del `.mcp.json` apunta a `user:password@localhost:5432/dbname`,
  que es el placeholder que viene por defecto.

`createAdminClient()` pide `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`
y falla cerrado, sin fallback a la anon key. Todos los dry-run de esta bitácora
llegan hasta ahí y cortan.

El sitio **sí** es alcanzable (HTTP 307), así que la API pública sería una vía
parcial: escribe formaciones (`/api/results/lineups`) y marcador
(`/api/results/update`), pero **no tiene endpoint de eventos** ni de puntos de
tabla. El minuto a minuto sólo entra por script con acceso a la base, o a mano
por el Match Center.

---

## Parte 1 — Universitario vs Tala

UCR Top 10 A, fecha 14, Vieytes 1, 04/09/2026 21:45. Universitario local, Tala
visitante. Final 23-30.

### El cruce y la fecha se corrigieron con evidencia, no con criterio

La primera carga salió del orden de las pestañas de la pantalla de formaciones
(Universitario primero) y de la fecha que dijo el pedido (05/09). La cabecera
del partido, que llegó después, confirmó el cruce y **corrigió la fecha a 04/09**.
El archivo se renombró.

### El script que faltaba

Ya existía `formaciones-partido-externo.ts`, y no servía. Aquel escribe el
override de `external_match_lineup_overrides`, que es lo único que se le puede
colgar a un partido que sirve el proveedor: no tenemos fila propia. Un partido
nuestro tiene fila en `matches` y la vista pública le lee la formación de
`matches.lineups`. Correr el externo acá dejaría los 46 jugadores colgados de
una tabla que esa vista no mira.

El sibling reusa `parseLineupPayload` — el mismo normalizador y las mismas
validaciones que `POST /api/results/lineups` — para que cargar por script y
cargar por API no puedan diferir en el puesto, ni dejar pasar dos capitanes o un
número repetido. El puesto no se declara: en rugby lo dice el número.

### El marcador no se deriva de los eventos

`persistMatchCenterSupplementalData` guarda formación y minuto a minuto y **no
toca `matches.score`**. Cargar sólo los eventos dejaba el partido mostrando
`- - -` con 16 eventos que suman 30. Por eso planteles, eventos, marcador y sede
entran en UNA corrida: media carga es justo el estado que había que evitar.

Los puntos de tabla no se declaran a mano: los calcula
`deriveClubAdminPointsPatch` con el ruleset del torneo y los eventos recién
escritos — la misma cuenta que hace la Results API. Y como un resultado final
cambia la tabla, se rehace la de la fase.

### La sede, con una salvedad

La fuente dice Vieytes 1 y el partido decía "Por definir". Se escribe **sólo si
el partido no tiene sede**. Pisar una sede cargada a mano con una transcripción
es al revés de lo que conviene: la puso alguien que estaba ahí. Cuando difieren,
el script lo dice y no toca nada.

### Las dos verificaciones

Una transcripción se equivoca de dos maneras y ninguna se ve leyendo el JSON:

1. **El autor de un evento tiene que estar en la formación de SU lado.** Caza el
   evento bien copiado pero puesto en el equipo equivocado, y el mensaje dice en
   cuál de los dos estaba. Probado moviendo el try de Karqui a Tala:

   ```
   evento 5 (30'): "Karqui, Emir Agustín" no está en la formación visitante — SÍ está en la local
   ```

2. **Los eventos tienen que sumar el marcador**, contra el declarado en el JSON y
   contra el que ya tiene el partido. Probado sacando el penal del 81':

   ```
   Los eventos suman 23-27 pero el marcador declarado es 23-30
   ```

Ninguna de las dos escribe nada cuando falla.

Los 16 eventos dan **23-30** exacto y cada jugador resuelve su número contra el
plantel: 4 tries por lado, 0 y 2 conversiones, 1 y 2 penales. Cierra con el
resumen de puntos de la fuente.

### Tipos de evento

Los del preset de rugby de `matchEventCatalog`: `try`, `conversion`,
`penalty_goal` y `card_yellow` — que es el que la UI rotula `AMARILLA`. Los
tiros a palos del minuto a minuto son los que entraron, y se marcan explícito con
`[palos:ok]` en vez de confiar en el default de `isGoalKickMade`, que para
`penalty` asume errado y comería tres puntos.

---

## Parte 2 — Torneo Regional Pampeano A

Cuatro resultados de Primera publicados por `@rugbymdq`:

```
Argentino     10-52  Mar del Plata     (ofensivo: Mar del Plata)
SIR           22-44  Sporting          (ofensivo: Sporting)
Comercial     29-23  Sportiva          (sin ofensivo declarado)
Los Cardos    12-52  Universitario     (ofensivo: Universitario)
```

### Por qué es otro cargador

La fuente cambia la cuenta. `carga-partido-local.ts` tiene el minuto a minuto,
así que el bonus ofensivo sale de contar tries. Una placa de resultados da el
marcador y nada más: contar tries sobre cero eventos daría **cero bonus ofensivo
y una tabla mal**.

Así que el ofensivo se declara, y esos partidos quedan con
`points_autocalculated = false` y el motivo escrito. Si quedaran en `true`, el
primer recálculo con cero eventos les borraría el bonus.

### Lo que NO se declara

El puntaje base y el bonus **defensivo** salen de `deriveClubAdminPointsPatch`
con el ruleset del torneo, que es donde viven el margen del defensivo y cuánto
vale cada bonus. Hardcodear "pierde por 7 o menos" sería inventarle la regla a un
torneo que puede tener otra: Sportiva perdió por 6 y su punto lo decide el
ruleset, no el script.

Comercial es el único de los cuatro que queda autocalculado, así que su fila se
mantiene viva ante cualquier recálculo.

---

## Lo que comparten los dos cargadores

- **El partido no se adivina.** Sin uuid ninguno escribe: listan los partidos de
  la fecha con su id, sus clubes y su estado para que los elija una persona.
  Resolver el cruce por nombre es lo que deja datos colgados del partido
  equivocado, y despegarlos después es peor que no haberlos cargado.
- **Corte duro por fecha.** Si el uuid apunta a un partido de otro día, cortan.
- **Rollback antes de tocar nada.** El estado anterior —status, score, puntos,
  formación— queda en un `ROLLBACK_*.json`. Es acumulativo: repetir `--apply` no
  puede pisar el original con lo ya escrito.
- **Dry-run por defecto.** Escriben sólo con `--apply`.
- **La tabla se rehace** al cerrar un resultado. No rehacerla la deja vieja sin
  avisar.

---

## Para ejecutarlo

En una máquina con `.env.local` — el mismo con el que corre el resto de
`src/scripts/`:

```bash
git pull origin claude/tala-universitario-rugby-formaciones-099you
```

### TRP A

```bash
# Lista los partidos del día para completar los 4 uuid en el JSON
npx tsx src/scripts/carga-resultados.ts src/scripts/resultados/2026-09-05-trp-a-primera.json

# Con los cuatro campos "partido" completados
npx tsx src/scripts/carga-resultados.ts src/scripts/resultados/2026-09-05-trp-a-primera.json --apply
```

### Universitario vs Tala

```bash
# Lista los partidos del 04/09
npx tsx src/scripts/carga-partido-local.ts src/scripts/formaciones/2026-09-04-universitario-tala.json

npx tsx src/scripts/carga-partido-local.ts \
  src/scripts/formaciones/2026-09-04-universitario-tala.json \
  --partido=<uuid> --apply
```

`--sin-marcador` carga sólo planteles, eventos y sede, para un partido en curso.

---

## Pendiente y a confirmar

- **Las dos cargas, sin correr.** Es lo único que falta para que los datos estén
  en la app.
- **La fecha del TRP A** se asumió 05/09 porque el post tenía una hora. Si la
  placa es de otra jornada, hay que cambiar `fecha` en el JSON.
- **Los nombres de los clubes** del TRP van como los publica la placa. El script
  avisa si no se parecen al club del partido, pero no bloquea: "SIR" contra un
  slug tipo `sociedad-italiana-…` no va a coincidir y no por eso está mal.
- **Los nombres de los jugadores** van transcriptos tal cual se ven, sin
  normalizar mayúsculas (*ameijeiras*, *VERGARA*, *cantarutti*). Inventar una
  normalización sobre nombres propios rompe más de lo que arregla.
- **Ninguna captura marcó capitán**, así que ningún jugador lo lleva.

---

## Verificación

- `npx tsc --noEmit` sin errores propios. Los 7 que quedan son preexistentes:
  imágenes del minijuego que resuelve `next-env.d.ts` en build.
- Los dry-run corren enteros y validan los dos JSON; cortan en el cliente de
  Supabase por falta de credenciales.
- Los dos guards del cargador de partido probados con casos que fallan a
  propósito.
- Sin tocar `src/features/career`, así que no aplica el checklist del minijuego.
