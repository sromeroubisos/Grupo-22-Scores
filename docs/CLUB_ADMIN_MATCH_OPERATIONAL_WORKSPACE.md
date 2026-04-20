# Ficha Operativa de Partido

## Objetivo

Convertir la arquitectura de `matches + club_match_workspaces` en un producto usable dentro de Club Admin.

Esta ficha es el punto donde convergen:

- G22 como partido canonico
- Club Admin como capa operativa privada
- planteles y staff
- analitica y tactica
- contenido y sponsors

En producto, esto no es una simple pantalla de partido.

Es el centro operativo del club para ese evento.

---

## Principio de producto

La ficha debe servir para tres momentos distintos del trabajo real:

1. antes del partido
2. durante el partido
3. despues del partido

Por eso no conviene diseñarla como una pantalla lineal. Conviene diseñarla como workspace modular con estado.

---

## Ubicacion dentro del Club Admin

### Navegacion principal

Ruta sugerida:

```txt
/club-admin/matches/[matchId]?club=<clubId>&workspace=<workspaceId>
```

### Entrada desde la tab `Partidos`

La tab `Partidos` del Club Admin deberia pasar de ser solo fixture/resultados a una vista operativa con dos niveles:

1. lista de partidos
2. acceso a ficha operativa

Ejemplo:

- Partidos oficiales
- Partidos internos
- Pendientes de vinculacion

Cada row deberia ofrecer:

- badge de origen
- badge de estado
- badge de operacion
- CTA `Abrir ficha`

---

## Tipos de partido en la UI

La lista y la ficha deben mostrar claramente que tipo de partido es.

### Badges de origen

- `Oficial G22`
- `Interno del club`
- `Pendiente de sync`
- `Fusionado`

### Badges de operacion

- `Sin ficha`
- `Convocatoria lista`
- `Formacion confirmada`
- `Stats cargadas`
- `Reporte final`
- `Export listo`

Esto vuelve visible el valor del workspace, no solo del match.

---

## Arquitectura UX

## Layout general

La ficha deberia tener esta estructura:

### 1. Header persistente

Siempre visible arriba.

Contenido:

- rival
- fecha y hora
- torneo o tipo de partido
- condicion local/visitante
- estado del partido
- origen
- estado de sincronizacion
- acciones rapidas

Acciones:

- guardar
- marcar convocatoria lista
- confirmar formacion
- abrir export social
- vincular/publicar

### 2. Columna central de trabajo

Contiene modulos editables por etapa.

### 3. Sidebar derecha

Resumen operacional:

- estado del workspace
- checklist
- ultima actividad
- responsables
- contenido listo para exportar

---

## Modulos de la ficha

Orden recomendado de arriba hacia abajo:

## 1. Informacion base

Funcion:

- mostrar el partido canonico y el contexto del club

Campos:

- rival
- fecha
- hora
- sede
- cancha
- torneo
- division
- equipo
- origen
- publication_status
- source_type

Acciones:

- editar datos internos si el match es privado
- solicitar vinculacion si es `pending_sync`
- abrir partido publico en G22 si ya es oficial

## 2. Convocatoria

Funcion:

- armar la lista operativa previa al partido

Contenido:

- jugadores disponibles
- convocados
- reservas
- ausentes

Acciones:

- convocar desde roster activo
- mover entre estados
- agregar notas por jugador
- exportar convocatoria grafica

Salida clave:

- `club_match_callups`

## 3. Disponibilidad

Funcion:

- registrar el estado previo del jugador

Contenido:

- disponible
- en duda
- lesionado
- no disponible
- pendiente

Acciones:

- filtrar por posicion
- ver motivo
- detectar faltantes antes del cierre de convocatoria

Salida clave:

- `club_match_availability`

## 4. Formacion

Funcion:

- congelar titulares, banco y reservas

Contenido:

- titulares
- banco
- capitan
- dorsales
- posicion en cancha

Acciones:

- drag and drop simple
- autocompletar desde convocatoria
- validar cupos segun deporte/categoria
- exportar grafica de formacion

Salida clave:

- `club_match_lineups`

## 5. Estadisticas

Funcion:

- cargar y revisar datos por jugador y equipo

Vista:

- tabla por jugador
- resumen por equipo

Campos recomendados MVP:

- minutos
- tries
- tackles
- metros
- errores
- rating

Acciones:

- edicion rapida
- presets por deporte
- vista comparativa por puesto
- marcar jugador destacado

Salida clave:

- `club_match_player_stats`

## 6. Notas

Funcion:

- capturar contexto no estructurado

Subsecciones:

- prepartido
- entretiempo
- postpartido
- medica
- logistica

Salida clave:

- `club_match_notes`

## 7. Pizarron

Funcion:

- preparar y revisar ideas tacticas del partido

Este modulo es diferencial del producto. No deberia quedar como extra.

Contenido:

- jugadas preparadas
- estructura defensiva
- salidas
- scrum / line / salida media cancha
- review visual postpartido

Acciones:

- crear board nuevo
- guardar version
- adjuntar snapshot
- vincular board a nota o reporte
- exportar imagen para staff o contenido

Salida clave:

- `club_match_tactical_boards`

## 8. Rendimiento fisico

Funcion:

- registrar carga y observaciones del PF

Contenido sugerido:

