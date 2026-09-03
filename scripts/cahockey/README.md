# cahockey.org.ar — Confederación Argentina de Hockey

Cosecha con [Scrapling](https://github.com/D4Vinci/Scrapling) de las cuatro
secciones de torneos de la CAH.

| Sección | Salida |
|---|---|
| `torneos-lnh` | `out/lnh.json` |
| `torneo-argentino-de-clubes` | `out/argentino-clubes.json` |
| `argentino-de-selecciones` | `out/argentino-selecciones.json` |
| `torneos-internacionales` | `out/internacionales.json` |

## Tres capas, no una

Lo que se ve en pantalla es la punta. El listado completo está en el HTML pero
en otra columna, y el resultado deportivo está en otro dominio.

**1. El listado vive en `.col-small`, no en `.contenido`.** `.contenido`
muestra un solo torneo (el destacado). El acordeón por años de la columna
lateral trae los 79 de LNH o los 300+ del Argentino de Clubes:

```html
<div class="btn-acordeon-fecha on">2018</div>
<div class="content-acordeon-fecha">
  <ul class="circular2" id="2018">
    <li><a href="#" class="ampliar_torneo" id="505">LRH DAMAS</a><br>
        Desde el 06/09/2018 al 09/09/2018<br>…</li>
```

**2. El detalle se pide por AJAX.** Los `<a>` tienen `href="#"`: el click hace
`POST /updateTorneo` con `id=<n>`. La respuesta trae el PDF del fixture y el
iframe de SICAH. Sin ese POST no hay forma de llegar al resultado.

**3. El resultado deportivo está en SICAH**, otro dominio
(`sicah.cahockey.org.ar/?pub=consultatorneo&torneo=<nombre>`), en **iso-8859-1**
y con tablas de los 2000: posiciones por zona, y un modal
`basic-modal-content<NN>` por partido con día, hora, cancha, resultado y los
dos planteles completos con número y nombre.

`torneos-internacionales` es la excepción: no usa nada de esto. Es un índice de
páginas `historial-torneo-{femenino,masculino}/<torneo>/<id>` con las ediciones
en `.box-ss`, y los enlaces salen del sitio (fih.ch y compañía). No hay
resultado propio para cosechar.

## Uso

```bash
python scripts/cahockey/scrape_cahockey.py                  # las 4 secciones, solo metadatos
python scripts/cahockey/scrape_cahockey.py lnh --sicah      # una sección con detalle SICAH
python scripts/cahockey/scrape_cahockey.py --sicah --delay 1
```

Con `--sicah` cada torneo suma dos requests más y una página de ~500 KB, así que
son unos 5 segundos por torneo: LNH tarda ~7 minutos, el Argentino de Clubes
bastante más. Cada sección se escribe apenas termina, así que un corte a mitad
de camino no pierde lo ya cosechado; el detalle va en `out/sicah/<id>.json`.

## Ojo con

- **El nombre del equipo viene con el marcador pegado.** El encabezado del
  modal es `EQUIPO GOLES`, pero cuando el partido se definió por penales es
  `G. Y ESGRIMA 6 (4)` —seis goles, cuatro en la definición— y si la expresión
  no contempla el paréntesis nace un club llamado "Jockey Club 2 (3)". Si el
  partido no se jugó, en lugar del marcador hay un guión y el nombre queda como
  "Federación Cordobesa -".
- **La mitad de un fixture puede no ser equipos.** El Argentino de Selecciones
  publica la llave entera antes de jugarse, con los cruces por definir escritos
  en el lugar del equipo: "1° Zona A", "Ganador N°13", "Perdedor N°16". Son
  placeholders, no participantes.
- **`Fetcher.post` necesita `X-Requested-With`.** Sin ese header `/updateTorneo`
  contesta 200 con la página entera en lugar del fragmento.
- **`--anio` + `--fusionar`** re-cosecha un año suelto conservando el resto del
  archivo: sirve para corregir la temporada en curso sin volver a bajar las
  ~900 páginas del histórico.
- **SICAH es iso-8859-1** aunque no lo declare bien. Decodificar como UTF-8
  rompe todos los apellidos.
- **Un torneo sin partidos no es un fallo del scraper**: el sitio publica el
  torneo antes de cargar el fixture. El JSON anota `sicah_partidos: 0` y sigue.
