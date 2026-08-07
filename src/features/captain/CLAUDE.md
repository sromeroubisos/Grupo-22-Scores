# CLAUDE.md — El Capitán

Convenciones del feature `src/features/captain` y de la ruta
`src/app/juegos/minijuegos/el-capitan`.

El `CLAUDE.md` de la raíz es de **Carrera de Rugby** y no aplica acá salvo donde
se lo cite explícitamente: son dos juegos con catálogos, motores y calibraciones
separados a propósito.

Este archivo arranca con la disciplina de tests porque es la que se ganó a los
golpes. Lo demás se irá sumando.

---

## 1. Tests: la disciplina

### 1.1 La regla del rojo

> **UN TEST ROJO SE ACEPTA CUANDO ES EL ÚNICO INSTRUMENTO QUE MIDE UN PROBLEMA
> ABIERTO. NO SE ACEPTA CUANDO MIDE ALGO QUE DECIDIMOS NO ARREGLAR.**
>
> El primero es una alarma sonando. El segundo es una alarma rota.

La diferencia no es de gravedad sino de destino. Un rojo que vigila algo que
vamos a arreglar sigue haciendo trabajo todos los días: si el número empeora, te
enterás. Un rojo que vigila algo que aceptamos como está no informa nada nunca
más, y encima entrena a todo el mundo a ignorar la suite — que es la única forma
de perder los otros rojos.

Cuando un rojo cae del lado equivocado hay dos salidas honestas, y ninguna es
dejarlo:

- **Se arregla**, y el test vuelve a verde.
- **Se acepta el mundo nuevo**, y entonces la banda se mueve *reautorizándola
  contra la premisa* (§1.3) y el commit explica qué mundo pasó a afirmar.

### 1.2 El marcador `ALARMA-VIVA`

Un rojo aceptado tiene que poder distinguirse de un rojo podrido **de un
vistazo y con un grep**, porque la diferencia vive en la cabeza de quien lo dejó
y esa cabeza se va en tres semanas.

Todo rojo vivo lleva, en la línea del assert o inmediatamente arriba:

```ts
// ALARMA-VIVA: <problema abierto, en una línea>
```

Reglas del marcador:

- **Nombra el PROBLEMA, no el síntoma.** `// ALARMA-VIVA: la base de la pirámide
  se cayó` sirve; `// ALARMA-VIVA: da 0,01` no dice qué se rompió.
- **Se borra cuando el problema se cierra**, en el mismo commit que lo cierra. Un
  marcador que sobrevive a su problema es exactamente la alarma rota que este
  mecanismo existe para evitar.
- El censo es:

  ```
  grep -rn "ALARMA-VIVA" src/features/captain src/app/juegos/minijuegos/el-capitan --include=*.ts --include=*.tsx
  ```

  Con `--include`, porque si no este mismo archivo aparece explicando la
  convención y el censo deja de leerse de un vistazo. Tiene que devolver la lista
  completa de lo que está roto a sabiendas: si la suite tiene un rojo que no
  aparece ahí, es deriva y se trata como tal.

### 1.3 Las bandas se auditan contra la PREMISA, no contra la medición

La pregunta al escribir o revisar una banda es **«¿qué mundo afirma esto?»** y
nunca **«¿pasa hoy?»**.

Está medido lo que cuesta confundirlas. La banda de `nunca salen del club` decía
`[0,12 – 0,45]` y estuvo verde durante todo el desarrollo: toleraba que el 85% de
las carreras pisara un carril representativo, en un juego cuya premisa es que la
mayoría **no sale del club**. No avisó nunca, porque describía el estado del
motor en el momento en que se escribió en vez del mundo que queremos. Recién se
notó cuando el número se fue a 0,01 y el escándalo la sacó de la banda.

Una banda calibrada contra la medición codifica el mundo roto y deja de ser un
test para pasar a ser una firma.

Corolario práctico: cuando muevas una banda, el comentario dice **qué mundo
afirma ahora y de dónde sale ese mundo** —el doc de diseño, un dato real del
rugby, una decisión tomada—. Si el único argumento disponible es "es lo que da
hoy", la banda no está lista para moverse.

### 1.4 Los tests se nombran por INTENCIÓN, no por medición

Un test que se llama `CUÁNTOS SE QUEDAN CORTOS DE SU TECHO` queda obsoleto en
cuanto el diseño cambia de opinión sobre esa medición, y peor: su nombre y su
comentario siguen defendiendo la premisa vieja, así que la premisa sobrevive al
diseño que la retiró. Pasó, y costó un ciclo entero de trabajo persiguiendo un
`= 0` que ya no significaba nada.

`CONSTRUIR VALE LA PENA Y PUEDE SALIR MAL` sobrevive a cualquier recalibración,
porque nombra lo que el juego quiere que sea verdad.

Cuando la intención cambia, el test **se da vuelta** —mismo assert, signo
invertido— y el comentario viejo se reemplaza por **POR QUÉ CAMBIÓ LA PREMISA**.
En seis meses eso vale más que justificar el estado actual.

