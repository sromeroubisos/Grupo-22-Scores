# Gestor de torneos — Fases y reglas: diagnóstico y propuesta

**Fecha:** 12 oct 2026 · **Referencia de UX:** Challenge Place (pestaña Fases, alta de fase, configuración de fase), relevado en su demo pública.
**Maqueta navegable:** `gestor-g22-maqueta.html` (se entrega aparte). Reemplaza a `fases-y-reglas-maqueta.html`: vuelve a la lista de filas de Challenge Place, suma la página de cada fase (zonas con ⋮, calendario, cuadro de llaves con series) y el creador de torneo en tres pasos.

Objetivo: que crear un torneo básico lleve pocos pasos y que una competencia compleja (zonas, cruces, repechajes, arrastre) siga siendo posible, sin pasar por un formulario de seis pasos.

---

## 1. Cómo funciona hoy (resumen del relevamiento)

| Tema | Estado actual | Dónde |
|---|---|---|
| Alta y edición de fase | Asistente de 6 pasos: Básico, Puntos, Desempate, Etiquetas, Estadísticas (arrastre), Circuito | `TournamentStructureTab.tsx:1134-1146` |
| Tipos | `league`, `group_stage`, `playoff` (el `knockout` viejo se carga como playoff) | TST:824, 2003 |
| Duplicar fase | **No existe** | menú de fase: TST:1499-1531 |
| Reordenar fases | **No hay UI.** La columna `order_index` existe con UNIQUE (tournament_id, order_index); un swap choca con la restricción | migración `20260224100000`:19 |
| Pasaje entre fases | `advanceCount` es **solo informativo** (nadie lo consume). El arrastre de puntos toma la fase anterior. La siembra de playoff se arma después, en el panel de llaves, no en el asistente | `standingsCarryOver.ts`, `PlayoffBuilderPanel.tsx` |
| Grupos | Se crean al guardar la fase (por nombre). Los equipos se asignan en Equipos | `phases/route.ts:305-327` |
| Fixture | Separado del asistente. La liga genera Berger sobre **todos** los equipos del torneo, no los de la fase | `generate-rounds/route.ts:63-188` |
| Reglas | Por fase en `settings` (`pointsSystem`, `bonus`, `tiebreakers`) con fallback a `tournaments.ruleset`. **Tres formas distintas de guardar el bonus** y **dos tablas de valores por deporte** | `standingsEngine.ts:191-265`, `phaseDefaults.ts`, `crear/page.tsx:75` |
| Validación | Se valida el nombre (y el error aparece antes de escribir). No se valida reparto de equipos en grupos, clasificados vs. fase siguiente, ni equipos inscriptos vs. configurados | TST:629-658 |

### Fallas que hay que corregir antes del rediseño (P0)

1. **Editar una fase borra configuración de otros módulos.** El PATCH reemplaza `settings` entero y el asistente no manda `bonus`, `standings`, `qualification`, `bracketBuilder`, `bracketSchedule` ni `playoffSeeding` (`[phaseId]/route.ts:73-81` vs `phasePayload.ts:121-224`). Resultado: tocar el nombre de una fase puede perder el cuadro automático, la siembra por zonas y el bonus cargado desde Posiciones. **Arreglo:** el PATCH hace merge profundo de `settings` (solo pisa las claves que llegan).
2. **El primer desempate desaparece al reabrir la fase.** Posiciones guarda `priority` desde 0 y el asistente descarta `priority <= 0` al cargar (TST:862-863, `StandingsSidebar.tsx:263`).
3. **La edición mobile rompe llaves automáticas y circuitos:** manda siempre `bracketMode:'manual'` e `isCircuit:false` (`NewPhaseView.tsx:222,235`).

---

## 2. La propuesta en una frase

**La pestaña Fases se vuelve un constructor visual:** las fases se ven como un recorrido conectado ("16 equipos → 4 zonas → clasifican 8 → cuartos → semis → final"). Cada fase se edita en una sola pantalla con vista previa en vivo, y las reglas salen de una plantilla del deporte que se hereda y se personaliza solo si hace falta.

---

## 3. Flujo de trabajo

### 3.1 Crear un torneo básico (3 pasos, menos de un minuto)
1. **Datos:** nombre, deporte, temporada (los únicos obligatorios).
2. **Formato:** se elige una plantilla con tarjetas visuales:
   - *Todos contra todos* — una tabla, ida o ida y vuelta.
   - *Zonas + playoff* — grupos y cruces.
   - *Liga + playoff* — tabla general y los primeros a semis/final (el Top 10, el Pampeano).
   - *Eliminación directa* — llaves.
   - *Personalizado* — arranca vacío.
   La plantilla genera las fases **ya conectadas**, con las reglas del deporte (rugby: reglamento UAR).
