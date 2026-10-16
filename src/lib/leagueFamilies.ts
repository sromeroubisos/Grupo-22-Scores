import { divisionKey } from './competitionKey.ts';
import { compararGrados, esGradoSubordinado, menuDeGrados, type TorneoHermano } from './tournamentNavigation.ts';

/**
 * Las FAMILIAS del selector de ligas.
 *
 * El selector listaba una fila por torneo, y un torneo de URBA es una edición de
 * una zona: `Juveniles - Primera rueda - M16 - Grupo I - Zona A`. Son 136 filas
 * por temporada y 26 familias. Con la pestaña de juveniles, el país mostraba un
 * muro de nombres casi iguales.
 *
 * Una familia es lo que la ficha del torneo ya llama DIVISIÓN
 * (`divisionKey`: temporada, categoría, edad y género) vista desde afuera: los
 * hermanos que sólo se distinguen por la `subcategory` — Superior / Intermedia /
 * Preintermedia en mayores, grupo y zona en juveniles. En la lista es UNA entrada
 * y los grados quedan un nivel más abajo, que es el mismo menú que después se
 * ve adentro de la ficha (`menuDeGrados`), con el mismo orden y los mismos rótulos.
 *
 * Función pura y sin DOM: recibe la lista que la pantalla ya tiene y devuelve la
 * misma lista con las familias colapsadas. No consulta nada ni inventa datos: un
 * torneo sin `subcategory`, o el único de su división, pasa sin tocar.
 */

export interface MiembroDeFamilia {
  id: string;
  /** El grado: `Superior`, `Preintermedia B`, `G1 Zona A`. */
  label: string;
  /** Segunda línea, sólo cuando dos miembros comparten grado (la rueda). */
  detalle: string | null;
}

/** Lo que hace falta de un torneo del listado para saber a qué familia va. */
export interface TorneoDeLista {
  id: string;
  name: string;
  seasonId?: string | null;
  /** `categories[0]` del listado: llega en minúsculas, y `divisionKey` lo perdona. */
  categories?: unknown[];
  subcategory?: string | null;
  ageGroup?: string | null;
  gender?: string | null;
}

export type ConFamilia<T> = T & { familyMembers?: MiembroDeFamilia[] };

const categoriaDe = (t: TorneoDeLista): string | null => {
  const c = t.categories?.[0];
  return typeof c === 'string' && c.trim() ? c : null;
};

/** `primera a` -> `Primera A`, `top 14` -> `Top 14`. */
function capitalizar(valor: string): string {
  return valor
    .trim()
    .split(/\s+/)
    .map((palabra) => (palabra.length === 1 ? palabra.toUpperCase() : palabra[0].toUpperCase() + palabra.slice(1)))
    .join(' ');
}

const hermano = (t: TorneoDeLista): TorneoHermano => ({
  id: t.id,
  name: t.name,
  season_id: t.seasonId ?? null,
  category: categoriaDe(t),
  subcategory: t.subcategory ?? null,
  age_grade: t.ageGroup ?? null,
  gender: t.gender ?? null,
});

const claveDeDivision = (t: TorneoDeLista): string => divisionKey({ ...hermano(t) });

const porGrado = (a: TorneoDeLista, b: TorneoDeLista): number =>
  compararGrados(a.subcategory ?? null, b.subcategory ?? null) || a.name.localeCompare(b.name, 'es');

/**
 * El rótulo de la entrada que reemplaza a los miembros.
 *
 *  · Con Superior, la cabeza es la competencia y se llama como ella.
 *  · Si TODOS son grados subordinados (la reserva, que en la pestaña de juveniles
 *    viaja sin su Superior) es `Reserva · <división>`.
 *  · Juveniles con corte de edad: `Juveniles M16`, y la categoría detrás cuando
 *    distingue (`Formativo`, `Desarrollo`; `otro` no distingue nada).
 *  · Si nada de eso aplica, el nombre de la cabeza tal cual: no se inventa uno.
 */
