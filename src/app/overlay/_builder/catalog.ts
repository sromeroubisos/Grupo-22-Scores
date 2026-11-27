/**
 * Los gráficos que ofrece el generador, cómo se agrupan en la galería y qué
 * URL de muestra dibuja cada tarjeta. Es la única lista: la galería, el editor
 * y la vista previa leen de acá.
 */
import { canUseStyle, type OverlayPlan } from '@/lib/overlay/overlayPlan';

export type Kind =
  | 'partido' | 'marcador' | 'barra' | 'franja' | 'compacto' | 'bloques' | 'escudos' | 'tira' | 'formacion'
  | 'cuadro' | 'paneles' | 'presentacion' | 'pestana' | 'medallon' | 'capsula' | 'flotante'
  | 'linea' | 'pisos' | 'caja' | 'sesgado' | 'degrade'
  | 'central' | 'rotulo' | 'tablero' | 'agua' | 'claro' | 'tablilla'
  | 'partidos' | 'fecha' | 'dia' | 'home'
  | 'tabla' | 'goleadores' | 'playoff' | 'jugador' | 'noticia'
  | 'manual-marcador' | 'manual-titular' | 'manual-sponsors';

export interface KindDef {
  id: Kind;
  label: string;
  hint: string;
  /** Muestra para la tarjeta de la galería (siempre en modo prueba). */
  thumb: string;
}

export interface KindGroup {
  id: string;
  label: string;
  description: string;
  kinds: KindDef[];
}

/** El overlay se dibuja para 1920×1080: en la miniatura se agranda para que se lea. */
const scoreboard = (style: string, zoom = 1.9) => `/overlay/partido/demo?estilo=${style}&escala=${zoom}`;

