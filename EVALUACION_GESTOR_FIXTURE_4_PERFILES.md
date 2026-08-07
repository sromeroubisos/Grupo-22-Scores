# Evaluación: gestor de fixture de torneos

**Fecha:** 2026-08-06
**Alcance:** subpestaña `?tab=operacion&subtab=fixture` de `/admin/entities/[id]/manage`. Torneo de referencia: `ed986d61…` — Torneo del Interior "A", 48 partidos.
**Método:** 4 perfiles independientes y aislados (subagentes en paralelo, sin contaminarse), más un banco de mediciones propio.

**Cómo se midió lo que se afirma:** Chrome headless + CDP (`Emulation.setDeviceMetricsOverride`) sobre el marcado real del componente, con las cuatro hojas reales (`basalt`, `tournament-mobile`, `fixture-management`, `operation-console`) y las fuentes reales (Space Grotesk resuelta por el navegador). Siete anchos — 320 / 360 / 390 / 720 / 1280 / 1440 / 1920 — en tema oscuro y claro. El contraste está **calculado sobre el color computado**, no estimado a ojo. Los clicks del hit-test son eventos despachados de verdad, no deducciones de `z-index`.

---

## Resumen ejecutivo

La pantalla tiene un diseño de fondo acertado —la fila de 52 px, el editor que se despliega en el lugar, los puntos calculados por el reglamento con la cuenta a la vista— y un problema estructural: **el camino feliz de su tarea principal no está terminado**. La fila que debía abrir el resultado estaba muerta en el 90 % de su superficie; abrir otra fila descarta sin aviso lo que se estaba escribiendo; y un resultado cargado con el flujo por defecto puede dejar la tabla de posiciones mal, por dos vías distintas y ninguna de ellas visible para el operador.

Lo bueno es que casi todo lo grave es barato de arreglar y ninguno de los problemas es de arquitectura. Lo que sí exige decisión de producto es el punto 3: hoy la pantalla deja que el operador guarde un resultado que resta un punto a un club, en silencio.

**Se arreglaron 3 hallazgos durante esta evaluación** (marcados ✅). El resto queda propuesto, sin tocar.

**Puntuación global: 6/10**

| Perfil | Nota | Titular |
|---|---|---|
| UX/UI | 6,5/10 | Buen sistema de fondo, roto por un apilado que desactiva el clic justo donde el usuario apunta |
| Funcionalidad | 6/10 · APTO CON RESERVAS | El merge en memoria y el gate por status están bien; el autofill de puntos no |
| Mobile | 5,5/10 | El pulgar la agradece, pero iOS hace zoom en cada campo y el "Guardar" queda bajo el teclado |
| Desktop | 6/10 | Se gana en scroll lo que se pierde en viajes de mano: sin foco, sin atajos, sin URL |

---

## Los 3 problemas que importan

### 1. La fila era clicable en una franja de 12 px ✅ ARREGLADO — era S1

Lo que pediste en este mismo hilo —"si aprieto en el partido, se abre el panel de resultado rápido"— **no funcionaba sobre el contenido de la fila**. La lámina `.op-match-link` es `position: absolute; inset: 0; z-index: 0` y sus hermanos llevan `z-index: 1`, así que quedaba *debajo* del nombre del club, el escudo, el marcador, la fecha y la sede. Y como es hermana y no ancestro, no hay burbujeo que la salve.

Medido con clicks despachados a 320 / 360 / 390 / 1440:

| Dónde hice click | Antes | Ahora |
|---|---|---|
| Nombre del club | `span.op-team-name` — **no abría** | abre (1 toggle) |
| Escudo | `span.crest` — **no abría** | abre |
| Fecha y hora | `span.op-match-when` — **no abría** | abre |
| Sede | `span.op-match-meta` — **no abría** | abre |
| Marcador (escritorio) | `span.op-match-score` — **no abría** | abre |
| Padding de 12 px | `button.op-match-link` — abría | abre |
| Botones de acción | no abrían (correcto) | no abren (correcto) |

Lo detectó el Perfil A leyendo el apilado; el Perfil C, en cambio, dio por hecho que "toco cualquier parte y se abre". Ganó la medición.