- minutos
- carga percibida
- peso pre y post
- molestias
- observaciones

Puede vivir primero dentro de reportes o metrics JSONB si querés MVP rapido.

## 9. Reporte final

Funcion:

- cerrar el partido desde la mirada del staff

Subtipos:

- head coach
- asistente
- PF
- manager
- video

Contenido:

- resumen
- puntos altos
- problemas
- proxima accion

Salida clave:

- `club_match_reports`

## 10. Content Engine

Funcion:

- transformar operacion en piezas publicables

No es un tab accesorio: es parte del negocio.

Piezas iniciales sugeridas:

- convocatoria
- formacion
- proximo partido
- resultado final
- jugador destacado

Inputs:

- lineup confirmada
- stats
- sponsor activo
- branding del club

CTA:

- `Enviar a G22 Studio`
- `Exportar PNG`
- `Crear story`

---

## Flujo real de usuario

## Caso A: Partido oficial ya cargado

1. entra al Club Admin
2. abre `Partidos`
3. ve `Jockey CC vs Tala RC`
4. badge `Oficial G22`
5. hace click en `Abrir ficha`
6. el sistema crea o reusa `club_match_workspace`
7. carga disponibilidad
8. arma convocatoria
9. confirma formacion
10. post partido completa stats y reporte
11. exporta formacion o resultado para redes

## Caso B: Partido interno

1. entra a `Partidos`
2. click en `Nuevo partido interno`
3. selecciona equipo/division/rival/fecha
4. se crea `matches` con `source_type='club'`
5. se abre la ficha directamente
6. trabaja convocatoria, tactica y reporte
7. opcional: envia a revision para sync

## Caso C: Partido creado por club luego vinculado

1. el club crea un amistoso o partido no publicado
2. trabaja normalmente sobre la ficha
3. luego aparece el oficial o se decide promoverlo
4. el sistema sugiere vinculacion
5. admin acepta
6. el workspace sigue intacto
7. el partido pasa a estado oficial o hybrid

---

## Estado operacional del workspace

La ficha necesita un mini workflow interno visible.

Estados sugeridos:

- `draft`
- `planning`
- `ready`
- `live`
- `review`
- `closed`

### Reglas simples

- `draft`: se creo la ficha
- `planning`: hay convocatoria o disponibilidad cargada
- `ready`: formacion confirmada
- `live`: partido en curso
- `review`: stats o notas postpartido en carga
- `closed`: reporte final completo

Esto no reemplaza `matches.status`.

`matches.status` dice que pasa con el partido.

`workspace_status` dice que tan avanzada esta la operacion interna del club.

---

## Checklist lateral

La sidebar debe mostrar progreso real.

Checklist sugerido:

- disponibilidad inicial
- convocatoria cerrada
- formacion confirmada
- stats cargadas
- reporte final
- export social listo

Cada item con:

- estado
- responsable
- ultima actualizacion

---

## Integracion con equipo y roster

La ficha no puede trabajar solo con `person_id`.

Tiene que operar con:

- `team_id`
- `division_id`
- `team_membership_id`

Porque el usuario necesita saber:

- de que plantel sale cada jugador
- que contexto tenia en ese momento
- si ese mismo jugador esta en mas de un equipo

---

## Integracion con Club Content Studio

La ficha y `Exports Sociales` no deben ser modulos desconectados.

Relacion recomendada:

- la ficha genera payload operativo
- Studio renderiza pieza final

Ejemplo:

- convocatoria confirmada -> `template=formacion`
- resultado final + sponsor -> `template=resultado`
- jugador destacado + stats -> `template=mvp`

---

## Integracion con sponsors

Cada pieza exportable puede leer:

- sponsor principal del club
- sponsor del equipo
- sponsor puntual del partido

MVP:

- slot de sponsor visual en convocatoria, formacion y resultado

---

## Integracion con permisos

### Admin general

- ve y edita todo
- crea partidos internos
- vincula y publica
- exporta contenido

### Admin de division o equipo

- solo ve workspaces de su alcance
- edita convocatoria, lineup, notas, tactica
- puede dejar contenido listo
- no necesariamente publica

### Operador de partido

- actualiza estado operativo
- carga stats rapidas
- completa live/review

---

## MVP recomendado

Si querés construir esto sin dispersarte, el MVP de ficha deberia incluir:

1. header operativo
2. convocatoria
3. disponibilidad
4. formacion
5. notas
6. stats simples
7. CTA a export social

El pizarron puede entrar en fase 2, pero deberia quedar previsto desde el diseño.

---

## Roadmap de producto

### Version 1

- ficha basica
- convocatoria
- formacion
- notas
- export de convocatoria/formacion

### Version 2

- stats por jugador
- reporte final
- jugador destacado
- sponsor overlays

### Version 3

- pizarron tactico
- reportes de staff por rol
- generacion automatica de story/post

---

## Decision final

La ficha operativa no es una pantalla mas del club admin.

Es el lugar donde G22 deja de ser solo un sistema de resultados y pasa a ser:

- sistema operativo deportivo del club
- sistema operativo del partido
- origen del motor de contenido

En una frase:

`public.matches` define el evento.

`club_match_workspaces` define el trabajo interno.

La Ficha Operativa de Partido convierte ese trabajo en gestion, analitica y contenido.