export const KIND_GROUPS: KindGroup[] = [
  {
    id: 'partido',
    label: 'Un partido',
    description: 'Se actualizan solos con el partido de G22: resultado, reloj, tarjetas y anotadores.',
    kinds: [
      { id: 'marcador', label: 'Marcador de esquina', hint: 'Chico, con el reloj. Para todo el partido.', thumb: scoreboard('marcador', 2.9) },
      { id: 'escudos', label: 'Escudos grandes', hint: 'Los escudos a los costados y el resultado al medio.', thumb: scoreboard('escudos', 2) },
      { id: 'franja', label: 'Franja de colores', hint: 'Bloques del color de cada club, reloj al medio.', thumb: scoreboard('franja', 1.9) },
      { id: 'bloques', label: 'Bloques grandes', hint: 'Dos cuadrados con el resultado y el reloj abajo.', thumb: scoreboard('bloques', 2.8) },
      { id: 'medallon', label: 'Medallón', hint: 'Escudos grandes en las puntas y un círculo al medio con el reloj. Debajo, los tries.', thumb: scoreboard('medallon', 1.6) },
      { id: 'capsula', label: 'Cápsula', hint: 'Una píldora larga con los nombres completos y el reloj al medio.', thumb: scoreboard('capsula', 1.25) },
      { id: 'central', label: 'Bloques y reloj central', hint: 'Un bloque del color de cada club y el reloj al medio, con el período abajo.', thumb: scoreboard('central', 1.5) },
      { id: 'rotulo', label: 'Barra negra con pestaña', hint: 'Barra oscura con la sigla chica arriba del resultado y el período en una pestaña.', thumb: scoreboard('rotulo', 1.5) },
      { id: 'tablero', label: 'Tablero', hint: 'Dos bloques de color con resultado grande y el reloj en una columna al medio.', thumb: scoreboard('tablero', 1.5) },
      { id: 'agua', label: 'Marca de agua', hint: 'Píldora con los escudos grandes de fondo, a cada punta.', thumb: scoreboard('agua', 1.5) },
      { id: 'claro', label: 'Claro', hint: 'Paneles blancos con una raya del color del club y el reloj en negro.', thumb: scoreboard('claro', 1.5) },
      { id: 'tablilla', label: 'Tablilla', hint: 'Caja oscura: escudo y resultado de cada club, y el reloj abajo.', thumb: scoreboard('tablilla', 2.4) },
      { id: 'linea', label: 'Línea con datos', hint: 'Barra plana: nombre y resultado de cada club, y el reloj al final.', thumb: scoreboard('linea', 1.2) },
      { id: 'pisos', label: 'Dos pisos', hint: 'Bloques grandes con el escudo saliendo, y abajo el período y el reloj.', thumb: scoreboard('pisos', 1.5) },
      { id: 'caja', label: 'Caja', hint: 'Dos cuadros del color de cada club, con el escudo de marca de agua.', thumb: scoreboard('caja', 2.4) },
      { id: 'sesgado', label: 'Sesgado', hint: 'Bloques inclinados, el reloj en el medio.', thumb: scoreboard('sesgado', 1.7) },
      { id: 'degrade', label: 'Degradé', hint: 'Una barra oscura que toma el color de cada club en las puntas.', thumb: scoreboard('degrade', 1.6) },
      { id: 'flotante', label: 'Flotante', hint: 'Sin fondo: escudos y números grandes sobre la imagen.', thumb: scoreboard('flotante', 2) },
      { id: 'pestana', label: 'Barra con pestaña', hint: 'Siglas y resultado en una barra, el reloj arriba. El logo del medio gira y muestra el +5.', thumb: scoreboard('pestana', 2.2) },
      { id: 'cuadro', label: 'Cuadro con reloj', hint: 'El logo y el reloj a la izquierda, una fila del color de cada club.', thumb: scoreboard('cuadro', 1.6) },
      { id: 'paneles', label: 'Paneles de color', hint: 'Dos paneles grandes con sigla y resultado, el reloj abajo.', thumb: scoreboard('paneles', 1.7) },
      { id: 'presentacion', label: 'Presentación', hint: 'Zócalo a lo ancho con los dos clubes y el torneo. Para la previa.', thumb: scoreboard('presentacion', 0.75) },
      { id: 'barra', label: 'Zócalo', hint: 'Barra ancha con los nombres completos.', thumb: scoreboard('barra', 1.3) },
      { id: 'compacto', label: 'Compacto', hint: 'Una píldora: siglas, resultado y minuto.', thumb: scoreboard('compacto', 3) },
      { id: 'tira', label: 'Tira fina', hint: 'Una línea mínima: siglas, resultado y tiempo.', thumb: scoreboard('tira', 2.1) },
      { id: 'partido', label: 'Tarjeta del partido', hint: 'Escudos, resultado, contexto y anotadores.', thumb: '/overlay/partido/demo?escala=1.5' },
      { id: 'formacion', label: 'Formaciones', hint: 'Los dos planteles, o uno en la cancha.', thumb: '/overlay/formacion/demo?escala=0.85' },
    ],
  },
  {
    id: 'varios',
    label: 'Varios partidos',
    description: 'Listas que rotan solas de a páginas.',
    kinds: [
      { id: 'partidos', label: 'Partidos elegidos', hint: 'Los que elijas, en ese orden.', thumb: '/overlay/partidos?escala=1.2' },
      { id: 'fecha', label: 'Fecha de un torneo', hint: 'Todos los partidos de una fecha.', thumb: '/overlay/fecha?escala=1.2' },
      { id: 'dia', label: 'Partidos del día', hint: 'Lo cargado en G22 un día, por torneo.', thumb: '/overlay/dia?escala=1.2' },
      { id: 'home', label: 'Todos los deportes', hint: 'La home de G22, con partidos externos.', thumb: '/overlay/home?escala=1.2' },
    ],
  },
  {
    id: 'torneo',
    label: 'Torneo y jugadores',
    description: 'Tablas, rankings y llaves de un torneo.',
    kinds: [
      { id: 'tabla', label: 'Tabla de posiciones', hint: 'Por fase y por zona.', thumb: '/overlay/tabla?escala=1.1' },
      { id: 'goleadores', label: 'Goleadores y tryman', hint: 'Puntos, tries, goles o tarjetas.', thumb: '/overlay/goleadores?escala=1.2' },
      { id: 'playoff', label: 'Playoff', hint: 'El cuadro como llave o en columnas.', thumb: '/overlay/playoff?escala=1.6' },
      { id: 'jugador', label: 'Jugador', hint: 'Ficha con sus números.', thumb: '/overlay/jugador?escala=1.2' },
    ],
  },
  {
    id: 'manual',
    label: 'Manuales y noticias',
    description: 'Los manejás vos desde el celular, sin cargar nada en G22.',
    kinds: [
      { id: 'manual-marcador', label: 'Marcador manual', hint: 'Elegís los equipos y sumás puntos desde un panel.', thumb: scoreboard('marcador', 2.9) },
      { id: 'manual-sponsors', label: 'Sponsors', hint: 'Subís los PNG en cuatro niveles; los tamaños se acomodan solos.', thumb: '/overlay/manual/demo-sponsors?escala=1.15' },
      { id: 'manual-titular', label: 'Titular de noticiero', hint: 'Zócalo abajo con varios títulos que rotan.', thumb: '/overlay/manual/demo' },
      { id: 'noticia', label: 'Noticia de G22', hint: 'Una nota publicada, con su foto.', thumb: '/overlay/noticia?escala=1.5' },
    ],
  },
];

