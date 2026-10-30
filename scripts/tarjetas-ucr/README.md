# Tarjetas oficiales de la UCR → planteles y eventos

Las tarjetas de partido de la Unión Cordobesa llegan como PDF escaneado (sin texto).
Este directorio las convierte en el JSON que consume `src/scripts/ficha-partido-local.ts`.

Dependencias (una vez): `pip install rapidocr-onnxruntime pymupdf pillow`.

```
export TARJETAS_DIR=/ruta/a/los/pdf            # una tarjeta por PDF, 2 páginas
python extract.py                              # página 1: cabecera, planteles, árbitro → ocrraw/
python cells.py --all                          # tablas de incidencias, celda por celda → cellsout/
python build.py                                # arma cards.json y valida contra el marcador
python review.py                               # lista lo que quedó dudoso
python render.py "<nombre>"                    # recorta las incidencias a rev/ para mirarlas
node -r ts-node/register -r tsconfig-paths/register \
  src/scripts/top10-centro-tarjetas.ts cards.json --out src/scripts/formaciones/<fecha>-top10centro-tarjetas.json
```

Lo que hay que saber:

- **Leer la tabla de incidencias por celda, no por texto corrido.** El OCR con detección se
  come las celdas de un dígito (minutos, dorsales, puntos). `cells.py` recorta cada celda con
  la grilla (líneas cada ~31 px a 200 dpi, 6 columnas) y usa solo el reconocedor.
- **El reconocedor confunde glifos aislados**: `1`→`→`, `9`→`。`, `8`→`：` y agrega un `０`
  de ancho completo a algunos minutos (`20０` = 20). Está tratado en `cells.num` y `build.min_from_raw`.
- **La página 2 continúa las incidencias** y, si solo un equipo sigue, su tabla va en la
  mitad izquierda: el lado sale del título de la tabla, no de la posición.
- **El 2T mezcla minutos absolutos y relativos**: menor a 40 es relativo (+40), de 40 en
  adelante es absoluto. `ET` es entretiempo (se carga como 2T minuto 0).
- **Control de calidad = el marcador.** Los eventos de cada tarjeta tienen que sumar el
  marcador impreso en la cabecera; `build.py` lo imprime por tarjeta. Los cambios sin pareja
  (un ingreso sin "Se retiró") son rarezas de la propia tarjeta, no errores del OCR.
- **El DNI no se guarda en ningún lado**: solo sirve para unificar a un mismo jugador entre
  tarjetas. `cards.json` lo trae, así que no se versiona.
- Los nombres largos se pisan con la columna del DNI en el original; ver `ARREGLOS` en
  `top10-centro-tarjetas.ts`.
