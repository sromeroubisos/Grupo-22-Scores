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
  { code: 'internacional', label: 'Internacional' },
  { code: 'nacional', label: 'Nacional' },
  { code: 'amba', label: 'Buenos Aires' },
  { code: 'centro', label: 'Centro' },
  { code: 'litoral', label: 'Litoral' },
  { code: 'noa', label: 'NOA' },
  { code: 'cuyo', label: 'Oeste' },
  { code: 'nea', label: 'NEA' },
  { code: 'pampeana', label: 'Pampeana' },
  { code: 'patagonia', label: 'Patagonia' },
] as const;

/**
 * El orden de las uniones adentro de su región, de la que organiza el regional a
 * las demás. Las que no figuran van después, por cantidad de competiciones.
 */
const ORDEN_DE_UNION = new Map<string, number>(
  [
    'urba',
    '0c515ac1-af49-4699-b3c5-7273bc424357', 'union-andina-de-rugby',
    'a37639f8-197c-44c6-a095-2f16f40d7b04', 'union-santafesina-de-rugby', 'union-entrerriana-de-rugby',
    'e558d0d9-c01b-40ce-a1c7-e533cb81f97c', '4263f793-04d6-4dd9-9b43-b7e9823bf721', 'union-santiaguena-de-rugby',
    '40159cd1-5876-4720-b953-d639b09d5f5b', '765e6c46-b1c1-4e44-8490-aa0085ebeb99',
    'urne', 'union-de-rugby-de-misiones', 'union-de-rugby-de-formosa',
    'union-de-rugby-de-mar-del-plata', 'union-de-rugby-del-sur', 'uroba',
    'union-de-rugby-de-alto-valle', 'union-de-rugby-de-tierra-del-fuego', 'union-austral', 'union-de-rugby-del-valle-del-chubut',
  ].map((id, i) => [id, i]),
);

export type CodigoDeRegion = (typeof REGIONES)[number]['code'];

const ETIQUETA_DE_REGION = new Map<string, string>(REGIONES.map((r) => [r.code, r.label]));
const ORDEN_DE_REGION = new Map<string, number>(REGIONES.map((r, i) => [r.code, i]));

export const REGION_SIN_DATO = 'otras';

/**
 * Regiones cuyos regionales los juegan TODAS sus uniones, no solo la que los
 * organiza: el Regional Patagónico es de Alto Valle, Austral, Chubut y Tierra del
 * Fuego a la vez. En estas regiones el regional se repite en cada unión.
 */
const REGIONES_CON_REGIONAL_COMPARTIDO = new Set(['patagonia']);

const URR = 'a37639f8-197c-44c6-a095-2f16f40d7b04';
const SANTAFESINA = 'union-santafesina-de-rugby';
const ENTRERRIANA = 'union-entrerriana-de-rugby';
const SALTA = '4263f793-04d6-4dd9-9b43-b7e9823bf721';

/**
 * Torneos que juegan varias uniones: además de su unión de carga se ven en las
 * otras que participan. Quien es de Rosario busca la Copa Santa Fe en Rosario, no
 * en la Santafesina. Si el torneo es `regional` también está en el bloque de
 * regionales de su región, que es donde se lo busca primero.
 */
