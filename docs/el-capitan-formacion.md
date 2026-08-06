# EL CAPITÁN — LA FORMACIÓN (16–20) Y LAS DECISIONES CON IMPLICANCIA
### Diseño para después de los 15 Momentos. No implementar todavía.

Dos cambios que en realidad son uno: **sacar la planilla y meter los juveniles.**

---

## 1 · POR QUÉ

Hay dos problemas abiertos y comparten la misma raíz.

**El problema de agencia.** El barrido de 240 carreras dio `no-alcanzo-su-techo = 0`: el que
tiene el techo llega siempre, el que no, nunca. La escalera representativa entera se decide
en un sorteo de potencial y ninguna decisión posterior la mueve. El 90,8% recibe su
veredicto antes de la primera jugada.

**El problema de la planilla.** El reparto de 6 fichas de ⏳ Tiempo es la única contabilidad
en un juego hecho de decisiones. *El Ídolo* no tiene sliders: tiene cartas y eventos.
Repartir un presupuesto no genera anécdota — nadie cuenta "esa temporada puse tres fichas
en gimnasio", pero todos cuentan "el año que dejé la facultad para ir al PlaDAR".

**La misma solución resuelve los dos:** el techo pasa de punto a banda, y lo que te ubica
adentro de la banda son decisiones situadas, concentradas en los años que en el rugby real
definen al jugador.

---

## 2 · EL TECHO COMO BANDA

| Hoy | Propuesta |
|---|---|
| A los 18 se sortea un techo puntual | A los **16** se sortea una **banda** (arrancar probando ±6) |
| Nada la mueve | Cada decisión de la Formación te empuja dentro de la banda |
| A los 18 ya sabés tu destino | A los **20** la banda colapsa a tu techo real |

El dado decide tu **rango**. Vos decidís **dónde caés adentro**.

Consecuencia buscada: el que sacó banda alta y jugó mal la Formación no llega; el que sacó
banda media y la jugó bien, sí. El sorteo deja de ser sentencia y pasa a ser reparto de
cartas.

**Nota de calibración:** con la banda ±6 y la Formación empujando, el objetivo sigue siendo
el de v1.0 — **15-25% de carreras con al menos un cap, ~5% con 20+** — pero alcanzado por
decisión y no por bajar la barra. Medir las dos cosas por separado: cuánto sube por la banda
y cuánto por las decisiones.

---

## 3 · LA ESCALERA REAL, 16 A 20

No es lineal y **no debe serlo**. Son puertas que pueden abrirse o no.

```
16  Último tramo de juveniles en el club. M16/M17.
    → todo pasa en el club. Sin selección, sin plata, sin mercado.

17  El Campeonato Argentino juvenil con el seleccionado de tu unión.
    → PUERTA: te convocan o no. No ser convocado a los 17 es un
      resultado normal, no un fracaso — y hay una segunda chance a los 18.

18  Primera del club (o Intermedia si no te dan el salto).
    → PUERTA: academia regional / PlaDAR.
    → PUERTA: primera convocatoria a franquicia del SRA (rara a esta edad).

19  Primera consolidada. Segunda ventana de unión.
    → PUERTA: franquicia del SRA en serio.
    → PUERTA: Los Pumitas M20.

20  Último año de M20: Rugby Championship M20 y Mundial M20.
    → La banda colapsa. Empieza el juego como está hoy.
```

**Reglas de diseño de las puertas:**
- Ninguna es obligatoria para llegar a Los Pumas. Hay caminos tardíos.
- Perder una puerta abre otra: si no te convocan a la unión a los 17, aparece el evento del
  entrenador que te ve en un partido de club.
- **La puerta se abre por atributo + decisión, no por sorteo puro.** Si es sorteo puro,
  reprodujimos el problema una capa más arriba.

---

## 4 · DECISIONES EN VEZ DE FICHAS

**Lo de abajo no cambia.** La economía de tiempo puede seguir existiendo internamente. Lo
que cambia es la superficie: en vez de un reparto, **3 o 4 decisiones situadas por
temporada**, cada una con costo visible y efecto en atributos.

**Antes:**
```
Repartí 6 fichas: [entrenar] [trabajar] [club] [familia] [gimnasio]
```