### 1.5 Nunca te refieras a algo por su posición en una lista

> **UN ÍNDICE NO DICE QUÉ ES LA COSA. DICE DÓNDE ESTABA CUANDO MIRASTE.**
>
> Pedí por lo que la cosa ES —su tier, su kind, su id— y que falle ruidosamente
> si no está.

Van **tres** apariciones de esta misma familia, y las tres fallaron igual: en
silencio, cuando la lista cambió abajo, devolviendo números que parecían sanos.

| Dónde | Qué decía | Qué pasó |
|---|---|---|
| `calibration.test.ts` | `const CARTA = 0`, «la elección más obvia» | el catálogo se reordenó y el 0 pasó a ser la carta CARA. La pirámide se midió con 160 jugadores maximizando el compromiso y llamándolos "el jugador normal" |
| `moments.ts` | `switch` con `default:` que resolvía el tackle | entró La Banda, el default le mandó una mano de tackle a una corrida, y la carrera quedó trabada sin que nada fallara |
| `agency.test.ts` | terciles ordenados por el techo final | con el techo móvil, cada brazo caía en un tercil distinto y la comparación pareada se rompía |

Las tres medicinas son la misma: **pedir por identidad y estrechar el tipo**.
`trainingsFor(f).find(t => t.tier === 'media')` con un `assert` al lado;
`PreContractKind` para que el `default` quede en `never`; ordenar los terciles
por `potentialBase`, que es lo sorteado y no lo que las decisiones mueven.

El olor a distancia: si tenés que leer OTRO archivo para saber qué significa el
índice que estás escribiendo, ya está mal. Y si el comentario al lado explica qué
hay en esa posición, peor todavía — ese comentario es exactamente lo que se va a
quedar viejo sin que nadie lo note.

### 1.6 Hacé el álgebra antes de escribir el mecanismo

> **FIJATE A QUÉ SE REDUCE TU MECANISMO CUANDO LAS CONSTANTES SON CONSTANTES.
> SI EL RESULTADO ES UN NÚMERO, ESCRIBISTE UN NÚMERO.**

Van dos veces que un mecanismo que parecía un sistema era una constante
disfrazada, y las dos se descubrieron tarde:

**`pull = gap / 18`** parecía crecimiento y era **convergencia garantizada**. Un
lazo proporcional a la brecha cierra la brecha siempre, con solo darle
temporadas. Consecuencia: `no-alcanzó-su-techo = 0` no era un síntoma de
calibración, era una identidad del modelo — y toda decisión que cayera adentro
del recorte solo podía cambiar CUÁNDO llegabas, nunca ADÓNDE. Se rediseñó la
carta de pretemporada dos veces antes de notarlo.

**Curva sintética fija + cupo** parecía competencia y era **un percentil**:

```
entrás ⟺ rank ≤ K ⟺ C · P(X > ovr) ≤ K−1 ⟺ ovr ≥ F⁻¹(1 − (K−1)/C)
```

Con `F`, `K` y `C` fijas, el lado derecho es un número. O sea: un umbral con más
pasos, y con la misma erosión que el umbral que venía a reemplazar. Esta se
agarró ANTES de escribirla, y ahorró un ciclo — el rojo habría vuelto tres
cambios después, sin saber cuál lo rompió.

La verificación es de lápiz y papel y tarda menos que el commit. Preguntas útiles:

- Si todas las entradas suben en la misma cantidad, ¿cambia algo el resultado?
- ¿Hay un punto fijo al que esto converge sin importar el camino?
- ¿La decisión del jugador entra en la fórmula, o se cancela?

Es la hermana de §2 —verificar que exista el canal— pero se hace un paso antes:
§2 mide, esto se resuelve sin correr nada.

### 1.7 El instrumento contesta la pregunta que tiene escrita

> **EL INSTRUMENTO CONTESTA LA PREGUNTA QUE TIENE ESCRITA, NO LA QUE LE HICISTE.
> Antes de creerle a una medición, escribí en una línea qué pregunta contesta su
> CÓDIGO — no su nombre.**
>
> Corolario operativo: **un cero es una acusación contra el instrumento hasta que
> se demuestre lo contrario.**

Dos veces en un mismo día, y las dos con la misma forma:

| Se llamaba | Contestaba |
|---|---|
| `mejorTrack` — "la mejor vía" | "máximo corrido": un carril juvenil solo puede ser el mejor de alguien que nunca subió más. Academia y M20 daban `0,000` y parecían escalones inexistentes; medidos por temporada pisada eran 36 y 12 |
| `CARTA = 0` — "la carta del oficio principal" | "el primer elemento del array", que después del rediseño era la carta CARA. 160 jugadores maximizando el compromiso, llamados "el jugador normal" |

Es pariente de §1.5 pero no es lo mismo: aquello es un índice que se desalinea de
su lista, esto es un nombre que promete una semántica que el cuerpo no tiene. Un
índice se arregla pidiendo por identidad; esto se arregla leyendo el cuerpo antes
de citar el resultado.

