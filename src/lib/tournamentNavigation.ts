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
  const enLaDivision = hermanos.filter(
    (t) => divisionKey({ ...t, season_id: t.season_id }) === clave && t.subcategory !== null,
  );

  // Un menú con un solo grado distinto no distingue nada: es el caso de los
  // juveniles antes del eje, donde decía "juvenil" veintiocho veces.
  const distintos = new Set(enLaDivision.map((t) => t.subcategory));
  if (distintos.size < 2) return [];

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
    .map((t) => {
      const repetido = (cuenta.get(String(t.subcategory)) ?? 0) > 1;
      return {
        id: t.id,
        label: String(t.subcategory),
        detalle: repetido ? ETIQUETA_RUEDA[ruedaDeTorneoUrba(t.name)] : null,
        esActual: t.id === actual.id,
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
 * El menú de TEMPORADAS de un torneo.
 *
 * El que llama decide qué años entran: hoy sólo los publicados, porque un año
 * oculto se lista como destino y al entrar no se ve nada. Acá sólo se agrupa y
 * se ordena — de más nuevo a más viejo, que es como se busca una temporada.
 *
 * ── Un año puede aparecer más de una vez, y el orden adentro importa ───────
 * Pasa en 118 de los pares (competencia, año) de URBA: la fuente parte la
 * temporada en ruedas, o publica sus fases como torneos aparte. Se listan TODAS
 * —esconder una obligaría a elegir a cuál llevar, y eso no tiene respuesta— pero
 * ordenadas: la temporada regular primero y las fases después, en orden
 * cronológico.
 *
 * Sin esto, el menú del Top 14 ofrecía "2022" tres veces empezando por
 * `Semifinal`, que es la mitad del torneo. Y en 4 pares —los cuatro de 2022—
 * URBA directamente no publicó una regular, así que ahí el primero es
 * `Clasificación`: la fase de grupos, que es lo más parecido a la temporada.
 * El orden no inventa un dato que la fuente no tiene; solamente deja adelante lo
 * que más se parece a lo que el usuario fue a buscar.
 */
export function menuDeTemporadas(actual: TorneoHermano, hermanos: TorneoHermano[]): OpcionMenu[] {
  const clave = competitionKey(actual);
  const mismaCompetencia = hermanos.filter((t) => competitionKey(t) === clave && t.season_id);

  // Un solo año: no hay temporada que elegir, y el menú no se dibuja.
  const anios = new Set(mismaCompetencia.map((t) => t.season_id));
  if (anios.size < 2) return [];

  return mismaCompetencia
    .slice()
    .sort((a, b) => {
      const porAnio = String(b.season_id).localeCompare(String(a.season_id));
      if (porAnio !== 0) return porAnio;
      const porInstancia = ordenDeInstancia(a.name) - ordenDeInstancia(b.name);
      if (porInstancia !== 0) return porInstancia;
      // Desempate estable. Deja la regular antes que sus ruedas, porque el
      // nombre de la rueda es el de la regular más un sufijo.
      return a.name.localeCompare(b.name, 'es');
    })
    .map((t) => ({
      id: t.id,
      label: String(t.season_id),
      // El nombre completo como segunda línea: en el histórico la misma
      // competencia cambió de nombre (Top 12 -> Top 13 -> Top 14) y sin esto el
      // usuario no ve por qué "2022" lo lleva a un torneo que se llama distinto.
      detalle: t.name.replace(/^URBA:\s*/, '') || null,
      esActual: t.id === actual.id,
    }));
}