function rotuloDeFamilia(cabeza: TorneoDeLista, miembros: TorneoDeLista[]): string {
  const categoria = categoriaDe(cabeza);
  const edad = String(cabeza.ageGroup ?? '').trim();
  const femenino = String(cabeza.gender ?? '').toLowerCase() === 'femenino';

  if (String(cabeza.subcategory ?? '').trim() === 'Superior') return cabeza.name;

  if (miembros.every((m) => esGradoSubordinado(m.subcategory))) {
    return categoria ? `Reserva · ${capitalizar(categoria)}` : cabeza.name;
  }

  if (/^m\s?\d{2}$/i.test(edad)) {
    const corte = edad.replace(/\s/g, '').toUpperCase();
    const detalle = categoria && categoria.toLowerCase() !== 'otro' ? ` · ${capitalizar(categoria)}` : '';
    return `Juveniles ${corte}${detalle}${femenino ? ' · Femenino' : ''}`;
  }

  return cabeza.name;
}

/**
 * Completa, con lo que dice la fila de la base, los torneos que llegaron por la
 * API pública del listado.
 *
 * Esa API devuelve el torneo sin `subcategory`, sin categoría y sin edad, así que
 * un mismo torneo puede llegar por dos caminos —la lista de la base y el
 * catálogo público— y el que gana el desduplicado decide si se puede agrupar. En
 * vez de cambiar el contrato de una API con caché persistida, se completa acá,
 * por `id`, con la fila que la pantalla ya tiene. Sólo se rellena lo que falta:
 * nunca se pisa un dato que el torneo ya traía.
 */
export function completarConFilasLocales<T extends TorneoDeLista>(lista: T[], locales: TorneoDeLista[]): T[] {
  if (locales.length === 0) return lista;
  const porId = new Map(locales.map((l) => [l.id, l]));
  return lista.map((t) => {
    if (t.subcategory) return t;
    const local = porId.get(t.id);
    if (!local || !local.subcategory) return t;
    return {
      ...t,
      subcategory: local.subcategory,
      gender: t.gender ?? local.gender ?? null,
      ageGroup: t.ageGroup ?? local.ageGroup ?? null,
      seasonId: t.seasonId ?? local.seasonId ?? null,
      categories: t.categories && t.categories.length > 0 ? t.categories : local.categories ?? [],
    } as T;
  });
}

/**
 * Colapsa los hermanos de una división en una sola entrada.
 *
 * La entrada ES la cabeza (mismo `id`, mismo `href`, misma posición y prioridad)
 * con el `name` de la familia y los `familyMembers`. Quién es la cabeza: la
 * Superior si hay; si no, el primer grado en el orden de la ficha. Así un clic en
 * el rótulo lleva a un torneo real, y el menú de grados despliega el resto.
 *
 * El orden de entrada se respeta: la familia ocupa el lugar de su cabeza.
 */
export function agruparEnFamilias<T extends TorneoDeLista>(lista: T[]): Array<ConFamilia<T>> {
  const porDivision = new Map<string, T[]>();
  for (const t of lista) {
    if (!t.subcategory || !String(t.subcategory).trim()) continue;
    const clave = claveDeDivision(t);
    const grupo = porDivision.get(clave);
    if (grupo) grupo.push(t);
    else porDivision.set(clave, [t]);
  }

  // id -> la entrada que lo reemplaza, o null si el torneo desaparece de la
  // lista porque ya está adentro de la familia de otro.
  const reemplazo = new Map<string, ConFamilia<T> | null>();
  for (const miembros of porDivision.values()) {
    if (miembros.length < 2) continue;

    const ordenados = miembros.slice().sort(porGrado);
    const cabeza = ordenados.find((t) => String(t.subcategory).trim() === 'Superior') ?? ordenados[0];

    // El menú de la ficha, tal cual: si no distingue ni dos grados no es una
    // familia, y los torneos siguen como filas sueltas.
    const menu = menuDeGrados(hermano(cabeza), miembros.map(hermano));
    if (menu.length < 2) continue;

    reemplazo.set(cabeza.id, {
      ...cabeza,
      name: rotuloDeFamilia(cabeza, miembros),
      familyMembers: menu.map((o) => ({ id: o.id, label: o.label, detalle: o.detalle })),
    });
    for (const m of miembros) if (m.id !== cabeza.id) reemplazo.set(m.id, null);
  }

  const salida: Array<ConFamilia<T>> = [];
  for (const t of lista) {
    if (!reemplazo.has(t.id)) {
      salida.push(t);
      continue;
    }
    const r = reemplazo.get(t.id);
    if (r) salida.push(r);
  }
  return salida;
}