### 1.8 El promedio de la entrada no es la entrada del promedio

> **SI LO QUE TE IMPORTA ES UNA TASA, CALIBRÁ LA TASA — nunca el parámetro que la
> produce.**

Medido dos veces en la misma sesión, las dos en la misma dirección:

- Al arreglar `SQUAD_SHAPE` se igualó `E[corte]` para preservar el nivel. Lo que
  había que preservar era `E[P(entra)]`, y entre uno y otro hay la normal
  acumulada y después "alguna vez en catorce temporadas" — las dos convexas en
  esa zona. Por Jensen, repartir cortes alrededor de una media sube el promedio
  del resultado aunque la media del corte no se mueva. El piso cayó de 0,531 a
  0,470 en un commit que se declaró neutral.
- Ordenar la selectividad `q` de los carriles no ordena `P(pisa)`, porque
  `P ≈ 1 − (1−q)ⁿ` y la ventana `n` va de 3 temporadas (M20) a la carrera entera
  (A-XV). Con el mismo `q`, A-XV se pisa cuatro o cinco veces más por pura
  aritmética de intentos.

La regla práctica: fijá el objetivo en la unidad que te importa —`P(pisa)` por
carrera, no el corte por temporada— y **derivá** el parámetro desde ahí. Si el
camino de vuelta no tiene forma cerrada, resolvelo numéricamente; lo que no vale
es calibrar el parámetro y suponer que la tasa lo sigue.

### 1.9 Una derivada congelada es una mentira con fecha de vencimiento

> **SI UN NÚMERO SE PUEDE CALCULAR DESDE OTRO, NO LO ESCRIBAS: CALCULALO. Una
> constante que duplica un hecho ya representado en otro lado es una mentira con
> fecha de vencimiento.**

Correcta el día que la escribís, silenciosamente falsa para siempre, porque nada
la vuelve a mirar cuando cambia aquello de lo que dependía.

| Constante | Qué era en realidad |
|---|---|
| `SQUAD_SHAPE` en el corte | un efecto que el álgebra cancelaba, guardado como comentario que afirmaba que existía |
| `COHORT_MATURITY_AGE = 22` | una SALIDA del modelo de crecimiento, congelada como parámetro |

Por eso la camada deriva su nivel de `POTENTIAL_MEAN_GAP` y su tiempo del ritmo
de crecimiento, en vez de repetirlos. Y por eso `cohortSize` se calcula en vez de
escribirse.

**Al escribir una constante nueva, clasificala en el comentario:**

- **PARÁMETRO LIBRE** — una elección genuina que nada más determina.
  `POTENTIAL_BAND`, `TYPICAL_BUILD_SHARE`, `POTENTIAL_REALIZATION`. Se discute.
- **DERIVADA** — se calcula desde otra cosa. No se escribe.
- **ESPEJO** — se escribe por costo o por legibilidad, y el comentario dice
  **de qué es espejo y qué hay que actualizar cuando eso cambie.**

Un número sin etiqueta se lee como parámetro libre, y ahí empieza el problema.

### 1.10 Las tres especies, y no se mezclan

| | Qué afirma | Cuándo se actualiza |
|---|---|---|
| **DIGEST** (`determinism.test.ts`) | valores literales contra el catálogo real y versionado | en cada cambio intencional del motor, en **commit propio** |
| **CALIBRACIÓN** (`calibration.test.ts`) | la forma de la pirámide, contra la premisa | cuando la premisa cambia, no cuando el número cambia |
| **AGENCIA** (`agency.test.ts`) | cuánto manda el dado contra cuánto mandás vos | nunca contra un absoluto: todo relativo y pareado |

El digest se mide con `npm run test:captain-freeze`, que lo corre en un worktree
limpio. Existe porque El Capitán no tiene catálogo propio —lee los clubes de
`features/career/data/`— y con ediciones sin commitear ahí, las carreras se
mueven enteras sin que el motor haya cambiado una línea. El rojo del catálogo y
el rojo del motor eran el mismo rojo hasta que se separaron.

---

## 2. Antes de proponer una palanca, verificar que el motor tenga un canal

Se pagó dos veces en el mismo ciclo. La carta de pretemporada se rediseñó entera
—presupuesto, y después costo adentro de la carta— para mover una medición que no
se podía mover: `pull` es proporcional a la brecha, así que el lazo converge a
`potential` solo, y todo lo que la carta hacía caía adentro del mismo recorte.
Una curva de crecimiento de diez líneas, corrida ANTES, lo habría mostrado.

Y se pagó de nuevo con `f(rendimiento)`: una compuerta sobre el tiempo de juego,
cuando el tiempo de juego sale de `ovr − clubRating` y no de ninguna decisión.
La palanca premiaba justo al brazo que quería frenar.

La verificación es barata y va primero: **una sonda descartable que mida el canal
aislado**, antes de diseñar encima. Si el canal no transporta, no es un problema
de calibración y ninguna cantidad de tuning lo va a arreglar.
