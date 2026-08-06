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
 * ── La regla, y por qué tiene tres cláusulas y no una ─────────────────────
 * Entra al listado por defecto la fila que cumple ALGUNA de estas:
 *
 *   1. Es de la temporada en curso. Es lo pedido, y es el 99% de los casos.
 *   2. Tiene `priority > 0`. Es el único rastro de curación humana que hay en
 *      esta tabla: `sortTournamentsByPriority` la usa para decidir qué va
 *      arriba de todo. Una regla automática no puede deshacer en silencio una
 *      decisión editorial.
 *   3. Su unión NO tiene nada en la temporada en curso, y ésta es su edición
 *      más reciente.
 *
 * Las tres salieron de medir, no de imaginar:
 *
 * (2) La **Unions Cup** de 2024 tiene `priority = 90`. La primera versión de
 *     este módulo agrupaba por unión y se quedaba con la temporada más nueva de
 *     cada una: como `asia-rugby` también tiene un "Asia Rugby Championship
 *     Womens" de 2026, la Unions Cup desaparecía. **Una unión no es una
 *     competencia**: la confederación no republica el mismo torneo cada año, así
 *     que "lo más nuevo de asia-rugby" no es la edición siguiente de nada. Hoy
 *     hay exactamente DOS torneos publicados con `priority > 0`, así que la
 *     puerta es angosta y se puede contar con los dedos.
 *
 * (3) Sin esto, el 1 de enero la portada se vacía. La temporada en curso pasa a
 *     ser la nueva mientras la unión todavía no cargó un solo torneo, y el
 *     listado se queda sin sus 126 competencias hasta que el conector corra. Es
 *     el mismo modo de falla que `const ANIO = 2026`: una fecha que rompe una
 *     vez al año, en producción, sin un error. La cláusula sólo se activa cuando
 *     el año en curso está VACÍO para esa unión, así que no revive nada mientras
 *     haya temporada nueva.
 *
 * Una fila sin `union_id` no tiene la cláusula 3 —no hay grupo del que ser "lo
 * más reciente"—, así que se juzga sólo por su año y por su prioridad. Es lo
 * correcto para un torneo suelto: no tiene quién lo reemplace, pero tampoco es
 * el catálogo de nadie.
 */

/** Lo mínimo que hace falta para decidir si una fila entra. */
export interface FilaConTemporada {
  id?: string | null;
  season_id?: string | number | null;
  union_id?: string | null;
  /** > 0 = alguien la fijó a mano. Ver la cláusula 2 de arriba. */
  priority?: number | null;
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

/** Curada a mano: `sortTournamentsByPriority` la sube, este filtro no la baja. */
function estaFijada(fila: FilaConTemporada): boolean {
  return typeof fila.priority === 'number' && Number.isFinite(fila.priority) && fila.priority > 0;
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
    return filas.filter((f) => {
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
    const t = temporadaDe(fila);
    const union = unionDe(fila);
    if (!t || !union) continue;
    if (t === enCurso) unionesConTemporadaEnCurso.add(union);
    const previa = masRecienteDeLaUnion.get(union);
    if (!previa || t.localeCompare(previa) > 0) masRecienteDeLaUnion.set(union, t);
  }

  return filas.filter((fila) => {
    const t = temporadaDe(fila);
    if (t === null) return true;              // sin temporada: no se la puede juzgar
    if (t === enCurso) return true;           // 1
    if (estaFijada(fila)) return true;        // 2

    const union = unionDe(fila);              // 3
    if (!union) return false;
    if (unionesConTemporadaEnCurso.has(union)) return false;
    return masRecienteDeLaUnion.get(union) === t;
  });
}