export const KIND_DEFS: Map<Kind, KindDef & { group: KindGroup }> = new Map(
  KIND_GROUPS.flatMap((group) => group.kinds.map((kind) => [kind.id, { ...kind, group }] as const)),
);

/** Los estilos de marcador de un partido, en el orden en que se ofrecen. */
export const SCOREBOARD_STYLES: Array<{ id: Kind; label: string }> = [
  { id: 'marcador', label: 'Esquina' },
  { id: 'escudos', label: 'Escudos' },
  { id: 'franja', label: 'Franja' },
  { id: 'bloques', label: 'Bloques' },
  { id: 'medallon', label: 'Medallón' },
  { id: 'capsula', label: 'Cápsula' },
  { id: 'flotante', label: 'Flotante' },
  { id: 'central', label: 'Central' },
  { id: 'rotulo', label: 'Rótulo' },
  { id: 'tablero', label: 'Tablero' },
  { id: 'agua', label: 'Marca de agua' },
  { id: 'claro', label: 'Claro' },
  { id: 'tablilla', label: 'Tablilla' },
  { id: 'linea', label: 'Línea' },
  { id: 'pisos', label: 'Dos pisos' },
  { id: 'caja', label: 'Caja' },
  { id: 'sesgado', label: 'Sesgado' },
  { id: 'degrade', label: 'Degradé' },
  { id: 'pestana', label: 'Pestaña' },
  { id: 'cuadro', label: 'Cuadro' },
  { id: 'paneles', label: 'Paneles' },
  { id: 'presentacion', label: 'Presentación' },
  { id: 'barra', label: 'Zócalo' },
  { id: 'compacto', label: 'Compacto' },
  { id: 'tira', label: 'Tira' },
  { id: 'partido', label: 'Tarjeta' },
];

const SCOREBOARD_KINDS = new Set<Kind>(['marcador', 'barra', 'franja', 'compacto', 'bloques', 'escudos', 'tira', 'cuadro', 'paneles', 'presentacion', 'pestana', 'medallon', 'capsula', 'flotante', 'linea', 'pisos', 'caja', 'sesgado', 'degrade', 'central', 'rotulo', 'tablero', 'agua', 'claro', 'tablilla']);

export const isScoreboardStyle = (kind: Kind) => SCOREBOARD_KINDS.has(kind) || kind === 'partido';
export const isMatchKind = (kind: Kind) => isScoreboardStyle(kind) || kind === 'formacion';
export const isManual = (kind: Kind) => kind === 'manual-marcador' || kind === 'manual-titular' || kind === 'manual-sponsors';
/** Las versiones que dibujan un marcador (con reloj, tarjetas, colores de club). */
export const hasScoreboard = (kind: Kind) => isScoreboardStyle(kind) || kind === 'manual-marcador';
export const needsTournament = (kind: Kind) => kind === 'fecha' || kind === 'playoff' || kind === 'tabla' || kind === 'goleadores';
export const isList = (kind: Kind) => ['partidos', 'fecha', 'dia', 'home', 'tabla', 'goleadores'].includes(kind);

export const DEFAULT_ROWS: Partial<Record<Kind, number>> = { partidos: 6, fecha: 7, dia: 7, home: 7, tabla: 10, goleadores: 5 };

/**
 * El plan mínimo para usar un gráfico: los marcadores de la casa y los demás
 * gráficos van con el básico; el resto de los marcadores pide Colores; los
 * sponsors, Premium. Al aire se vuelve a aplicar con el plan del dueño.
 */
export function requiredPlan(kind: Kind): OverlayPlan {
  if (kind === 'manual-sponsors') return 'premium';
  if (isScoreboardStyle(kind) && !canUseStyle('basico', kind === 'partido' ? 'tarjeta' : kind)) return 'colores';
  return 'basico';
}

/** Del link pegado (o el ID suelto) se queda con el último tramo del camino. */
export function idFrom(raw: string): string {
  return raw.trim().replace(/\/+$/, '').split('/').pop()?.split(/[?#]/)[0] ?? '';
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
