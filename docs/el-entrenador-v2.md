# El Entrenador v2 — auditoría y diseño

Fecha: 2026-10-14. Rama: `feat/carrera-rugby-v2`. Motor de partida: 1.4.0, SCHEMA 5.

Decisiones del usuario (2026-10-14):

- **Economía mixta según categoría.** Amateur en las divisiones bajas, viáticos en
  los escalones intermedios, semiprofesional en la élite de cada rama. El exterior,
  según su liga (profesional, semiprofesional o amateur).
- **Ofertas del exterior para los dos:** para el entrenador (clubes de otros países
  que lo quieren dirigiendo) y para sus jugadores (clubes de afuera que se los
  quieren llevar).

---

## 1. Auditoría: qué hay y qué no funciona

| Sistema | Qué existe | Problema concreto |
|---|---|---|
| Decisiones | 40 tarjetas de texto en 6 familias, 5 por temporada, 2-3 opciones | Doce temporadas son 60 tarjetas sobre un pool de 40: se repiten. No nombran jugadores ni rivales reales. Ninguna tiene mecánica propia: todas son "elegí una frase". |
| Plantel | 26 jugadores con nivel, techo, edad, dorsal, certificación | Sin moral, fatiga, lesiones persistentes, contrato, estadísticas ni personalidad. No hay forma de evaluar a nadie más allá del nivel. |
| Temporada | Se juega entera de una vez, después de las 5 tarjetas | No hay nada que decidir mientras se juega: el entrenador mira una tabla. |
| Economía | Un presupuesto anual con 4 ingresos y 7 egresos; caja que puede quedar negativa | La deuda solo suma presión (+3 / +7 / +14). No restringe nada: se puede seguir comprando mejoras, nada se recorta, ningún jugador se va por eso. "Si tiene déficit no pasa nada" es literal. |
| Sponsors | Un número: `hinchada × 21.000 × gestión` | No existen empresas, contratos, vencimientos ni negociación. |
| Objetivos | Una posición por fuerza (campeón / playoff / mitad / permanencia) + caja + "un pibe en el XV" | Un solo eje deportivo; la cantera se cumple con poner un pibe; no hay metas de mediano ni largo plazo. |
| Juveniles | No existen como sistema: el que se retira deja lugar a un pibe generado | No hay M19, captación, planes, cesiones ni objetivos de formación. |
| Mercado de jugadores | No existe. `pierdeMejor` borra al mejor en una tarjeta | Nadie viene, nadie se va por una oferta real, no hay exterior. |
| Mercado de entrenadores | Vacantes reales nacionales con puerta regional (v1.4) | Solo Argentina. |
| Mejoras del club | 5 × 3 niveles pagados con la caja | Funcionan, pero no tienen costo de mantenimiento: después de comprarlas son gratis para siempre. |

Lo que SÍ funciona y se conserva: el motor de partido calibrado (`match.ts`), los
formatos por edición, las llaves, el mundo con ascensos y descensos, el mercado de
entrenadores, la subcomisión en tres ejes, la presión con piso, el guardado que se
migra y se sanea, y el harness de mil carreras.

---

## 2. El modelo

### 2.1 El estatus de cada división (`data/professionalism.ts`)

| Estatus | Divisiones | Qué cobra el jugador |
|---|---|---|
| `semipro` | Top 14 de la URBA | Contrato con sueldo mensual y duración |
| `viaticos` | Primera A y B de la URBA, Top 10 de Córdoba, Top 10 del Litoral, Copa de Oro, NOA A, NEA A, Pampeano A, Regional Patagónico | Viático mensual (transporte, comida); no hay pase |
| `amateur` | El resto | Nada. El club puede conseguir **becas** (estudio, trabajo) para retener |

En el exterior manda el `professionalStatus` del catálogo de Carrera de Rugby.

### 2.2 El jugador

Se agregan a `SquadPlayer`, todos persistidos y migrados con valores neutros:

- `morale` 0..100 — sube jugando y ganando, baja sin minutos, con conflictos y
  con atrasos en los viáticos. Debajo de 35 rinde menos y pide salir.
- `fatigue` 0..100 — sube por partido y por carga de entrenamiento, baja con
  descanso. Arriba de 70 rinde menos y se lesiona más.
- `injury` — fechas que le quedan afuera (0 = sano).
- `personality` — `lider`, `profesional`, `ambicioso`, `leal`, `conflictivo`,
  `tranquilo`. Cambia cómo reacciona a minutos, ofertas y conflictos.
- `homegrown` — formado en el club.
- `commitment` 0..100 — el arraigo: cuánto le cuesta irse.
- `deal` — `{ kind: 'amateur' | 'beca' | 'viatico' | 'contrato', monthly, years }`.
- `stats` — de la temporada: partidos, titularidades, tries, puntos, tackles,
  nota media; y `career` con los totales.

El **valor de mercado** NO se guarda: se deriva de nivel, edad, techo, forma y
contrato. Solo se muestra donde existe de verdad: en el exterior y en `semipro`.

### 2.3 La temporada en tres tramos

La fase regular se divide en tres tramos de fechas. Cada tramo:

1. **Semana de entrenamiento** (minijuego): se reparte la carga de 5 días entre
   intensidad y foco (scrum y line, defensa, ataque, físico, recuperación). Mueve
   la fatiga, el riesgo de lesión, el rendimiento del tramo y el crecimiento de
   los jóvenes.
2. **Una o dos situaciones** del pool de eventos, ahora con contexto real: nombran
   al jugador sin minutos, al rival directo, al sponsor que vence.
3. **Partido clave** (minijuego): el partido del tramo contra el rival directo o
   el clásico. Plan previo según rival, clima y estado físico; ajuste en el
   entretiempo según el marcador.
4. Se juegan las fechas del tramo, partido a partido: alineación real (sin
   lesionados, con la fatiga y la moral de cada uno), tries repartidos por
   puesto, estadísticas individuales.

Las ventanas de pases son la pretemporada y el corte entre el tramo 1 y el 2.

### 2.4 Economía

Ingresos: cuotas, **entradas** (por partido de local, según gente, rival y racha),
buffet, **sponsors (contratos)**, subsidio de la unión, **premios** (playoff,
Interior), **compensaciones** por jugadores que se van.

Egresos: categorías y formativas, estructura, **mantenimiento de las mejoras**,
indumentaria, sanidad, arbitrajes, viajes, **viáticos, becas y contratos**,
**cuerpo técnico**, **intereses de deuda**.

El flujo de caja se mueve **por tramo**, no una vez al año: se ve venir.

**Consecuencias de la deuda, proporcionales y progresivas** (por meses de deuda y
por cuántos cierres seguidos lleva):

| Estado | Qué pasa |
|---|---|
| Sana | Nada. |
| Ajustada (< 3 meses) | Alerta. Los sponsors nuevos piden más garantías (−10 % de atractivo). |
| Complicada (3 a 6) | No se pueden sumar contratos, viáticos ni becas nuevas. Mejoras bloqueadas. La moral de los que cobran baja por atrasos. |
| Grave (≥ 6) | La subcomisión impone un **plan de ajuste**: recorte de viáticos (moral, salidas), mantenimiento diferido (la estructura se deteriora), socios que se van. Presión alta. Un sponsor puede rescindir. |
| Crónica (grave dos cierres seguidos) | **Intervención**: el siguiente cierre en grave es despido seguro; en `semipro` se vende al mejor contrato. |

Para salir: préstamo de la unión (con interés y cuotas), adelanto de cuotas (cuesta
socios), un evento a beneficio (rinde según la gente), recortes elegidos por el
entrenador, vender o dejar ir jugadores.

### 2.5 Sponsors (`data/sponsors.ts`, `engine/sponsors.ts`)

