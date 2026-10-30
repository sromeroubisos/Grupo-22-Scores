# Recon — El Interino (interino.web.app) → El Entrenador de G22 Scores

Fecha: 2026-10-14. Recorrido a mano en el navegador, como invitado, a velocidad
humana. Sin bundles, sin endpoints, sin capturas guardadas en el repo.

## Alcance

- **App:** El Interino, web (SPA con rutas hash: `#/carrera`).
- **Tajada:** el arranque de carrera y el loop de pretemporada → temporada. Es
  el loop central.
- **Para quién:** El Entrenador, el minijuego de DT de rugby de G22 Scores, que
  ya es la adaptación a rugby de Interino (spec:
  `Claude outputs/el-interino-rugby-spec-de-adaptacion.md`, construido el
  2026-09-08). Este recon mide **la brecha** que queda entre los dos.

## Fuentes

| fuente | url | qué dio |
|---|---|---|
| sitio, como invitado | https://interino.web.app/ | landing, creación, firma, pretemporada, primeras fechas |
| ruta de carrera | https://interino.web.app/#/carrera | cabecera, objetivos, tienda, evento de mercado, partido decisivo |
| spec interna | `Claude outputs/el-interino-rugby-spec-de-adaptacion.md` | qué se adaptó y qué se dejó afuera a propósito |
| motor propio | `src/features/coach/**` | lo que ya existe |

## Pantallas

| ID | pantalla | cómo se llega | para qué | componentes | estados vistos |
|---|---|---|---|---|---|
| S01 | Landing | `/` | nombre + nacionalidad + "Nueva carrera" | hero, input, select, CTA, login Google | inicial, cargando |
| S02 | Personalidad como DT | tras "Nueva carrera" | repartir 7 puntos libres entre 5 stats (base 3.0) | filas con −/+, contador, arquetipo ("Equilibrado") | 7 por repartir, 0 por repartir (CTA se habilita) |
| S03 | Elegí tu club | tras confirmar | tres ofertas del ascenso con tier (C/B/A) y 4 stats de club; resto bloqueado por nivel | tarjetas de oferta, chip de tier, "Elegir club", tarjetas bloqueadas "Nivel 5/10" | 3 ofertas, bloqueadas |
| S04 | Bienvenida / pretemporada | firmar contrato | objetivo y pesos de la directiva (Deportivo 55 · Economía 25 · Cantera 20) | cabecera (fichajes, sueldos, presión, reputación, club), panel lateral de stats y objetivos, formación | inicial |
| S05 | Confirmar arranque | "Arrancar temporada" | aviso: se simula solo y frena en decisiones | modal con dos botones | abierto |
| S06 | Tienda del club | al arrancar | partida especial para mejoras permanentes por niveles (cantera, cuerpo médico, ojeador, seguimiento, alcance de búsqueda) | tarjetas por categoría, nivel 0–5, botón "Subir a nivel N — $X" | cerrada, abierta |
| S07 | Evento de mercado | durante la temporada | un club rival viene por tu figura: aceptar (+plata) o rechazar | ficha del jugador, dos opciones | pendiente |
| S08 | Partido decisivo | clásico | el juego frena y abre un minijuego ("Reflejos") | escudos, "Jugar" | pendiente |
| S09 | Ticker "dónde estabas" | siempre | posición, objetivo ("vas bien / vas justo"), próximo partido | barra superior | — |

No visto en este recorrido (detrás de login o más adelante en la carrera):
Ranking, Misiones, Logros, Vitrina, Inventario, Mercado/Cantera/Calendario en
profundidad, fin de temporada, despido.

## Flujos

```
F01 Arrancar una carrera
    S01 → S02 → S03 → S04 → S05 → temporada
    clics del camino feliz: 1 (nueva) + 7 (+) + 1 (confirmar) + 1 (firmar) + 1 (arrancar) + 1 (modal) = 12
F02 Invertir en el club
    S06 → subir una mejora → cerrar
F03 Resolver un evento a mitad de temporada
    S07 → aceptar / rechazar → sigue la simulación
```

## Componentes

stat-row con −/+ y contador · tarjeta de oferta con chip de tier · tarjeta
bloqueada · cabecera con 5 cifras · panel de objetivos con estado ○ ◐ ● ·
tarjeta de mejora con nivel y precio · modal de confirmación · ticker.

## Modelo de datos inferido

```
Coach        name, nationality, stats{tactica,gestion,motivacion,disciplina,templanza} (1..10, base 3, +7 libres)
             evidencia: S02 · confianza: alta
ClubOffer    clubId, tier (A|B|C, relativo a su división), stats{historia,actualidad,hinchada,estructura}, contrato 1 año
             evidencia: S03 · confianza: alta
Objectives   [{axis: deportivo|economia|cantera, weight, text, status}]
             evidencia: S04 "La directiva evalúa" · confianza: alta
ClubUpgrade  id, category, level 0..5, nextCost
             evidencia: S06 · confianza: alta
```

## Brecha con El Entrenador

| Interino | El Entrenador hoy | adaptación a rugby |
|---|---|---|
| Repartir puntos libres (S02) | Se elige 1 de 5 perfiles fijos | Perfil + **ajuste fino**: mover hasta ±2 por eje, la suma (25) no cambia |
| 3 ofertas del ascenso con tier (S03) | Lista libre de 227 clubes | **3 ofertas** C/B/A del fondo de la pirámide; la lista libre queda como "elegir otro club" (es tu club, en G22 eso importa) |
| Ofertas tras el despido | Lista libre | **Ofertas según reputación**: el despedido no agarra el Top 14 |
| Tienda del club (S06) | — | **Mejoras del club** pagadas con la caja: kinesiología, gimnasio, entrenador del M19, analista de video, micro propio. Tensión: invertir o guardar para el viaje |
| Directiva con pesos (S04) | Un objetivo deportivo + castigo por deuda | **Evaluación en tres ejes** (deportivo 60 · caja 25 · cantera 15) con nota de la directiva |
| Oferta por tu figura (S07) | `Lo llaman de Europa` ya existe | Ya cubierto, sin traspaso (rugby amateur) |
| Ticker / panel de objetivos | Cabecera con presión | Panel de los tres objetivos en la pretemporada |

## Qué no se clona

- Valor de mercado, fichajes y sueldos: en el rugby de clubes argentino no
  existen (§5 de CLAUDE.md, `economy.ts`).
- Formación táctica 4-4-2 / química: la spec lo marca como el riesgo "manager
  profundo". El XV sale por puesto.
- Ojeador y alcance de búsqueda: dependen de un mercado que no hay.
- Minijuegos en partidos decisivos, Ranking, Misiones, Logros, Vitrina,
  Inventario y login: capa de cuenta, fuera de esta tajada (opción descartada
  por el usuario el 2026-10-14).

## Tamaño

5 piezas, 0 tablas nuevas, ~8 archivos de motor y ~5 de UI. Talla **S**.
Lo difícil: (1) balance de las mejoras sin romper el harness de 1.000 carreras,
(2) migrar el guardado al esquema 2 sin perder partidas, (3) ofertas
deterministas sin consumir el RNG de la carrera.
