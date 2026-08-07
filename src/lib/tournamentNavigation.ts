import { competitionKey, divisionKey, ordenDeSubcategory } from './competitionKey.ts';
import { compararEjesJuveniles, ruedaDeTorneoUrba, ETIQUETA_RUEDA } from './integrations/urba/ejeJuvenil.ts';
import { instanciaDeTorneoUrba } from './integrations/urba/externalId.ts';

/**
 * Los dos desplegables de navegación de un torneo, armados a partir de sus
 * hermanos. Función pura: recibe las filas y devuelve los menús. La lectura de
 * la base y la política de qué filas entran viven en la ruta.
 *
 *   GRADO      hermanos = misma división (temporada, category, age_grade, gender)
 *              y distinta `subcategory`. En mayores es Superior / Intermedia /
 *              Preintermedia; en juveniles es el grupo y la zona.
 *
 *   TEMPORADA  hermanos = misma competencia (`competitionKey`) y distinto año.
 *
 * ── Un menú de un solo ítem no es un menú ──────────────────────────────────
 * Los dos se devuelven VACÍOS cuando no hay a dónde ir. Es lo que evita el hueco
 * en el diseño: la UI no dibuja un desplegable que sólo se ofrece a sí mismo.
 */

export interface TorneoHermano {
  id: string;
  name: string;
  season_id: string | null;
  category: string | null;
  subcategory: string | null;
  age_grade: string | null;
  gender: string | null;
}

export interface OpcionMenu {
  id: string;
  /** Lo que se lee en el ítem. */
  label: string;
  /** Segunda línea, sólo cuando hace falta desambiguar. */
  detalle: string | null;
  esActual: boolean;
}

/**
 * El orden de los grados: jerárquico en mayores, natural en juveniles.
 *
 * Se elige por la FORMA del valor y no por el `age_grade`: un `G2 Zona A` se
 * ordena como juvenil venga de donde venga, y un `Preintermedia B` como mayores.
 * Así no hace falta una rama por categoría ni se rompe si mañana entra un
 * juvenil con un grado de mayores.
 */
const esEjeJuvenil = (s: string | null) => /^G\d\b/.test(String(s ?? '')) || /^Formativa\b/.test(String(s ?? ''));

export function compararGrados(a: string | null, b: string | null): number {
  const ja = esEjeJuvenil(a);
  const jb = esEjeJuvenil(b);
  if (ja && jb) return compararEjesJuveniles(a, b);
  // Los de mayores primero si se mezclaran, para que el orden sea determinista.
  if (ja !== jb) return ja ? 1 : -1;
  const d = ordenDeSubcategory(a) - ordenDeSubcategory(b);
  return d !== 0 ? d : String(a ?? '').localeCompare(String(b ?? ''));
}

/**
 * Saca las fases de definición de un conjunto de torneos del mismo grado.
 *
 * Sólo saca la fase cuando su grado tiene otra cosa que ofrecer: si de un grado
 * TODO lo que hay son fases, se queda la más temprana —la clasificación—, porque
 * borrarlo entero dejaría el grado sin representante en el menú.
 *
 * Las ruedas no son fases y no se tocan acá: dos ruedas del mismo grado son dos
 * campeonatos con planteles distintos, y ésa fue la decisión de carga.
 */
function dejarUnoPorGrado(torneos: TorneoHermano[]): TorneoHermano[] {
  const porGrado = new Map<string, TorneoHermano[]>();
  for (const t of torneos) {
    const k = String(t.subcategory);
    if (!porGrado.has(k)) porGrado.set(k, []);
    porGrado.get(k)!.push(t);
  }

  const out: TorneoHermano[] = [];
  for (const delGrado of porGrado.values()) {
    const sinFase = delGrado.filter((t) => instanciaDeTorneoUrba(t.name) === null);
    if (sinFase.length) {
      // Hay torneos regulares (uno, o uno por rueda): entran todos y las fases
      // se van.
      out.push(...sinFase);
      continue;
    }
    // Sólo fases: se queda la más temprana, que es la que hace de temporada.
    out.push(delGrado.slice().sort((a, b) => {
      const d = ordenDeInstancia(a.name) - ordenDeInstancia(b.name);
      return d !== 0 ? d : a.name.localeCompare(b.name, 'es');
    })[0]);
  }
  // El orden final lo pone el llamador; acá sólo se filtra.
  return torneos.filter((t) => out.includes(t));
}

