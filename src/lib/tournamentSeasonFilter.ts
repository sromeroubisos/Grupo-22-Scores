/**
 * Qué temporada muestra el listado de competencias.
 *
 * ── El problema, medido ────────────────────────────────────────────────────
 * El listado NO filtraba por temporada. Publicar 2025 de URBA lo llevó de 129 a
 * 251 entradas con un solo año histórico adentro, y quedan cuatro por publicar.
 * Lo que hoy salva la lectura es un accidente: URBA cambió su convención de
 * nombres entre 2025 y 2026, así que las ediciones no se llaman igual. Con 2024
 * eso se termina.
 *
 * ── A QUIÉN se le aplica: sólo a quien carga temporadas enteras ───────────
 * El filtro existe para contener los 677 torneos históricos de URBA, NO para
 * reordenar el catálogo que se cargó a mano. Un torneo que alguien dio de alta
 * uno por uno se muestra siempre, tenga el año que tenga.
 *
 * Esa distinción está en `UNIONES_CON_CATALOGO_POR_TEMPORADA` y hoy tiene un
 * solo elemento. Es a propósito que sea una lista explícita y no una heurística:
 * la regla dice lo que hace.
 *
 * ── Por qué NO se usa `priority` para esto ────────────────────────────────
 * Fue la primera versión y estaba mal. `priority` es curación editorial —lo que
 * `sortTournamentsByPriority` mira para decidir qué va arriba de todo— y usarla
 * como escape del filtro obligaba a fijar un torneo para deshacer un efecto
 * colateral nuestro. Dos significados en una columna, y el segundo no se lee en
 * ningún lado. El caso que lo destapó: la **Unions Cup** de 2024 (`asia-rugby`,
 * `priority = 90`) desaparecía porque su unión tiene un "Asia Rugby Championship
 * Womens" de 2026 que NO es la edición siguiente de nada —una unión no es una
 * competencia—. Con el filtro acotado a URBA el problema no existe: `asia-rugby`
 * nunca entra.
 *
 * ── Y para las uniones que sí filtran, dos cláusulas ──────────────────────
 * Pasa la fila que cumple alguna:
 *
 *   1. Es de la temporada en curso. Es lo pedido, y es el 99% de los casos.
 *   2. Su unión NO tiene nada en la temporada en curso, y ésta es su edición
 *      más reciente. Sin esto, el 1 de enero la portada se vacía: el año en
 *      curso pasa a ser el nuevo mientras el conector todavía no cargó un solo
 *      torneo, y el listado se queda sin sus 126 competencias sin que falle
 *      nada. Es el mismo modo de falla que `const ANIO = 2026`. Se apaga sola en
 *      cuanto entra el primer torneo del año nuevo.
 */

/**
 * Las uniones que publican su calendario ENTERO, temporada por temporada, y por
 * eso pueden inundar el listado con años viejos.
 *
 * URBA carga 134 torneos por año; seis temporadas son 811. Lo demás del catálogo
 * entró a mano, de a uno, y no filtra: no hay volumen que contener y esconder un
 * torneo que alguien dio de alta sería decidir por él.
 *
 * Cuando entre otra unión con carga masiva, se agrega acá y en ningún otro lado.
 */
const UNIONES_CON_CATALOGO_POR_TEMPORADA = new Set(['urba']);

/** Lo mínimo que hace falta para decidir si una fila entra. */
export interface FilaConTemporada {
  id?: string | null;
  season_id?: string | number | null;
  union_id?: string | null;
}

/**
 * La temporada en curso, en hora de Buenos Aires.
 *
 * La zona no es decorativa: el servidor corre en UTC y a las 23:00 argentinas
 * del 31 de diciembre en UTC ya es enero, así que `new Date().getFullYear()`
 * adelanta la temporada por un día entero.
 *
 * `integrations/urba/temporada.ts` tiene su propia copia de estas cuatro líneas,
 * y NO se comparten a propósito: el conector no puede depender de un módulo del
 * listado público ni al revés —ese import cruzado ata la sincronización de URBA
 * a cómo se dibuja la portada—. Son cuatro líneas de `Intl`, cada una con su
 * test del 31 de diciembre a las 23:00. La que sí se comparte es la regla, y
 * está escrita en los dos lados.
 */
export function temporadaActual(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
  }).format(ahora);
}

