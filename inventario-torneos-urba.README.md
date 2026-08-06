# inventario-torneos-urba.csv — columnas

811 torneos de URBA, 2021-2026, bajados de `api.urba.org.ar` sin un solo fallo
HTTP. Derivado de la caché `.urba-cache/` — se regenera.

**Nada de esto está cargado en la base.** Es inventario: primero saber qué hay.

| columna | qué es |
|---|---|
| `urba_id` | id del torneo en URBA. Estable entre consultas. |
| `external_id` | `urba:{urba_id}`, para `tournaments.external_id`. Lo arma **únicamente** `buildUrbaTournamentExternalId()` en [externalId.ts](src/lib/integrations/urba/externalId.ts). El prefijo no es decorativo: esa columna es compartida con FlashScore y ESPN y no tiene columna `provider` al lado. |
| `nombre` | `name` tal cual lo publica URBA, sin normalizar. |
| `anio` | 2021 a 2026. |
| `division` | El escalón competitivo → `tournaments.category`. Ver abajo. |
| `grado` | **Columna añadida al pedido original.** Ver abajo. |
| `age_grade` | `mayores` \| `M15` \| `M16` \| `M17` \| `M18` \| `M19` \| `M20` \| `M22` → `tournaments.age_grade`. |
| `gender` | `masculino` \| `femenino` → `tournaments.gender`. |
| `rueda` | `primera` \| `segunda` \| `unica` \| `otro`. |
| `equipos` | Cuántos `teams[]`, **sin contar "Bye"**. |
| `partidos` | Total de partidos en todos los `rounds[]`. |
| `partidos_jugados` | Los que tienen `fulfilled = true`. Los demás vienen con goles en 0, no en null: contarlos sería llenar las tablas de empates 0-0 falsos. |
| `has_playoffs` | El flag `has_playoffs` del torneo. |
| `g22_tournament_id` `g22_nombre` `g22_external_id_otro_proveedor` `estado` `confianza` | **Todas en `sin_verificar`.** Ver abajo. |

---

## `division` — el orden de precedencia ES la especificación

Se evalúa sobre el nombre **sin el segmento de rueda**, porque si no
"Segunda Rueda" haría match con la división "Segunda". Gana la primera que
coincide:

1. **`Femenino`** — por encima del escalón. Es una división propia, no sólo un
   género: `FEMENINO - TOP 9` no es una variante del Top 14. Los 29 torneos
   femeninos quedan con `division='Femenino'` **y** `gender='femenino'`.
2. `Empresarial`, `Universitario` — competencias propias, no escalones del ascenso.
3. `Top 14`, `Top 13`, `Top 12` — la máxima categoría cambió de tamaño con los
   años: 12 en 2021, 13 en 2022, 14 hoy.
4. `Primera A`, `Primera B`, `Primera C`, `Segunda`, `Tercera`, `Desarrollo`, `Formativo`
5. `Preintermedia`, `Intermedia` — **sólo cuando el torneo no cuelga de ningún
   escalón**. `TOP 14 - Preintermedia B` es `division='Top 14'`, no `Preintermedia`.
6. `otro`

**366 de 811 caen en `otro`, el 45%.** No es ruido: el enum describe las
competencias de mayores, y las juveniles tienen otra estructura entera
(`Grupo N - Zona X` en 2021-2023, `G2 NIVEL x` en 2024-2026). Para esos torneos
lo único que identifica es el nombre completo.

## `grado` — por qué existe

No estaba en el pedido; la agregué y quedó. El motivo es medible: agrupando por
`(anio, division, age_grade, gender, rueda)` hay **185 grupos con más de un
torneo, que involucran 771 de los 811**. O sea que sin un eje más, las columnas
pedidas no identifican un torneo.

`grado` resuelve el eje que colapsaba las competencias de mayores:

```
TOP 14 - Superior        → division='Top 14'  grado='Superior'
TOP 14 - Intermedia      → division='Top 14'  grado='Intermedia'
TOP 14 - Preintermedia B → division='Top 14'  grado='Preintermedia B'
```

Valores: `Superior`, `Intermedia`, `Preintermedia`, `Preintermedia A` a `F`,
`M22`, `juvenil`, vacío.

**No alcanza para los juveniles.** El eje Grupo/Zona/Nivel no tiene columna, y
ahí la identidad sigue siendo el nombre completo — o mejor, el `external_id`.

## Las cinco columnas en `sin_verificar`

El cruce contra `public.tournaments` **no se pudo hacer**: la sesión que generó
este inventario no tenía acceso a la base. Las cinco salen con el literal
`sin_verificar` en las 811 filas, y **no vacías a propósito** — un vacío se lee
como "no encontró match", que es una afirmación que nadie verificó.

Para completarlas hace falta exportar `public.tournaments` con el conteo de
`tournament_seasons` por torneo (eso último decide si el cruce va por
`(nombre, año)` o contra `tournament_seasons.season_code`).