3. **Equipos:** buscar y sumar clubes ("Seguir agregando"). Se puede saltear.

El torneo queda creado y el usuario aterriza en Fases, donde puede ajustar todo. El asistente de creación actual (`crear/page.tsx`) deja de tener su propio constructor de fases y su propia tabla de valores por deporte: usa las mismas plantillas que el gestor.

### 3.2 Pestaña Fases: el recorrido
- Cada fase es una **tarjeta** con: tipo (ícono), nombre, la figura (por ejemplo "4 zonas de 4 · ida", "Cuartos, semis y final"), la cuenta (equipos, fechas, partidos) y el estado (sin empezar, en juego, terminada).
- Entre tarjetas, un **conector** que dice qué pasa: "Clasifican 2 por zona (8) →", "Arrastra los puntos →". Si no cierra, se pinta en ámbar ("Clasifican 8 pero la fase siguiente espera 4").
- Menú ⋮ por fase: **Editar · Duplicar · Subir · Bajar · Activar · Eliminar**. En escritorio también se reordena arrastrando la tarjeta.
- "+ Agregar fase" al final del recorrido abre el editor con la fase anterior ya conectada.

### 3.3 Editor de fase (una pantalla, no un asistente)
Dos columnas: **configuración a la izquierda, vista previa a la derecha** (en celular, la vista previa es una tarjeta plegable arriba).

Bloques, en orden, y solo los que aplican al formato:

| Bloque | Todos contra todos | Zonas | Eliminación directa |
|---|---|---|---|
| Nombre | ✓ | ✓ | ✓ |
| Formato (tarjetas) | ✓ | ✓ | ✓ |
| Equipos | cantidad (o "todos los inscriptos") | cantidad de zonas (− / +) y equipos por zona | cantidad → define la ronda inicial |
| Vueltas | ida / ida y vuelta | ida / ida y vuelta | por ronda (ej.: final a partido único) + 3.er puesto sí/no |
| Quién juega | todos / clasificados de la fase X | todos / clasificados de X; reparto: por sorteo, por ranking, a mano | siembra: desde fase X (1.º A vs 2.º B cruzado, por tabla general) / por sorteo / a mano |
| Clasificación | zonas de la tabla con rangos (1–4 clasifica, 9–10 desciende) | igual, por zona + "mejores terceros" | — (avanza el ganador) |
| Reglas | hereda del torneo · "Personalizar" | igual | desempate de llave (puntos, tries, penales…) |
| Arrastre | — | arrastra puntos de la fase X sí/no | — |

**La vista previa en vivo** dibuja lo que va a pasar mientras se configura:
- Zonas: las cajas de cada zona con sus lugares ("A1…A4"), y las filas que clasifican pintadas.
- Liga: la tabla vacía con las zonas de color.
- Llaves: el cuadro (cuartos → semis → final) con los cruces de siembra ("1.º A vs 2.º B").
- Al pie, la cuenta: "6 fechas · 24 partidos · clasifican 8".

**Validación mientras se trabaja** (no al guardar, y nunca antes de que el usuario toque el campo):
- "16 equipos en 3 zonas: quedan zonas de 5, 5 y 6." (aviso, no error)
- "Clasifican 8 y la fase siguiente es de 4 equipos." (error con botón "Ajustar a 4")
- "Hay 14 equipos inscriptos y la fase dice 16." (aviso con enlace a Equipos)
- "Dos zonas se llaman igual." (error)

**Nada se pierde al volver atrás:** el editor es una sola pantalla con borrador local; cambiar el formato conserva lo que aplica (nombre, equipos, reglas) y guarda lo otro por si se vuelve.

### 3.4 Módulo de reglas
Vive en **Configuración → Reglas** a nivel torneo y cada fase de tabla lo hereda; la fase muestra "Usa las reglas del torneo (Reglamento UAR)" con un botón **Personalizar para esta fase**.

- **Plantilla del deporte** (selector con tarjetas): Rugby · Reglamento UAR (4/2/0, bonus ofensivo por 4 tries, defensivo por perder por 7 o menos) · Rugby · Diferencia de 3 tries (URBA) · Fútbol (3/1/0) · Hockey (3/1/0, shoot-out) · Personalizado.
- **Puntos por partido:** ganado / empatado / perdido con − / + (empatado se oculta si el deporte no empata).
- **Bonus:** tarjetas con interruptor y la **condición editable** (hoy no se puede editar el umbral): "1 punto por 4 tries o más" / "por 3 tries más que el rival" · "1 punto por perder por 7 o menos".
- **Desempate:** lista ordenable con plantillas por deporte; cada criterio con explicación breve al pasar el mouse. Aviso si se elige "resultado entre ellos" en un formato que no lo garantiza.
- **Clasificación:** zonas de la tabla con rango de posiciones y color (reemplaza al paso "Etiquetas", que hoy no tiene rangos).
- **Resumen en lenguaje natural** al pie: "Ganar suma 4, empatar 2. Bonus por 4 tries y por perder por 7. Desempata: puntos, resultado entre ellos, diferencia."

