# Cuerpo del PR — feat/urba-integracion → main

La rama ya está subida. El PR se abre acá:
https://github.com/sromeroubisos/Grupo-22-Scores/pull/new/feat/urba-integracion

No lo pude abrir yo: el MCP de GitHub responde `Bad credentials` y no hay `gh`
instalado. Abajo va el cuerpo listo para pegar. Este archivo no está trackeado;
se puede borrar después.

**Título:** `URBA: 811 torneos, 52.258 partidos, navegación por temporada y el cron`

---

Saca la integración de URBA de `feat/carrera-rugby-v2`, donde había quedado por ser la rama abierta cuando empezó y donde convive con dos minijuegos que no tienen nada que ver. Son los mismos 14 commits, cherry-pickeados en orden sobre `main`, **sin un solo conflicto**.

Los commits originales **siguen en `feat/carrera-rugby-v2`**: no se reescribió su historia porque hay otra sesión trabajando encima. Quedan duplicados a propósito.

---

## ⚠️ Esto es urgente, y el motivo no es el código

**La carga de datos ya está en la base de producción. El código que la contiene, no.**

Los 677 torneos históricos se publicaron contra el Supabase de producción a medida que se verificaba cada año. El filtro de temporada que impide que inunden la portada vive en estos commits, que nunca se desplegaron. Medido hoy contra `www.g22scores.com`:

| vista de `/api/public/tournaments?sport=rugby` | hoy en producción | con este PR |
|---|---:|---:|
| mayores (la que se ve por defecto) | **291** | 23 |
| juveniles | **564** | 128 |

El feed de partidos **no está afectado** y se verificó en producción: la consulta está acotada al día, así que un partido de 2021 no puede aparecer hoy. `/api/matches` devuelve 0 para hoy y 297 para el domingo 9, todos de 2026.

O sea: mergear esto no agrega riesgo, lo saca. Producción ya tiene los datos y le falta el filtro.

---

## Qué entra

**Los datos, ya cargados y publicados** — 811 torneos y 52.258 partidos de URBA, las seis temporadas 2021-2026.

| | 2026 | 2025 | 2024 | 2023 | 2022 | 2021 |
|---|---:|---:|---:|---:|---:|---:|
| torneos | 134 | 141 | 127 | 127 | 141 | 141 |
| partidos | 10.917 | 10.709 | 9.886 | 8.660 | 8.210 | 3.876 |

**El conector y el cron.** `src/lib/integrations/urba/` completo, más `/api/cron/urba-sync`. El alcance automático es la temporada en curso —sacada del reloj en hora de Buenos Aires, no de una constante— y el histórico sólo se toca a mano con `?anio=`.

**La navegación por división.** Dos desplegables en la cabecera del torneo: grado (Superior / Intermedia / Preintermedia en mayores, grupo y zona en juveniles) y temporada. Ruta propia con service-role que devuelve `id · name · subcategory · season_id` y nada más; **la política de RLS no se toca**.

**El filtro de temporada del listado.** El listado muestra una temporada por unión, y sólo se aplica a las uniones que cargan su calendario entero — hoy, URBA. Lo cargado a mano se muestra siempre, tenga el año que tenga.

**Dos correcciones ajenas a URBA** que aparecieron en el camino y afectan a todo el sitio: `normalizeUrl` no contemplaba rutas desde la raíz (`/competiciones/x.png` salía como `https:///competiciones/x.png`, escudo roto sin error), y la Intermedia/Preintermedia iban a la portada de mayores cuando son equipos de reserva.

---

## Verificación

- `npx tsc --noEmit` — limpio
- `npm run build` — verde
- **203 tests** en verde (144 de URBA, 25 de navegación, 13 de `competitionKey`, 12 del filtro de temporada, 4 de `normalizeUrl`)

Todo corrido en un worktree limpio con `npm ci` desde cero, para probar que la rama **se sostiene sola**. No hay un solo import entre los módulos de URBA y `features/career` o `features/captain`, en ninguna de las dos direcciones.

Los 8 tests en rojo de los minijuegos son previos y ajenos, y no entran acá: esta rama no toca `features/career` ni `features/captain`.

---

## Lo que NO entra

- **El cron queda declarado pero sin verificar en producción.** Las tres entradas están en `vercel.json`, pero antes de mergear hay que confirmar que `CRON_SECRET` existe en las variables de entorno de producción. Si no está, el cron devuelve 401 cada 20 minutos sin tocar un dato — y eso se lee como "no pasó nada".
- **No hay alertas.** Vercel no reintenta un cron fallido y no avisa: los errores quedan en los runtime logs y nada más. Decidir si eso alcanza es una conversación aparte.
- Los horarios del cron son **UTC** (Vercel no acepta zona). En hora argentina las ventanas quedan sábado 18:00 → domingo 03:00 y domingo 18:00 → lunes 03:00, que es donde cae la publicación de resultados de URBA.

---

## Rollback

Cada paso tiene el suyo, cortado por año y sin tocar los demás: `URBA_PUBLICAR_{2021..2025}_ROLLBACK.sql`, `URBA_HISTORICO_ROLLBACK.sql`, `URBA_SAN_ANDRES_ROLLBACK.sql`, `URBA_LOGO_ROLLBACK.sql`, `URBA_INSTANCIAS_ROLLBACK.sql`, `URBA_EJE_JUVENIL_ROLLBACK.sql`.

`URBA_LUNES_10.sql` tiene las consultas para revisar la primera jornada real con el cron encendido.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