**Después:**
```
EL PROFE Y EL JEFE
El profe te quiere en el gimnasio martes y jueves a las 7.
Tu jefe te pidió justo esos dos turnos.

  Ir al gimnasio      → +Potencia. ⚠️ Te bajan las horas.
  Cubrir los turnos   → La plata entra. El profe deja de contar con vos.
  Intentar las dos    → +Potencia a medias. ⚠️ Llegás fundido a la temporada.
```

### Las tres reglas

1. **Ninguna opción dominante.** Si una siempre conviene, no es una decisión: es un botón.
2. **El costo siempre visible antes de elegir.** El ⚠️ de *El Ídolo* funciona porque
   cumple lo que amenaza.
3. **La consecuencia aterriza en la ficción y en el número.** El atributo tiene que ser el
   resultado de algo que pasó, no una celda que llenaste.

### Ejes de decisión de la Formación

| Eje | Tensión | Atributos en juego |
|---|---|---|
| **Gimnasio vs trabajo** | El cuerpo o la plata | Potencia, Choque · estabilidad económica |
| **Facultad vs entrenamiento** | El plan B o el plan A | Visión, Liderazgo · estabilidad |
| **Club vs unión** | Lo tuyo o la vidriera | Pertenencia · Cartel |
| **Puesto** | Te quieren cambiar a los 17 | cambia la familia entera ⚠️ irreversible |
| **Cuerpo** | Jugar el Argentino con una molestia | banda del techo · 🦴 |
| **Vestuario** | El bautismo, la pelea, el que se mandó una | Liderazgo · Pertenencia |

**El eje del puesto es el más fuerte y hay que usarlo una sola vez.** Que a los 17 te
propongan pasar de centro a ala, o de segunda a tercera línea, con la banda de techo
recalculada — es la decisión más grande que puede tomar un juvenil real y en el juego debería
sentirse igual.

---

## 5 · RITMO

La Formación no puede durar lo mismo que cinco temporadas normales. Es un **prólogo denso**:
más decisiones por año, menos simulación.

| | Formación (16–20) | Carrera (21+) |
|---|---|---|
| Duración total | ~2 min de las 8–15 de la partida | el resto |
| Decisiones por año | 3–4 | 1–2 |
| Momentos | 1 en toda la etapa (el debut en primera) | 0,62 por temporada |
| Mercado | no existe | sí |
| Plata | no existe | desde el contrato |
| Simulación de temporada | resumen de 2 líneas | crónica completa |

**El Momento único de la Formación es el debut en primera.** Uno solo, y que sea el de tu
familia. Es lo que hace que el prólogo termine con una imagen y no con una tabla.

---

## 6 · ORDEN DE IMPLEMENTACIÓN

Cuando llegue el turno, en este orden y con un digest refrescado entre cada paso:

1. **Techo como banda**, sin tocar la superficie. Se mide sola: el barrido tiene que subir
   del 9,2% aunque las decisiones sigan siendo fichas.
2. **Decisiones en vez de fichas**, para las temporadas que ya existen. Sin juveniles
   todavía. Es un cambio de superficie sobre una economía que ya está probada.
3. **La Formación 16–20** como fase nueva, usando los dos anteriores.

Hacerlo al revés —los juveniles primero— mete tres cambios de balance en un solo movimiento
del digest y no vas a poder leer cuál hizo qué.

---

## 6.bis · SI LA FORMACIÓN ALIMENTA `built`, OJO CON LA BRECHA A LOS 21

Anotado cuando entró el techo partido (`potentialBase` + `built`, motor 0.8.0) y
**hay que resolverlo antes de escribir la primera decisión de juveniles.**

El techo ya no es un punto sorteado: es material más lo construido, y lo
construido lo suben las decisiones caras. Medido, eso trajo un modo de fracaso
nuevo y bueno —el que apunta más alto se queda sin años para alcanzarse, 17,8%
de las carreras del brazo que se entrega— pero también trae un riesgo que la
Formación puede volver estructural:

**Si los años 16–20 también suman a `built`, un jugador puede llegar a los 21 con
la brecha ya abierta y sin haber jugado una temporada.** O sea, empezar el juego
propiamente dicho debiéndose seis puntos a sí mismo, por decisiones que tomó
cuando todavía no entendía el sistema. Eso no es "apuntaste alto": es un
handicap repartido en el prólogo.