/**
 * El menú de GRADOS de un torneo.
 *
 * ── La rueda ───────────────────────────────────────────────────────────────
 * Hay 87 pares de torneos que comparten grado y sólo se diferencian por la
 * rueda: `G2 Zona B` de la primera y de la segunda. La rueda NO entra en
 * `subcategory` —no es un grado, son dos mitades del mismo campeonato— así que
 * la desambiguación es de presentación y se hace acá.
 *
 * Y se muestra SÓLO cuando desambigua. Ponerla en todos los ítems ensuciaría los
 * menús donde no hay ninguna colisión, que son 62 de las 85 divisiones juveniles.
 */
export function menuDeGrados(actual: TorneoHermano, hermanos: TorneoHermano[]): OpcionMenu[] {
  const clave = divisionKey({ ...actual, season_id: actual.season_id });
  const enLaDivisionCrudo = hermanos.filter(
    (t) => divisionKey({ ...t, season_id: t.season_id }) === clave && t.subcategory !== null,
  );

  // UNA FASE TAMPOCO ES UN GRADO. Es el mismo error que tenía el menú de
  // temporadas: `TOP 13 - Superior - Semifinal` comparte subcategory con
  // `- Clasificación` y con `- Final`, así que el menú del Top 13 de 2022
  // listaba "Superior" TRES VECES, y lo mismo cada uno de sus otros cinco
  // grados: dieciocho ítems para seis grados.
  //
  // Se deja un torneo por grado: el regular. Si de un grado sólo hay fases
  // —los 4 casos de 2022—, queda la clasificación, que es la fase de grupos.
  // Las RUEDAS no se tocan: `G2 Zona B` de la primera y de la segunda son dos
  // campeonatos distintos, ésa fue la decisión de carga, y siguen apareciendo
  // las dos con la rueda como etiqueta secundaria.
  const enLaDivision = dejarUnoPorGrado(enLaDivisionCrudo);

  // Un menú con un solo grado distinto no distingue nada: es el caso de los
  // juveniles antes del eje, donde decía "juvenil" veintiocho veces.
  const distintos = new Set(enLaDivision.map((t) => t.subcategory));
  if (distintos.size < 2) return [];

  const estaEnLaLista = enLaDivision.some((t) => t.id === actual.id);

  // Cuántas veces aparece cada grado: si es una sola, la rueda no hace falta.
  const cuenta = new Map<string, number>();
  for (const t of enLaDivision) {
    const k = String(t.subcategory);
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }

  return enLaDivision
    .slice()
    .sort((a, b) => {
      const d = compararGrados(a.subcategory, b.subcategory);
      if (d !== 0) return d;
      // Dentro del mismo grado, la primera rueda antes que la segunda.
      const orden = { primera: 0, unica: 1, segunda: 2, final: 3 } as const;
      return orden[ruedaDeTorneoUrba(a.name)] - orden[ruedaDeTorneoUrba(b.name)];
    })
    .map((t, i, lista) => {
      const repetido = (cuenta.get(String(t.subcategory)) ?? 0) > 1;
      return {
        id: t.id,
        label: String(t.subcategory),
        detalle: repetido ? ETIQUETA_RUEDA[ruedaDeTorneoUrba(t.name)] : null,
        // Si el torneo actual es una FASE, quedó filtrado por
        // `dejarUnoPorGrado` y ningún ítem tendría su id. Parado en la
        // Semifinal de Preintermedia A, el grado actual sigue siendo
        // Preintermedia A: se marca el representante de ese grado, que si no el
        // menú no muestra dónde está uno.
        esActual: estaEnLaLista
          ? t.id === actual.id
          : t.subcategory === actual.subcategory
            && lista.findIndex((o) => o.subcategory === actual.subcategory) === i,
      };
    });
}