/** Normaliza a la forma con la que se compara y se ordena: cadena, o null. */
function temporadaDe(fila: FilaConTemporada): string | null {
  const v = String(fila.season_id ?? '').trim();
  return v ? v : null;
}

/** La unión que carga la fila, o null si es un torneo suelto. */
function unionDe(fila: FilaConTemporada): string | null {
  const union = String(fila.union_id ?? '').trim();
  return union ? union : null;
}

/** ¿Esta fila está sujeta al filtro? Sólo si su unión carga por temporada. */
function filtra(fila: FilaConTemporada): boolean {
  const union = unionDe(fila);
  return union !== null && UNIONES_CON_CATALOGO_POR_TEMPORADA.has(union);
}

/**
 * La temporada que hay que MOSTRAR al lado del nombre, o null si no aporta.
 *
 * La temporada en curso no se escribe. Si el listado muestra 2026 y todas las
 * tarjetas dicen "2026", el dato no distingue nada: son 126 repeticiones de lo
 * mismo. Aparece exactamente donde desambigua —la Unions Cup de 2024 entre los
 * torneos de este año, o el listado entero cuando se pidió `?season=2025`—, que
 * es la misma disciplina con la que la rueda sale sólo donde hay colisión.
 */
export function etiquetaDeTemporada(
  seasonId: string | number | null | undefined,
  ahora: Date = new Date(),
): string | null {
  const t = String(seasonId ?? '').trim();
  if (!t) return null;
  return t === temporadaActual(ahora) ? null : t;
}

/**
 * Las temporadas que el listado podría ofrecer, de la más nueva a la más vieja.
 * Sirve para un selector explícito; hoy no hay ninguno dibujado.
 */
export function temporadasDisponibles(filas: FilaConTemporada[]): string[] {
  const vistas = new Set<string>();
  for (const fila of filas) {
    const t = temporadaDe(fila);
    if (t) vistas.add(t);
  }
  return [...vistas].sort((a, b) => b.localeCompare(a));
}

/**
 * Deja en el listado una sola temporada por unión.
 *
 * @param temporadaPedida cuando viene, manda: el listado muestra ESE año y nada
 *        más. Es el filtro explícito (`?season=2025`), y por eso pasa por encima
 *        de la regla de "la más reciente" — si alguien pide 2025, quiere 2025.
 *
 * Las filas sin temporada se quedan SIEMPRE, incluso con un año pedido: no se
 * las puede juzgar por un campo que no tienen, y sacarlas sería castigar un dato
 * faltante con una desaparición. Hoy no hay ninguna publicada, así que la rama
 * no cambia ningún número — está para el día que aparezca una.
 */
export function filtrarPorTemporada<T extends FilaConTemporada>(
  filas: T[],
  temporadaPedida?: string | null,
  ahora: Date = new Date(),
): T[] {
  const pedida = String(temporadaPedida ?? '').trim();
  if (pedida) {
    // El año pedido tampoco toca lo que no filtra: pedir 2025 es pedir la
    // temporada 2025 DE URBA, no esconder el catálogo cargado a mano.
    return filas.filter((f) => {
      if (!filtra(f)) return true;
      const t = temporadaDe(f);
      return t === null || t === pedida;
    });
  }

  const enCurso = temporadaActual(ahora);

  // Qué uniones ya tienen algo en la temporada en curso, y cuál es la edición
  // más nueva de cada una. Sólo las que NO tienen nada usan la segunda.
  const unionesConTemporadaEnCurso = new Set<string>();
  const masRecienteDeLaUnion = new Map<string, string>();
  for (const fila of filas) {
    if (!filtra(fila)) continue;
    const t = temporadaDe(fila);
    const union = unionDe(fila);
    if (!t || !union) continue;
    if (t === enCurso) unionesConTemporadaEnCurso.add(union);
    const previa = masRecienteDeLaUnion.get(union);
    if (!previa || t.localeCompare(previa) > 0) masRecienteDeLaUnion.set(union, t);
  }

  return filas.filter((fila) => {
    if (!filtra(fila)) return true;           // cargado a mano: se muestra siempre
    const t = temporadaDe(fila);
    if (t === null) return true;              // sin temporada: no se la puede juzgar
    if (t === enCurso) return true;           // 1

    const union = unionDe(fila) as string;    // 2
    if (unionesConTemporadaEnCurso.has(union)) return false;
    return masRecienteDeLaUnion.get(union) === t;
  });
}