---

## 4. Cambios de lógica (backend y modelo)

1. **PATCH de fase con merge** de `settings` (P0, arriba).
2. **Forma canónica única** de reglas en la fase: `settings.rules = { inherit, points{win,draw,loss}, bonus{offensive{enabled,mode,threshold,points}, defensive{enabled,margin,points}}, tiebreakers[], zones[{from,to,label,color}] }`. Un normalizador de lectura traduce las formas viejas (`pointsSystem`, `bonus`, `ruleset.pointsWin`…) sin migración de datos; se escribe solo la nueva.
3. **Una sola tabla de plantillas por deporte** (`phaseDefaults.ts` pasa a `rulesTemplates.ts`); se borra `sportDefaults` de `crear/page.tsx:75`.
4. **Conexión real entre fases:** `settings.entry = { source: 'all' | 'phase', phaseId, rule: 'top_per_group' | 'top_overall' | 'best_of_position', count, extra? }`. Reemplaza al `advanceCount` informativo, alimenta la siembra del playoff (unifica con `playoffSeeding`) y fija el `carryOver.sourcePhaseId` (hoy siempre null).
5. **Reordenar:** endpoint `POST /phases/reorder` con la lista de ids, que reasigna `order_index` en una transacción (restricción DEFERRABLE o paso intermedio con offset). Se unifica el `order_index` en base 0.
6. **Duplicar:** `POST /phases/:id/duplicate` copia nombre ("… (copia)"), tipo, settings y grupos; no copia partidos ni equipos asignados.
7. **Fixture de liga sobre los equipos de la fase**, no de todo el torneo; y "generar" pregunta si reemplazar o agregar (hoy siempre agrega).
8. **Validación compartida:** `lib/phases/validatePhaseConfig.ts`, la misma función en el editor (avisos en vivo) y en las rutas (rechazo con mensaje).
9. **Limpieza:** se borran `app/api/admin/tournaments/[id]/phases/route.ts` (mock, sin llamadores), `PhaseCreator.tsx`, las claves duplicadas de etapas de playoff (3 formas) y de arrastre (2 formas), y los campos guardados que ningún motor lee (`extraTimeLogic`, `tiebreakerBehavior`, `playerStats`, `matchFormat`).

---

## 5. Plan por etapas

| Etapa | Qué | Riesgo | Resultado visible |
|---|---|---|---|
| **0 · Fallas** | Merge en PATCH, desempate con prioridad 0, edición mobile | Bajo, aislado | Editar una fase deja de borrar cosas |
| **1 · Recorrido** | Tarjetas conectadas, Duplicar, Subir/Bajar (endpoint reorder), conectores con cuenta | Medio (reorder toca la restricción) | La pestaña Fases de la maqueta |
| **2 · Editor de fase** | Una pantalla con bloques por formato, vista previa en vivo, validación compartida, borrador | Alto (reemplaza el asistente de 6 pasos) | Alta y edición de fases nuevas |
| **3 · Reglas** | Plantillas por deporte, forma canónica + normalizador, herencia torneo → fase, zonas con rango | Medio (lo lee el motor de posiciones) | Configuración → Reglas |
| **4 · Conexión** | `settings.entry`, siembra desde la fase anterior, fixture por fase | Alto (toca playoff y posiciones) | Los clasificados pasan solos |
| **5 · Crear torneo** | El alta usa plantillas y aterriza en el gestor | Medio | Torneo básico en 3 pasos |

Cada etapa se cierra con `tsc`, build, prueba en el navegador sobre un torneo real (Pampeano B, Top 10 de ARUSA) y, en las que tocan el motor, comparación de tablas antes/después.

---

## 6. Qué tomamos de Challenge Place y qué no

**Tomamos:** la lista de fases como columna vertebral, el alta corta (nombre ya cargado + tipo + cantidad + "opciones avanzadas" plegado), la configuración de fase como una sola página por bloques, el modal mínimo con "Seguir agregando", y la acción principal única por pantalla.

**Mejoramos:** ellos no muestran cómo se conectan las fases, no tienen vista previa, no tienen temporadas ni plantillas por deporte, y la configuración de fase es una lista larguísima de casillas (columnas y desempates con 30 opciones). Nosotros mostramos solo lo que aplica al formato y al deporte.