Empresas **ficticias** por sector (corralón, concesionaria, bodega, láctea,
cooperativa, aseguradora, supermercado, agro, tecnología, energía) y tamaño
(local, regional, nacional). Cada una evalúa el **atractivo** del club: categoría,
gente, resultados recientes, reputación y exposición (Interior, Nacional, playoff);
y tiene su presupuesto y su tolerancia a una crisis.

Tres lugares: **principal** (camiseta) y **dos secundarios**. Prospectos que
aparecen según el atractivo; **negociación** en rondas (monto, años, cláusula por
objetivo); contratos con vencimiento, renovación según la satisfacción, rescisión
por descenso o por crisis.

### 2.6 Objetivos

Cada temporada la subcomisión fija:

- **Deportivo principal** (el de hoy, por fuerza).
- **Uno o dos secundarios con contexto**: superar los puntos del año anterior,
  ganar de local, ganarle al rival directo, la identidad de juego que se eligió.
- **Formativo**: promover N juveniles, dar minutos a los formados en el club.
- **Económico**: cerrar sin déficit, bajar la deuda, cerrar un sponsor principal.

Y un **proyecto de tres temporadas** (ascender, estructura, base propia, sanear),
que se renueva y crece cuando se cumple.

Consecuencias: confianza (presión), presupuesto del año siguiente, gente,
reputación.

### 2.7 Juveniles (`engine/academy.ts`)

Un M19 de 8 a 12 pibes de 16 a 19 años: puesto, nivel, techo **real oculto** y un
**rango estimado** que se afina con la captación, personalidad, plan de desarrollo
(físico, técnico, minutos, equilibrado). Cada año, **jornada de captación**
(minijuego): candidatos con información parcial y puntos de observación para
gastar antes de elegir. Una joya aparece muy de vez en cuando, sin garantías.
Decisiones: mantener, promover a primera, ceder a un club de abajo, liberar.
A los 20 deja el M19: sube si hay lugar en el plantel y, si no, se va. Construido
en la etapa 4 (motor 2.3.0, esquema 9): ver "Cómo quedó la etapa 4" en el plan.

### 2.8 Mercado de jugadores (`engine/transfers.ts`)

- **Salidas**: clubes del país (de más arriba, o el `semipro` de su rama) y del
  exterior (por liga, nivel y banda económica) se interesan según nivel, edad,
  techo, forma y estadísticas. Cada oferta tiene club, país, liga, condiciones,
  compensación para el club y la **inclinación del jugador** (personalidad,
  arraigo, salto de nivel, plata). Decisiones: aceptar, rechazar, **retener**
  (beca, viático o contrato según el estatus) o **negociar** la compensación.
- **Llegadas**: libres, los que vuelven del exterior, los que quieren subir de
  categoría y extranjeros de la región. Su disposición sale del atractivo del club.
  A veces otro club compite por el mismo jugador.
- **Vencimientos y renovaciones** de viáticos y contratos.
- **Cesiones** de pibes y suplentes a clubes de abajo, para que sumen minutos.

### 2.9 Entrenadores desde el exterior

Las ligas del exterior del catálogo de Carrera pasan a ser **jugables** como
división única (sin pirámide), con su economía según su estatus y su moneda.
Con reputación alta, sus vacantes llaman al entrenador.

---

## 3. Orden de construcción

1. **Base**: jugador nuevo, estatus por división, economía v2 con consecuencias de
   la deuda, objetivos v2. Migración a SCHEMA 6.
2. **Temporada en tramos**: entrenamiento, partido clave, estadísticas por jugador,
   fatiga, lesiones, moral.
3. **Mercado de jugadores** nacional e internacional, renovaciones, cesiones.
4. **Juveniles** y captación.
5. **Sponsors** y negociación.
6. **Eventos con contexto real** y nuevas familias (vestuario, prensa).
7. **Entrenador al exterior**.
8. **Balance**: harness de escenarios (club rico y pobre, déficit persistente,
   cantera, exterior, sponsors).
