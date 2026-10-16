/**
 * La capa territorial del selector de ligas: país > REGIÓN > UNIÓN > competición.
 *
 * La región sale de `unions.region_code`, no del texto de `tournaments.region`
 * (sucio: 'Pampeano' y 'Pampeana', Mendoza como 'Sudamérica') ni de un mapa
 * escrito a mano en el frontend. Lo que esta capa sabe es ORDENAR y ROTULAR; qué
 * unión es de qué región es un dato de la base.
 *
 * Función pura, sin DOM: recibe la lista ya agrupada en familias y devuelve los
 * grupos. No decide qué se ve ni cómo: eso es del componente.
 */

/** El orden de las regiones en pantalla, y cómo se leen. */
export const REGIONES = [
  { code: 'nacional', label: 'Nacional' },
  { code: 'amba', label: 'AMBA' },
  { code: 'pampeana', label: 'Pampeana' },
  { code: 'centro', label: 'Centro' },
  { code: 'litoral', label: 'Litoral' },
  { code: 'noa', label: 'NOA' },
  { code: 'nea', label: 'NEA' },
  { code: 'cuyo', label: 'Cuyo' },
  { code: 'patagonia', label: 'Patagonia' },
] as const;

export type CodigoDeRegion = (typeof REGIONES)[number]['code'];

const ETIQUETA_DE_REGION = new Map<string, string>(REGIONES.map((r) => [r.code, r.label]));
const ORDEN_DE_REGION = new Map<string, number>(REGIONES.map((r, i) => [r.code, i]));

export const REGION_SIN_DATO = 'otras';

/** Lo que devuelve `/api/public/unions`. */
export interface UnionConRegion {
  id: string;
  name: string;
  region_code: string | null;
}

export interface GrupoDeUnion<T> {
  /** El bloque "Regionales" de la región: repite los torneos regionales de sus uniones. */
  regionales?: boolean;
  unionId: string | null;
  unionName: string;
  tournaments: T[];
}

export interface GrupoDeRegion<T> {
  /** `REGION_SIN_DATO` para lo que no tiene unión con región. */
  code: string;
  label: string;
  unions: Array<GrupoDeUnion<T>>;
  total: number;
}

/**
 * Una pantalla del segundo nivel del selector: una unión (o una confederación) con
 * sus competiciones. `eyebrow` es la región, que se lee como título de sección
 * sobre las uniones que la comparten.
 */
/** Un tramo de una lista con título: Competiciones, Reserva o Juveniles. */
export interface GrupoDeTipo<T> {
  key: string;
  title: string;
  tournaments: T[];
}

export interface SeccionDeLista<T> {
  key: string;
  /** `regionales`: el bloque de los regionales de una región, que repite torneos de sus uniones. */
  kind?: 'union' | 'regionales';
  /** La lista de la sección partida en Competiciones / Reserva / Juveniles. */
  groups?: Array<GrupoDeTipo<T>>;
  /** La unión de la sección (null en las competiciones sin unión o en las confederaciones). */
  unionId?: string | null;
  title: string;
  eyebrow: string | null;
  tournaments: T[];
}

/**
 * Aplana los grupos de `agruparPorRegion` en la lista de secciones que dibuja el
 * navegador por niveles. El orden es el de los grupos: región, y adentro la unión
 * con más competiciones primero.
 */
export function seccionesDeRegion<T>(grupos: Array<GrupoDeRegion<T>>): Array<SeccionDeLista<T>> {
  return grupos.flatMap((region) =>
    region.unions.map((union) => ({
      key: `${region.code}:${union.regionales ? 'regionales' : (union.unionId ?? 'sin-union')}`,
      kind: union.regionales ? 'regionales' as const : 'union' as const,
      unionId: union.unionId,
      title: union.unionName,
      eyebrow: region.label,
      tournaments: union.tournaments,
    })),
  );
}

export function etiquetaDeRegion(code: string): string {
  return ETIQUETA_DE_REGION.get(code) ?? 'Otras competiciones';
}

/**
 * Agrupa por región y, adentro, por unión.
 *
 * Devuelve `null` cuando agrupar no aporta: si todo cae en una sola región (o en
 * ninguna) el selector se queda con la lista plana. Un país con dos torneos de
 * una misma unión no necesita un nivel de región, y mostrarlo sería estructura
 * artificial.
 *
 * Los torneos cuya unión no tiene región cargada van juntos al final, en
 * "Otras competiciones": no se esconden ni se adivinan.
 *
 * El orden de los torneos adentro de cada unión es el de entrada: el que llama ya
 * los ordenó por prioridad y favoritos.
 */
export function agruparPorRegion<T extends { unionId?: string | null; scope?: string | null }>(
  lista: T[],
  uniones: UnionConRegion[],
): Array<GrupoDeRegion<T>> | null {
  if (lista.length === 0 || uniones.length === 0) return null;

  const porId = new Map(uniones.map((u) => [u.id, u]));
  const regiones = new Map<string, Map<string, GrupoDeUnion<T>>>();
  const regionales = new Map<string, T[]>();

  for (const t of lista) {
    const union = t.unionId ? porId.get(t.unionId) : undefined;
    const region = union?.region_code && ORDEN_DE_REGION.has(union.region_code) ? union.region_code : REGION_SIN_DATO;
    const claveUnion = union && region !== REGION_SIN_DATO ? union.id : '__sin_union__';

    let deLaRegion = regiones.get(region);
    if (!deLaRegion) {
      deLaRegion = new Map();
      regiones.set(region, deLaRegion);
    }
    let grupo = deLaRegion.get(claveUnion);
    if (!grupo) {
      grupo = {
        unionId: claveUnion === '__sin_union__' ? null : claveUnion,
        unionName: claveUnion === '__sin_union__' ? 'Otras competiciones' : (union as UnionConRegion).name,
        tournaments: [],
      };
      deLaRegion.set(claveUnion, grupo);
    }
    grupo.tournaments.push(t);
    // Un regional se ve en su unión Y en el bloque de regionales de su región.
    if (t.scope === 'regional' && region !== REGION_SIN_DATO) {
      regionales.set(region, [...(regionales.get(region) ?? []), t]);
    }
  }

  const conRegion = [...regiones.keys()].filter((r) => r !== REGION_SIN_DATO);
  if (conRegion.length < 2) return null;

  return [...regiones.entries()]
    .sort(([a], [b]) => (ORDEN_DE_REGION.get(a) ?? 999) - (ORDEN_DE_REGION.get(b) ?? 999))
    .map(([code, deLaRegion]) => {
      const groups = [...deLaRegion.values()].sort((a, b) => {
        // Las competiciones sin unión, siempre al final de su región.
        if ((a.unionId === null) !== (b.unionId === null)) return a.unionId === null ? 1 : -1;
        // La unión con más competiciones primero: es la que se busca.
        return b.tournaments.length - a.tournaments.length || a.unionName.localeCompare(b.unionName, 'es');
      });
      const total = groups.reduce((n, g) => n + g.tournaments.length, 0);
      const delRegion = regionales.get(code);
      if (delRegion?.length) {
        groups.unshift({
          regionales: true,
          unionId: null,
          unionName: `Regionales · ${etiquetaDeRegion(code)}`,
          tournaments: delRegion,
        });
      }
      return { code, label: etiquetaDeRegion(code), unions: groups, total };
    });
}
