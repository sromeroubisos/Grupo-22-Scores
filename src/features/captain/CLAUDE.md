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

### 1.5 Las tres especies, y no se mezclan

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