/* ────────────────────────────────────────────────────────────────────────────
 * QUÉ ENTRA EN LA PANTALLA PRINCIPAL
 *
 * Intermedia y Preintermedia NO son competencias sueltas: son grados de una
 * división de mayores. La Intermedia del Top 14 se llega desde el Top 14, no
 * desde el listado — que si no muestra ocho entradas del mismo torneo y la
 * portada se convierte en un índice de grados.
 *
 * La regla es angosta a propósito:
 *  · sólo los grados subordinados de MAYORES. Los juveniles no tienen cabeza de
 *    división —`G1 Zona A` y `G2 Zona B` son pares, no uno debajo del otro—, así
 *    que no se toca ninguno.
 *  · y sólo si su Superior está en la misma lista. Sin esa condición, una
 *    división cuya Superior no se publicó desaparecería entera del listado.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Los grados que cuelgan de una Superior. `Preintermedia B`, `Preintermedia`, etc. */
const GRADOS_SUBORDINADOS = /^(intermedia|preintermedia)\b/i;

export function esGradoSubordinado(subcategory: string | null | undefined): boolean {
  return GRADOS_SUBORDINADOS.test(String(subcategory ?? '').trim());
}

/**
 * Filtra de una lista los grados que se navegan desde su división.
 *
 * @param filas el listado tal como se va a mostrar. La condición "su Superior
 *        está en la lista" se evalúa sobre ESTE conjunto y no sobre la base: si
 *        la Superior quedó fuera por el filtro de deporte o de país, sus grados
 *        se quedan, que es lo que evita el agujero.
 */
export function ocultarGradosSubordinados<T extends {
  season_id?: string | null; category?: string | null;
  subcategory?: string | null; age_grade?: string | null; gender?: string | null;
}>(filas: T[]): T[] {
  const conSuperior = new Set(
    filas
      .filter((t) => String(t.subcategory ?? '').trim() === 'Superior')
      .map((t) => divisionKey({ ...t, season_id: t.season_id ?? null })),
  );
  return filas.filter((t) => {
    if (!esGradoSubordinado(t.subcategory)) return true;
    return !conSuperior.has(divisionKey({ ...t, season_id: t.season_id ?? null }));
  });
}

/**
 * El orden de las fases DENTRO de un año, cuando el año aparece varias veces.
 *
 * Es cronológico y no alfabético: la clasificación se juega antes que la
 * semifinal, y la semifinal antes que la final. Lo que no está en la lista va al
 * final, como en `ordenDeSubcategory`.
 */
const ORDEN_INSTANCIA = ['Clasificación', 'Play Off', 'Semifinal', 'Final', 'Ascenso', 'Permanencia'];

/** −1 para la temporada regular, que va primero. */
const ordenDeInstancia = (nombre: string): number => {
  const instancia = instanciaDeTorneoUrba(nombre);
  if (!instancia) return -1;
  const i = ORDEN_INSTANCIA.indexOf(instancia);
  return i === -1 ? ORDEN_INSTANCIA.length : i;
};