Tres salidas posibles, ninguna elegida todavía:

- La Formación construye `built` pero también **acerca la media**, así que se
  llega a los 21 con la brecha del mismo tamaño que hoy.
- La Formación mueve `potentialBase` en vez de `built` — el prólogo reparte
  material, no deuda.
- `built` de la Formación entra con **tope propio**, más chico que
  `POTENTIAL_BAND`, para que el prólogo no pueda gastar la banda entera.

Medir antes de elegir: la pregunta es cuánta brecha tiene un jugador a los 21 en
cada variante, y si el barrido de agencia la lee como decisión o como castigo.

---

## 6.ter · LA DIMENSIÓN QUE FALTA — PRERREQUISITO DE LOS JUVENILES

**No es trabajo futuro opcional. Sin esto, la Formación no se puede escribir.**

Hoy el tiempo de juego sale de una sola cuenta: `share = f(edge)`, con
`edge = ovr − clubRating` (`engine/statistics.ts`). O sea que el juego mide **si
sos mejor que tu club** y no tiene ningún concepto de **cuánto jugaste por
decisiones tuyas**.

Se descubrió intentando lo contrario. La idea era escalar `pull` por el
rendimiento —"si no jugás, no llegás"— para devolver el modo de fracaso. Medido:
no movió nada, y el porqué es peor que el síntoma. El brazo que NO se entrega
juega MÁS que el que sí (mediana de `share` 0,90 contra 0,71), porque tiene techo
bajo, converge rápido y le sobra para su club. Una compuerta sobre `share`
premia al que menos se compromete.

**Lo que falta no es una palanca bloqueada: es una dimensión.** Los minutos
tienen que poder bajar por cosas que el jugador ELIGE o le PASAN, no solo por ser
flojo:

- la convocatoria que te saca del club semanas enteras
- la lesión, que hoy solo existe como riesgo de una carta
- el laburo contra el entrenamiento
- la suspensión, que ya existe pero es la única de la lista

Y la Formación la necesita ENTERA, no en parte: los años 16–20 son exactamente
los años en que esas cuatro cosas definen a un jugador. Un prólogo escrito sobre
`share = f(edge)` sería un prólogo donde el pibe que se rompe la espalda
entrenando juega lo mismo que el que no, porque los dos tienen la misma media.

**Orden: esto va ANTES del §6.bis, y los dos van antes de la primera decisión de
juveniles.**

### La forma de `f`, para cuando el canal exista

Se escribió, se midió inerte y se sacó del motor —código con la forma correcta
sobre un canal que no transporta es una trampa: el próximo que lo lea va a creer
que los minutos afectan el crecimiento y va a diseñar encima—. Queda acá, que es
donde no se confunde con comportamiento:

```ts
pull = (techo − media) / K × f(rendimiento)

f(share) = min(1, PISO + (1 − PISO) × share / SHARE_PLENO)
  PISO        = 0,25   // el que no juega crece POCO, no NADA. Un cero duro
                       // convierte una lesión a los 19 en el fin de la carrera
  SHARE_PLENO = 0,60   // f distingue entre jugar y no jugar, no entre jugar
                       // mucho y jugar muchísimo
```

Con `SHARE_PLENO` en 0,60 la compuerta resultó inerte (f = 1 en el 95% de las
temporadas del brazo flojo). Subirlo la activa, pero apuntando al brazo
equivocado — el que se entrega juega menos porque paga minutos. **No es un
problema de calibración: es que el canal no está.**

---

## 7 · LO QUE NO HAY QUE HACER

- **No convertir la Formación en un tutorial.** Son decisiones reales con consecuencias
  reales, no una explicación de las reglas.
- **No garantizar las puertas.** Si a los 17 siempre te convocan, no hay decisión.
- **No dejar que la Formación decida sola.** Si al llegar a 21 la carrera ya está resuelta,
  movimos el problema de agencia cinco años más temprano en vez de arreglarlo.
- **No perder el ritmo.** Si el prólogo dura más de dos minutos, el jugador abandona antes
  de llegar a lo que el juego promete.