const UNIONES_PARTICIPANTES: Record<string, string[]> = {
  // Litoral
  '8106fbcf-b9a7-4763-8a7f-3938c8668bf8': [URR, SANTAFESINA], // Copa Santa Fe
  'b1ba2ecc-06e3-400f-9a45-1385321aad46': [SANTAFESINA, ENTRERRIANA], // Regional del Litoral A
  'b28a55ac-b372-4b89-ba81-ee43232abffb': [SANTAFESINA, ENTRERRIANA], // Regional del Litoral B
  'a3462406-498c-426f-8db8-cb0ce30e5580': [ENTRERRIANA], // Dos Orillas M15
  '0a683798-55fd-45ec-9ab4-212d2fcdc22b': [ENTRERRIANA], // Dos Orillas M16
  'b0d18b4a-a069-4c3c-b91f-365f4e995f3f': [ENTRERRIANA], // Dos Orillas M17
  '0ffa0c26-f0cb-4c71-a021-d685bdc0bfc6': [ENTRERRIANA], // Dos Orillas M19
  // Centro
  '55f28144-3d92-484b-a57d-646e06740808': ['union-andina-de-rugby'], // Top 10 del Centro
  'bcfca672-1c00-4f62-833d-cc053786ad12': ['union-andina-de-rugby'], // Regional Centro A
  '4b04d1e6-a9a7-47ea-810e-9c6bede377aa': ['union-andina-de-rugby'], // Regional Centro B
  '28852f5e-ad5e-4ba7-a897-1f51dfd7a9e4': ['union-andina-de-rugby'], // Regional Centro B Intermedia
  // NOA
  'a4a4d389-5eaa-4e16-9024-81c54abe64cc': [SALTA, 'union-santiaguena-de-rugby'], // Regional NOA A
  '10d55b58-8183-476e-9165-54c1c3b00490': [SALTA, 'union-santiaguena-de-rugby'],
  '3a335922-dc88-42a8-84d3-c38b57b46bca': [SALTA, 'union-santiaguena-de-rugby'], // Regional NOA B
  '60d3d1f5-665e-4715-b169-042de0079386': [SALTA, 'union-santiaguena-de-rugby'],
  'dfccbabc-52aa-4e09-b714-6095a980824e': [SALTA, 'union-santiaguena-de-rugby'], // Regional NOA C
  '563bd4b4-6011-4f23-9d96-f6222e9e3e84': [SALTA, 'union-santiaguena-de-rugby'],
  'fa737808-79e1-4667-90e4-65972051902f': ['union-santiaguena-de-rugby'], // Liga Norte Grande (Salta + Santiago)
  // Oeste
  '166c2906-4a73-4354-a8c4-c64342ed875d': ['765e6c46-b1c1-4e44-8490-aa0085ebeb99'], // Copa Oro del Oeste
  '8e21ce2b-459c-40f5-8012-d0968d6a4d95': ['765e6c46-b1c1-4e44-8490-aa0085ebeb99'], // Copa Plata del Oeste
  '3dcf9e78-d180-43c2-a6cc-d4b55f36cd32': ['765e6c46-b1c1-4e44-8490-aa0085ebeb99'], // Copa Bronce del Oeste
  // NEA
  'b0562cf3-4ea1-463e-86cb-86988dc22f10': ['union-de-rugby-de-misiones', 'union-de-rugby-de-formosa'], // Regional NEA
  'c1e37680-3f1e-482a-8dc6-c14f4ba417c7': ['union-de-rugby-de-misiones', 'union-de-rugby-de-formosa'], // NEA Ascenso
  // Pampeana
  '594fcb55-b052-4a8f-bf24-5a288e35e4f5': ['union-de-rugby-del-sur', 'uroba'], // Regional Pampeano
  'e5e2dd0f-10a4-4073-8885-b98b3767eca6': ['union-de-rugby-del-sur', 'uroba'], // Regional Pampeano B
  'ee59eaf4-ce63-4691-b911-b593065490fb': ['union-de-rugby-del-sur', 'uroba'], // Reclasificatorio A-B
  // Patagonia
  '4e0fb15f-89a2-425f-8830-43eeef981860': ['union-de-rugby-del-valle-del-chubut'], // Torneo Austral
  '46313785-4686-4e69-b1de-d664527c143c': ['union-de-rugby-de-alto-valle'], // Norpatagónico (URS + Alto Valle)
};

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
export function agruparPorRegion<T extends { id?: string; unionId?: string | null; scope?: string | null }>(
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

  // El regional compartido se ve también en las demás uniones de su región. No
  // entra en el total de la región: es el mismo torneo, no uno más.
  const repetidos = new Map<string, number>();

  // Los torneos conjuntos se repiten en cada unión que participa. El torneo es el
  // mismo objeto: no suma al total de la región.
  for (const t of lista) {
    const otras = t.id ? UNIONES_PARTICIPANTES[t.id] : undefined;
    if (!otras) continue;
    for (const unionId of otras) {
      const u = porId.get(unionId);
      if (!u?.region_code || !ORDEN_DE_REGION.has(u.region_code)) continue;
      let deLaRegion = regiones.get(u.region_code);
      if (!deLaRegion) {
        deLaRegion = new Map();
        regiones.set(u.region_code, deLaRegion);
      }
      let grupo = deLaRegion.get(u.id);
      if (!grupo) {
        grupo = { unionId: u.id, unionName: u.name, tournaments: [] };
        deLaRegion.set(u.id, grupo);
      }
      if (grupo.tournaments.includes(t)) continue;
      grupo.tournaments.push(t);
      repetidos.set(u.region_code, (repetidos.get(u.region_code) ?? 0) + 1);
    }
  }

  for (const [region, deLaRegion] of regiones) {
    if (!REGIONES_CON_REGIONAL_COMPARTIDO.has(region)) continue;
    const compartidos = regionales.get(region) ?? [];
    if (compartidos.length === 0) continue;
    const hermanas = uniones
      .filter((u) => u.region_code === region)
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const u of hermanas) {
      let grupo = deLaRegion.get(u.id);
      if (!grupo) {
        grupo = { unionId: u.id, unionName: u.name, tournaments: [] };
        deLaRegion.set(u.id, grupo);
      }
      const nuevos = compartidos.filter((t) => !grupo!.tournaments.includes(t));
      grupo.tournaments.push(...nuevos);
      repetidos.set(region, (repetidos.get(region) ?? 0) + nuevos.length);
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
        const oa = ORDEN_DE_UNION.get(a.unionId ?? '') ?? 999;
        const ob = ORDEN_DE_UNION.get(b.unionId ?? '') ?? 999;
        if (oa !== ob) return oa - ob;
        // Las demás: la unión con más competiciones primero, que es la que se busca.
        return b.tournaments.length - a.tournaments.length || a.unionName.localeCompare(b.unionName, 'es');
      });
      const total = groups.reduce((n, g) => n + g.tournaments.length, 0) - (repetidos.get(code) ?? 0);
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