/**
 * El menú de TEMPORADAS de un torneo. **Un ítem por AÑO, y nunca más de uno.**
 *
 * ── Una temporada es un año, no un torneo ─────────────────────────────────
 * Ésta es la regla, y la versión anterior la rompía. El menú emitía una opción
 * por TORNEO, así que 2022 aparecía tres veces —Clasificación, Semifinal,
 * Final— como si fueran tres temporadas distintas. No lo son: son **una sola
 * temporada, la 2022**, partida en fases.
 *
 *     la clasificación  = la temporada regular, la que tiene tabla de posiciones
 *     semifinal y final = los playoffs de ESA temporada
 *
 * Un playoff no es una edición del torneo: es cómo termina la edición. Ofrecerlo
 * en el desplegable de temporadas le pide al usuario que elija entre "2022" y
 * "2022", que es una pregunta sin respuesta posible.
 *
 * Así que el año lleva a la temporada regular y punto. Las fases de definición
 * NO desaparecen —siguen siendo torneos con su página— pero su lugar es el
 * CUADRO DE PLAYOFF de la temporada, no este menú. Que hoy no estén ahí es una
 * deuda del modelo de datos, no algo que este menú pueda arreglar: URBA las
 * publica como torneos sueltos y en G22 tendrían que ser fases del torneo de la
 * temporada. Ver la nota en la bitácora.
 *
 * ── Cuál es "la temporada regular" cuando hay varias candidatas ───────────
 * Por orden, y sin inventar:
 *   1. El torneo sin fase en el nombre. Es la temporada regular tal cual.
 *   2. Si no hay, la CLASIFICACIÓN — que es la fase de grupos, o sea la
 *      temporada regular con otro nombre. Pasa en 4 divisiones, las cuatro de
 *      2022, donde URBA no publicó un torneo regular aparte.
 *   3. Si tampoco, la fase más temprana (semifinal antes que final).
 * Las ruedas quedan cubiertas por (1): el nombre de la rueda es el de la regular
 * más un sufijo, así que la regular gana el desempate por nombre.
 *
 * El que llama decide qué años entran: hoy sólo los publicados, porque un año
 * oculto se lista como destino y al entrar no se ve nada.
 */
export function menuDeTemporadas(actual: TorneoHermano, hermanos: TorneoHermano[]): OpcionMenu[] {
  const clave = competitionKey(actual);
  const mismaCompetencia = hermanos.filter((t) => competitionKey(t) === clave && t.season_id);

  // Un solo año: no hay temporada que elegir, y el menú no se dibuja.
  const anios = new Set(mismaCompetencia.map((t) => t.season_id));
  if (anios.size < 2) return [];

  // Por año, el torneo que MEJOR representa la temporada. El resto de las fases
  // de ese año no entran al menú: no son temporadas.
  const porAnio = new Map<string, TorneoHermano>();
  for (const t of mismaCompetencia) {
    const anio = String(t.season_id);
    const previo = porAnio.get(anio);
    if (!previo || esMejorRepresentante(t, previo)) porAnio.set(anio, t);
  }

  // El año del torneo en el que se está parado queda marcado como actual aunque
  // el representante sea otro torneo: si estoy en la Semifinal de 2022, el menú
  // tiene que decir que estoy en 2022 y no ofrecerme 2022 como si fuera otro lado.
  const anioActual = String(actual.season_id ?? '');

  return [...porAnio.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([anio, t]) => ({
      id: t.id,
      label: anio,
      // El nombre completo como segunda línea: en el histórico la misma
      // competencia cambió de nombre (Top 12 -> Top 13 -> Top 14) y sin esto el
      // usuario no ve por qué "2022" lo lleva a un torneo que se llama distinto.
      detalle: t.name.replace(/^URBA:\s*/, '') || null,
      esActual: anio === anioActual,
    }));
}

/** ¿`candidato` representa mejor a su temporada que `actual`? Ver el orden arriba. */
function esMejorRepresentante(candidato: TorneoHermano, actual: TorneoHermano): boolean {
  const d = ordenDeInstancia(candidato.name) - ordenDeInstancia(actual.name);
  if (d !== 0) return d < 0;
  // Empate: el nombre más corto gana, que es la regular contra su propia rueda
  // (`Top 12 - Superior` contra `Top 12 - Superior - Zona A - Segunda Rueda`).
  return candidato.name.localeCompare(actual.name, 'es') < 0;
}