**Arreglo aplicado:** el `onClick` se mudó a `.op-match-line` (todo hijo burbujea hasta ahí), la lámina corta la propagación para no contar dos veces, y se agregó `cursor: pointer` a la línea — antes, sobre el nombre del club el cursor era la flecha y nada avisaba que ahí se podía hacer clic. Se ignora el clic que termina de arrastrar una selección de texto.
`TournamentOperationFixtureWorkspace.tsx` (`handleRowClick`), `operation-console.css` (`.op-match-line { cursor: pointer }`).

### 2. Abrir otra fila descarta lo escrito, sin preguntar — S1, NO arreglado

Convergen tres perfiles (C#3 S2, D#4 S2, B D14). `openQuickResultEditor` reconstruye el formulario desde el partido sin mirar si el anterior estaba sucio (`:1046-1056`). El disparador es barato: ahora que la fila entera es clicable —justamente por el arreglo #1— un scroll con el pulgar que no arranca limpio, o un clic mal apuntado en el renglón de al lado, borra el marcador ya tecleado. Tampoco hay `beforeunload`: el workspace nunca llama a `markSectionDirty`, así que el guardia del shell (`TournamentManageShell.tsx:347-360`) no cubre este formulario.

Sube a S1 por evidencia convergente y porque el criterio de S1 incluye "pierde datos".

**Salida propuesta:** guardar el borrador por `match.id` en un `Map` de estado (barato, no persiste nada) y registrar la sección como sucia mientras haya un formulario con cambios.

### 3. Cargar un resultado puede dejar la tabla mal, por dos vías, en silencio — S2

**Vía A — el autofill baja el bonus a 0.** Ejecutado contra la base: 40 de 48 partidos del torneo tienen `points_autocalculated=false` con `points_override_reason=null` (llegaron así de la importación). El editor lee ese flag tal cual, así que al abrir cualquiera aparece el bloque rojo "estos puntos no son los que da el reglamento" **sin que nadie haya tocado un punto**, y el motivo pasa a ser obligatorio. La única salida que ofrece la pantalla es "Volver al reglamento". Pero 46 de los 47 finales tienen bonus > 0 y sólo 3 tienen tries cargados en el `score`: con las reglas resueltas de este torneo, el autofill devuelve **bonus 0** y el término "0 tries · sin bonus". Guardar persiste 1 → 0 y el recálculo le saca un punto al club.

**Vía B — el partido se queda "Programado" y los puntos se guardan en 0.** El formulario nace con `status: match.status` (`:490`). Si el operador escribe el marcador y guarda sin tocar el select —que es el penúltimo tab stop del formulario—, `isFinal` es falso y base y bonus salen `0` (`:1236-1240`). El partido sigue leyéndose "Programado", sin marcador visible, y la tabla queda en cero. Silencioso, 48 veces.

Las dos piden decisión de producto, por eso no las toqué: escribir un marcador **¿debería implicar `final`?** y el flag `points_autocalculated=false` heredado de la importación **¿debería tratarse como "corregido a mano" o como "sin calcular todavía"?**

---

## Perfil A — Experto UX/UI · 6,5/10

13 hallazgos. Los que no están arriba:

| Sev | Hallazgo | Evidencia |
|---|---|---|
| S2 | El anillo de foco de la lámina se recorta contra el `overflow: hidden` de la lista. Peor: el `outline` inset escrito a propósito para ese control es **código muerto** — pierde por especificidad (0,2,0) contra el anillo global de `basalt.css:6137` (0,3,1) con `!important`. | `operation-console.css:1271-1274`, `:1175-1182` |
| S2 | En escritorio la fila en reposo no ofrece ninguna afordancia: las 5 acciones están en `opacity: 0`. Y `opacity: 0` no quita el hit-test — durante los 150 ms del fundido, Eliminar es un blanco invisible. | `:1356-1362`; medición `opacidadAcciones=0` a 1280/1440/1920 |
| S3 | El botón del control de partido no existía entre 320 y 360 px. ✅ **Arreglado** (`.op-match-act-open { display: inline-flex }` sumado al bloque ≤640). | `:1591-1593` vs `:3825-3827`; medición 320/360 `ocultos: open` |
| S3 | El salto 360→390 invierte la densidad: el teléfono **más ancho** recibe la ficha **más alta** (86 px → 173 px) y la tipografía **más chica** (13,5 → 12,5 px), y trunca igual. | `@media (min-width:361px) and (max-width:767px)`, `:3731` |
| S3 | Dos registros de escritura en el mismo archivo: el editor vosea con acentos ("podés corregirlos", `:2817`), el estado vacío y las validaciones tutean sin acentos ("Prueba con otra combinacion", `:2366`). `window.confirm` sin `¿` de apertura (`:1341`). |
| S3 | "Equipo" donde el vocabulario del proyecto pide "club" (`:775`, `:1782`, `:2084`). |
| S3 | Cinco definiciones de `--accent-primary` en `basalt.css` (`:11` `#38BDF8`, `:1413`/`:4266` `#3b82f6`, `:3253` `#00a365`, `:3279` `#047857`). Consecuencia concreta: el contorno del botón nuevo es **azul en oscuro y verde en claro**, y el anillo de foco usa un quinto color. El archivo lo documenta y no lo resuelve (`:4272-4275`). |
| S4 | Diez tamaños tipográficos en un componente de un renglón, seis fraccionarios. Espaciado fuera de la grilla 4/8 mezclado con valores que sí la respetan. |
| S4 | Eliminar está a 4 px de Duplicar, con el mismo gris, sin usar `basalt-btn-danger`, que ya existe. |

**Lo que está bien (no romper):** `Crest.tsx` es ejemplar (`alt=""` cuando el nombre está al lado, descriptivo cuando va solo, `loading="lazy"`, ancho al doble por retina, y la negativa explícita a caer en iniciales). El marcador duplicado se apaga con `display: none` y no con `visibility`, así que el lector de pantalla encuentra exactamente una versión. Ganador y perdedor no se comunican sólo por color. La píldora de estado desaparece cuando el partido está final. El empty state distingue dos causas y ofrece salida. **Los ocho valores de contraste medidos pasan AA**, mínimo 4,9:1, en oscuro y claro. Cero desbordamiento horizontal en los siete anchos.

## Perfil B — Analista de Funcionalidad · APTO CON RESERVAS

14 defectos. Además de los del top 3:

| # | Sev | Defecto | Evidencia |
|---|---|---|---|
| D1 | S2 | **Carrera entre el merge y el refetch.** Si guardás un horario (dispara `refreshFixture()` sin `await`) y antes de que vuelva guardás un marcador (sólo merge), el GET tardío hace `setFixture(payload)` y **pisa el marcador con un snapshot viejo**. El guard `isActiveRequest` protege contra refrescos superpuestos, no contra un merge aplicado mientras el GET viaja. En playoff pasa casi siempre, porque el avance del ganador prende el header y recarga en cada resultado. | `FixtureContext.tsx:571`, `:587-589`, `:290` |
| D3 | S2 | El recálculo de standings es fire-and-forget y persiste con **DELETE + INSERT no atómico**: si la promesa muere en el medio, la fase queda con la tabla **vacía**, no desactualizada. | `recalculateStandings.ts:264-285`, `:320-325` |
| D4 | **S2** | **`GET /api/tournaments/[id]/fixture` responde 200 sin autenticación** y lee con **service-role**, o sea que RLS no protege nada. Verificado: devuelve un torneo `status=draft`, `is_visible=false`, con 182 partidos, árbitros, notas y el `settings` completo de la fase. `/fixture/validate` idem. | `fixture/route.ts` (ni una llamada de auth); `src/lib/supabase/read.ts:5-7`; **ejecutado por curl** |
| D5 | S3 | Si el refetch de fondo falla, `setFixtureError` se escribe pero el bloque que lo pinta está dentro de `if (!fixture)`: con fixture en memoria **no se renderiza nunca**. | Workspace `:1450-1462` |
| D6 | S3 | Vaciar el campo Hora y guardar descarta el cambio de fecha en silencio: `newDateTime` exige fecha **y** hora, y la validación no mira ninguna de las dos. | `:1219-1221`, `:1121-1160` |
| D7 | S3 | `matchesTruncated` se calcula, se tipa y se devuelve, y **ningún componente lo lee**. Con >1000 partidos se recortan en silencio, y como el orden es por fecha ascendente, los que se caen son los últimos — los que hay que cargar. | `fixtureService.ts:563,684-687`; grep sin consumidores |
| D8 | S3 | Último en escribir gana, sin comparar `updated_at`. Y el refetch completo era el **único** mecanismo que traía cambios ajenos: al sacarlo no queda ninguno (sin polling, sin realtime, sin refresco al volver el foco). | `FixtureContext.tsx:570-591` |
| D9 | S3 | Si el avance de playoff falla, `derivedChanged` no se prende: respuesta 200 sin header, sin recarga, y el cruce siguiente sigue mostrando el equipo viejo bajo el cartel "Resultado y puntos guardados". | `fixtureService.ts:1425-1440` |
| D11 | S4 | `saveMatch` no tiene timeout (a diferencia de `refreshFixture`, que sí tiene 20 s): un PATCH colgado deja el botón girando para siempre. Y hace `response.json()` sobre el error sin mirar `content-type` — con un 504 en HTML el operador lee "Unexpected token <". | `FixtureContext.tsx:553-561` vs `:242-283` |
| D12 | S4 | El bloque se llama "Horario y sede" y no tiene campo de sede. | `:2946` vs `:1223-1244` |

**Lo que verificó y salió bien:** el gate por status de `recalcAffectedPhases` es correcto — usa el mismo `FINAL_STANDINGS_STATUSES` con el que el motor filtra los partidos que cuentan, sólo saltea si **todos** los scopes son no-finales conocidos, y como se le pasa el status de los dos extremos, `final→live`, `live→final` y las correcciones sobre finales quedan cubiertas. Las fases dependientes por carry-over también se propagan. El PATCH sin sesión devuelve 401.

**Cobertura de tests: cero.** Ni un test sobre este flujo — grep sin coincidencias de `applySavedMatchToFixture`, `savedMatchNeedsFullReload`, `recalcAffectedPhases` ni `derived-changed` en ningún `*.test.ts(x)`.

## Perfil C — Mobile User · 5,5/10

> "La fila es un botón gigante y eso lo agradezco con el pulgar, pero después de tocarla el celu me hace zoom solo en el campo de tries, el Guardar se me esconde abajo del teclado, y en el iPhone dos clubes distintos me quedan escritos igual."

| # | Sev | Hallazgo | Evidencia |
|---|---|---|---|
| 1 | **S2** | **Todos los campos del editor salvo el marcador están por debajo de 16 px → iOS hace zoom al enfocarlos y no vuelve.** Tries 12,5 px, Base/Bonus 13 px, Estado 13 px, Motivo 13 px, Hora 13 px. Multiplicado por 48 partidos. El proyecto **ya conoce la regla** y la aplica a mano en el buscador de esta misma pantalla. | `operation-console.css:788-791`, `:941-945`; contraste con `fixture-management.css:2882` (`font-size:16px !important`) |
| 2 | S2 | El nombre del club se trunca en 320, 360 y 390, sin `title` de respaldo. En el TDI "A" conviven "Jockey Club de Córdoba" y "Jockey Club de Rosario": se leen igual. Cargar el resultado en el partido equivocado es un llamado del club el lunes. | medición `truncado=True` en los tres anchos; `.tsx:2558`, `:2570` |
| 4 | S3 | "Guardar resultado" vive al final de un editor de ~600 px sin pie fijo: con el teclado abierto queda fuera de pantalla. *(Altura sumada del CSS, no observada con teclado real.)* | `.tsx:2975-3014` |
| 5 | S3 | Al abrir el editor el foco no cae en el marcador, y no hay Enter que guarde: el editor es un `<div>`, no un `<form>`. | `.tsx:2664`, sin `autoFocus` ni `onKeyDown` |
| 6 | S3 | La confirmación —y peor, el error— aterrizan en un cartel arriba de la página, que nunca está en pantalla cuando estás en el partido 37. Sin `role="status"`. | `.tsx:1660-1665`; `operation-console.css:1084-1088` |
| 7 | S3 | En dos columnas, abrir el editor manda la tarjeta a ancho completo: se corre de lugar y nada la lleva a la vista (no hay `scrollIntoView` en todo el archivo). | `:3758-3762` |
| 8 | S3 | No hay "guardar y siguiente". El formulario de alta manual sí tiene el patrón; el que se usa 48 veces por fecha, no. | `.tsx:1249-1253` vs `:1292-1294` |
| 10 | S4 | Blancos táctiles de 36×36 a 320/360 y 48×**38** a 390: cumplen WCAG 2.2 AA (24×24) con la separación medida, no llegan al piso de 44 de Apple. |
| 11 | S4 | Las dos columnas de 390 px **no dan más partidos por pantalla**: 86 px por partido a 360 (una columna) contra 86,5 a 390 (173 ÷ 2). Se paga la mitad del ancho del nombre por cero densidad. |

**Lo que le gustó:** el marcador es lo único grande del formulario (92×64, número a 32 px) y no hace zoom. Los puntos vienen con la cuenta escrita. Los escudos no comen 4G (`loading="lazy"`, `decoding="async"`, pedidos a `w=44` en vez del original de 500 px). Guardar no recarga la pantalla y el guardado lento no le apaga el spinner al siguiente.

## Perfil D — Desktop User · 6/10

> "La fila de 52 px es lo mejor que le pasó a esta pantalla, pero cargar 48 resultados sigue siendo un trabajo de mouse."

**Coste de la tarea frecuente:** cargar un resultado cuesta **2 clicks + 15 pulsaciones**; la fecha entera, **~817 interacciones**. El óptimo alcanzable es ~480 pulsaciones y cero clicks.

| # | Sev | Hallazgo | Evidencia |
|---|---|---|---|
| 2 | S2 | **Después de cada guardado se pierde el foco:** el editor se desmonta con el botón enfocado adentro y nada lo restaura. 48 vueltas obligadas al mouse por fecha. | `:1249-1253`, `disabled={quickBusy}` `:3008`; único `.focus()` del archivo en `:286` |
| 3 | S2 | El editor abre sin foco en el marcador: desde la fila hasta `homeScore` hay **6 Tabs**. | orden del DOM en `MatchCard` |
| 5 | S3 | Cero atajos. El único global es el Ctrl+S del shell, que contesta *"No hay cambios persistibles en el torneo"* justo cuando acabás de tipear un resultado. | `TournamentManageShell.tsx:336-345` |
| 6 | S3 | **Se perdió el click derecho, el ctrl+click y la URL en la barra de estado sobre la fila.** El `title` viejo lo publicitaba. El único `<a>` que queda es un ícono de 33×28 px a opacidad 0 hasta el hover, con tres grises casi iguales al lado. | `git diff`; `.op-match-actions { opacity: 0 }` |
| 7 | S3 | La selección múltiple y la carga de resultados **no conviven**: la barra de selección sólo existe en vista Lista, el editor sólo en vista Cards. | `:2160` vs `:2262-2280` |
| 9 | S3 | Nada del estado vive en la URL: fase, filtros, agrupación, vista, jornadas plegadas. No hay enlace profundo que compartir. Sólo persiste el subtab, en `localStorage`. | `:592-601`, `:625-634` |
| 11 | S3 | 3 de las 5 acciones de la fila expulsan de la lista (`setActiveSubtab('add_matches')`): se pierden scroll, jornadas plegadas y el editor abierto. | `:995-996`, `:936-942` |
| 12 | S3 | **Dos `GET /fixture/validate` por resultado guardado** (96 por fecha): uno explícito y otro del efecto que depende de `fixture`, que cambia de identidad en cada merge. Y `MatchCard` no está memoizado: cada guardado re-renderiza las 48 filas. | efecto `:787-797` + llamada `:1255` |
| 14 | S3 | 288 paradas de tabulación por jornada, **96 duplicadas**: la lámina y el botón ⚡ hacen lo mismo. Para llegar por teclado al partido 40 son 240 Tabs. |
| 15 | S3 | La vía masiva no sirve para resultados: el importador entiende `score_home/away` pero los duplicados nacen en `skip_row` sin control masivo, y la rama de actualización escribe sólo `score.home/away` — ni tries, ni base, ni bonus. | `fixtureImportService.ts:1029`, `:260-281` |

**Espacio:** desde ~1480 px de viewport, cada píxel extra de monitor es aire — `.op-match-pair { max-width: 780px }`. A 1920 sobran **437,7 px, el 23,6 % del renglón**, sin un dato. A 720 px (ventana a media pantalla) cae la maqueta de teléfono: la fila salta de 53 a **217 px, 4,1×**, porque el corte es un breakpoint de celular aplicado a una ventana de escritorio.

---

## Tabla cruzada y conflictos

| # | Hallazgo | UX/UI | Func. | Mobile | Desktop | Severidad final |
|---|---|:--:|:--:|:--:|:--:|---|
| 1 | La fila no era clicable sobre su contenido | S2 | — | (lo dio por bueno) | — | **S1** ✅ arreglado |
| 2 | Abrir otra fila descarta lo escrito | — | S5 | S2 | S2 | **S1** — 3 perfiles |
| 3 | El resultado guardado puede dejar la tabla mal | — | S2 | — | S2 | **S2** — 2 vías distintas |
| 4 | Breakpoint de 2 columnas en 361 px | S3 | — | S4 | S3 (720) | **S2** — 3 perfiles |
| 5 | Sin foco ni flujo de teclado en el editor | — | — | S3 | S2 | **S2** |
| 6 | Acciones invisibles en reposo (escritorio) | S2 | — | — | S3 | **S2** |
| 7 | Orden de tabulación duplicado (lámina + ⚡) | S3 | — | — | S3 | **S2** |
| 8 | Endpoint de fixture sin auth, con service-role | — | S2 | — | — | **S2** |
| 9 | Feedback fuera de pantalla / sin `role="status"` | — | S5 | S3 | — | **S3** |
| 10 | El control de partido no existía a ≤360 px | S3 | — | S4 | — | **S3** ✅ arreglado |

### Conflictos entre perfiles

**1. ¿La fila era clicable? (C dijo que sí, A dijo que no).** El Perfil C abrió su diario con "toco cualquier parte de la fila y se abre, 334×85 px de blanco" y lo puso como lo mejor de la pantalla; el Perfil A demostró por apilado que estaba muerta sobre el contenido. **Resolución: midiendo.** Clicks despachados de verdad le dieron la razón a A. Vale registrarlo porque los dos citaron el mismo CSS y llegaron a conclusiones opuestas: uno leyó `inset: 0` y supuso cobertura, el otro leyó el `z-index` de los hermanos. Ninguna cantidad de lectura resuelve eso; un `elementFromPoint` sí.

**2. Densidad: Desktop pide más, Mobile pide menos.** D quiere aprovechar los 437 px que sobran a 1920 con columnas configurables; C quiere que el nombre del club entre entero y que el teléfono vuelva a una columna. **No es contradicción real:** los dos apuntan al mismo culpable, `.op-match-pair { max-width: 780px }` combinado con un corte de dos columnas en 361 px. La salida es mover el corte a ~600 px (tablet) y soltar el tope de ancho arriba de 1600.

**3. Escritorio perdió el enlace; el pedido original era que la fila abriera el resultado.** D reclama con razón el ctrl+click, el click derecho y la URL en la barra de estado, que la fila tenía cuando era `<a>`. Pero eso es exactamente lo que se pidió cambiar. **Tensión real, salida propuesta:** que el `<a>` al control de partido sea visible siempre (no revelado por hover) o que los nombres de los clubes sean el enlace. Así vuelve el ctrl+click sin devolverle la fila al control.

**4. El botón ⚡ ¿sobra o es la puerta del teléfono?** A y D lo quieren fuera del orden de tabulación por redundante; C lo usa como afordancia principal en el teléfono. **Salida:** que siga visible en mobile pero con `tabIndex={-1}`, ya que la lámina cubre el camino de teclado.

---

## Plan de acción

### Ahora (bloquea)
1. ~~[S1] La fila clicable sobre todo su contenido~~ — ✅ hecho, esfuerzo S, verificado con clicks despachados.
2. **[S1] No descartar el borrador al abrir otra fila** — esfuerzo S. `Map` de borradores por `match.id` + `markSectionDirty` mientras haya cambios. Es el que pierde trabajo del usuario.
3. **[S2] Decidir las dos vías del punto 3** (¿marcador implica `final`? ¿`points_autocalculated=false` importado es "corregido" o "sin calcular"?) — esfuerzo S una vez decidido, pero **es decisión de producto, no de código**.
4. **[S2] Cerrar el endpoint de fixture** o confirmar explícitamente que el fixture es público — hoy expone torneos en borrador con service-role. Esfuerzo S.

### Después (este ciclo)
5. [S2] `font-size: 16px` en los campos del editor bajo 767 px — mata el zoom de iOS. Esfuerzo S.
6. [S2] `autoFocus` + `select()` en el marcador, `<form>` para que Enter guarde, y devolver el foco tras guardar. Esfuerzo S, se lleva puestas tres fricciones de dos perfiles.
7. [S2] Mover el corte de dos columnas de 361 a ~600 px. Esfuerzo S.
8. [S2] La carrera merge/refetch (D1): descartar el `setFixture` de un GET que salió antes del último merge. Esfuerzo M.
9. [S2] Dejar visible en reposo el enlace al control de partido; `visibility: hidden` junto al `opacity: 0` para que el fundido no sea clicable. Esfuerzo S.
10. [S2] `tabIndex={-1}` en el ⚡ — 96 paradas de tabulación menos por jornada. Esfuerzo S.
11. [S3] Tests del flujo: `applySavedMatchToFixture` (identidad preservada), `savedMatchNeedsFullReload` (los 7 campos), la matriz del gate por status, y el caso del autofill sobre un partido importado. Hoy son cero. Esfuerzo M.

### Luego (backlog)
12. [S3] Feedback local en la fila + `role="status"`; "guardar y siguiente"; `scrollIntoView` al abrir.
13. [S3] Estado en la URL (fase, filtros, vista) y `pushState` en vez de `replaceState`.
14. [S3] Consumir `matchesTruncated`; timeout en `saveMatch`; error de red legible.
15. [S3] Unificar selección múltiple y carga de resultados en una sola vista.
16. [S4] Pasada de copy (voseo y acentos), "club" en vez de "equipo", `basalt-btn-danger` en Eliminar.
17. [S4] Colapsar las cinco definiciones de `--accent-primary`.

---

## No verificado

- **Nada se recorrió con sesión iniciada.** `/admin/entities/[id]/manage` responde 307 → `/login` y no hay credenciales. Todo sale del código, del CSS y del banco de mediciones. No hay observación de hover real, `:active`, transiciones, teclado virtual, gestos, ni red 3G.
- **El zoom de iOS** está deducido de la regla del navegador (`font-size < 16px` + `maximumScale: 5` en `layout.tsx`), no visto en un iPhone. Confianza alta porque el propio repo la aplica a mano en el buscador de esta pantalla.
- **El teclado tapando "Guardar"** es aritmética de alturas declaradas en CSS (~600 px de editor), no una captura.
- **Tiempos.** La máquina estaba en 1,7 GB libres de 16 con 40 procesos `node`. **Ninguna cifra de performance de este informe viene de un cronómetro**: donde se habla de costo, se habla de bytes, de cantidad de round-trips o de tamaño de respuesta.
- **Tema claro.** El banco reportó los ocho valores de contraste **idénticos** en oscuro y claro, y eso no es plausible: `basalt.css:3272-3300` cambia los tokens bajo `:root[data-theme="light"]`. Lo más probable es que el atributo se haya aplicado después de la medición y se haya medido el oscuro dos veces. **El tema claro queda sin verificar** — lo levantó el Perfil A y tiene razón.
- **Contraste no textual.** Se midió el color de *texto* del botón nuevo (4,9:1). Su borde es `color-mix(accent 55%, transparent)` y como límite de componente necesita 3:1: no se midió.
- **Landscape, lector de pantalla, y el comportamiento en Vercel** (el congelamiento post-respuesta de D3) no se reprodujeron.
- **Ninguna escritura contra la base.** Es producción: todas las consultas fueron de lectura. El único PATCH enviado fue sin sesión contra un UUID inexistente (401).

## Auto-crítica

- **¿Cada hallazgo tiene evidencia?** Sí, con una excepción que corregí en el camino: la primera versión del hallazgo del breakpoint de `.fixture-round-details` era mía y era falsa — el componente sí pone `is-expanded` en la sección (`:2199`), lo que faltaba era el envoltorio en mi banco. No llegó al informe.
- **¿Medí el contraste o lo estimé?** Medido sobre color computado. Pero ver arriba: el tema claro probablemente se midió dos veces en oscuro, así que el número vale para oscuro y **no** para claro.
- **¿Probé en cada viewport o lo deduje del CSS?** Los siete anchos se renderizaron de verdad. Lo que **no** se probó es la página real: el banco replica la fila, no la pantalla completa con sus 48 filas, su barra y su panel lateral.
- **¿Hay preferencia personal disfrazada de principio?** Los hallazgos de escala tipográfica y grilla de espaciado (A#11, A#12) son los más discutibles: describen inconsistencia real pero ninguno rompe nada, y por eso están en S4 y en "deuda", no en el plan de Ahora.
- **¿El plan es ejecutable?** Los puntos 1, 2, 4, 5, 6, 7, 9 y 10 son cambios de menos de 20 líneas cada uno. El 3 no es ejecutable por nadie más que vos: es una decisión sobre qué significa un resultado a medio cargar.
- **Sesgo de autor.** Tres de los hallazgos evaluados son cambios que hice yo hoy, y el más grave del informe (#1) es un defecto que mi propio cambio dejó pasar y que un perfil independiente encontró. Lo dejo anotado porque es el argumento más fuerte a favor de correr los perfiles aislados en vez de auditarme solo.
