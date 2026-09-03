# atahockey.com — Asociación Tucumana Amateur de Hockey

Cosecha con [Scrapling](https://github.com/D4Vinci/Scrapling) de los torneos
masculino y femenino de la ATA.

## El dato no está en la página

`/index.php/torneo-masculino/` y `/index.php/torneo-femenino/` son WordPress y
en el cuerpo traen **un solo div vacío**:

```html
<div id="result_stats" style="max-width: 100%; overflow-x: scroll;">..</div>
```

Un `jQuery.get` inline lo llena desde el sistema GDI de marnetweb:

```
https://atahockey.com/stats/stats.php?EquipoId=11&NivId=1&FixId=240&FixSexo=M
```

Scrapear el HTML de WordPress no devuelve nada. El script va directo al
endpoint, que además es la puerta a **todo el catálogo**: su `<select
id="combo_equipos">` lista cada combinación torneo × división disponible, no
solo la que la página muestra por defecto.

| Parámetro | Qué es |
|---|---|
| `FixId` | el torneo (Apertura 2026 = 394, Clausura 2026 = 436, …) |
| `EquipoId` | la división dentro del torneo (Primera, Intermedia, Sub 19, Sub 15, …) |
| `FixSexo` | `M` o `F` |
| `ultimaFecha` | pagina los resultados; fuera de rango, el servidor clava la última |

Las semillas de `SEMILLAS` en el script son las consultas que hoy están
embebidas en cada página de WordPress. Si la ATA cambia el torneo destacado,
esos números cambian — pero el combo sigue trayendo todo lo vigente, así que
alcanza con actualizar la semilla.

## Qué trae cada consulta

- `.tablaPos` → posiciones (`# Equipo PJ PG PE PP TF TC TD Pts`)
- `#table_play_off` → la llave, por instancia, con resultado, puntos y fecha.
  Incluye la **rama de perdedores**: un equipo eliminado en cuartos reaparece
  en "semifinales" jugando la consolación. No es un error de parseo.
- `.tablaHead` + `.tablaRes` → resultados de una fecha; el encabezado dice
  rueda y número
- `.tablaHead` GOLEADORES + `.tablaRes` → goleadores
- link "Descargar Fixture" → PDF en `marnetweb.com.ar`

## Uso

```bash
python scripts/atahockey/scrape_atahockey.py            # ambas ramas
python scripts/atahockey/scrape_atahockey.py M          # solo masculino
python scripts/atahockey/scrape_atahockey.py F --delay 1
```

Sale `out/masculino.json` y `out/femenino.json`. La rama femenina es mucho más
grande que la masculina (50 divisiones contra 9: suma mamis, preintermedia,
promocionales y las zonas A/B/C), así que tarda bastante más.

## Ojo con

- **Un 0-0 puede no ser un empate.** ATA pinta el marcador vacío de un partido
  que todavía no se jugó como `0` y `0`, idéntico a un empate real. Lo único
  que los separa es la clase de la fila. Censo sobre 334 filas de cinco
  divisiones de las dos ramas:

  | clase | filas | en 0-0 | con goles |
  |---|---|---|---|
  | `estado_1` | 146 | 146 | 0 |
  | `estado_4` | 14 | 1 | 13 |
  | `estado_5` | 174 | 3 | 171 |

  `estado_1` es programado; 4 y 5 son jugados, y sus pocos 0-0 son empates de
  verdad. Tomar el marcador al pie de la letra mete la temporada que falta
  jugar como empates: la tabla pasa a decir PJ=14 donde la fuente dice 2. Un
  estado desconocido se trata como NO jugado, que es el error seguro.
- **El encoding.** `stats.php` declara UTF-8 pero arranca con un BOM suelto y
  el WordPress de arriba está en Latin-1 mal transcodificado. Los nombres de
  club del endpoint vienen limpios; los del sitio WP no.
- **Una fecha sin partidos es dato, no falla.** El sitio publica la fecha
  siguiente antes de programarla.
