/**
 * Canon del alta de las competiciones nacionales de la CBRu 2026 que se
 * sincronizan desde SporTI. Lo leen `scripts/sporti/escudos.mjs` y
 * `scripts/sporti/alta.mts`.
 *
 * Los ids de campeonato y de fase y los slugs de equipo salen de SporTI
 * (medidos el 2026-10-02 en las vistas de cada fase). SporTI usa el mismo slug
 * para la primera y el femenino de un club (Charrua juega el Super 12 y la
 * Copa do Brasil Femenina como `charrua-rugby-clube`): por eso `EQUIPOS` va por
 * rama, y cada equipo es su propia ficha (convención de la casa: `-femenino`).
 *
 * Afuera a propósito, por ahora: el Brasil Sevens (es otra modalidad y otro
 * formato de fixture), las Copas do Brasil sub 19 (sin fases publicadas) y los
 * campeonatos de las federaciones estaduales (otro `idLiga` de la misma API:
 * sumarlos es agregar torneos acá).
 *
 * Nombres: el de la tarjeta de SporTI ("FARRAPOS", "POLI") sin la forma legal;
 * ciudad y estado solo donde están en el nombre o en la cancha de local, el
 * resto queda en null antes que inventarlo.
 */

export const ANO = 2026;
export const TEMPORADA_CODIGO = '2026';
export const TEMPORADA_NOMBRE = '2026';
export const UNION_CBRU = 'confederacion-brasilera-de-rugby';
export const ORIGEN = 'sporti-alta';

/** El escudo de SporTI: PNG con transparencia. */
export const ESCUDO_SPORTI = (slug) => `https://painel.sporti.com.br//UserImages/equipes/${slug}/1.png`;

/**
 * Torneos. `fases[].fase` es el id de fase de SporTI (el número de
 * `1367-3`). `tipo`:
 *   grupos  fase de grupos con tabla oficial; la ronda es el fin de semana
 *   liga    todos contra todos sin tabla publicada (la arma el motor); la ronda es la columna "Rodada N"
 *   llave   eliminación; la ronda es la columna ("SEMI FINAL", "FINAL")
 */
export const TORNEOS = [
  {
    campeonato: '3542', slug: 'br-super-12-primeira', nombre: 'Super 12 – Primeira Divisão',
    categoria: 'Super 12', genero: 'masculino', edad: 'mayores', rama: 'masculino',
    fases: [
      { fase: '1367', nombre: 'Fase de Grupos', tipo: 'grupos', activa: false },
      { fase: '1365', nombre: 'Hexagonal', tipo: 'liga', activa: true },
      // La final todavía no tiene equipos: la vista vuelve sin tarjetas.
      { fase: '1606', nombre: 'Final', tipo: 'llave', activa: false, puedeEstarVacia: true },
    ],
  },
  {
    campeonato: '3543', slug: 'br-super-12-segunda', nombre: 'Super 12 – Segunda Divisão',
    categoria: 'Super 12', genero: 'masculino', edad: 'mayores', rama: 'masculino',
    fases: [{ fase: '1368', nombre: 'Fase de Grupos', tipo: 'grupos', activa: true }],
  },
  {
    campeonato: '3544', slug: 'br-super-12-repescagem', nombre: 'Super 12 – Repescagem',
    categoria: 'Super 12', genero: 'masculino', edad: 'mayores', rama: 'masculino',
    fases: [{ fase: '1597', nombre: 'Fase de Grupos', tipo: 'grupos', activa: true }],
  },
  {
    campeonato: '3545', slug: 'br-copa-do-brasil', nombre: 'Copa do Brasil de Rugby',
    categoria: 'Copa do Brasil', genero: 'masculino', edad: 'mayores', rama: 'masculino',
    fases: [{ fase: '1571', nombre: 'Playoffs', tipo: 'llave', activa: true }],
  },
  {
    campeonato: '3546', slug: 'br-copa-do-brasil-feminina', nombre: 'Copa do Brasil Feminina de Rugby',
    categoria: 'Femenino', genero: 'femenino', edad: 'mayores', rama: 'feminino',
    fases: [{ fase: '1674', nombre: 'Playoffs', tipo: 'llave', activa: true }],
  },
];

/**
 * Clubes nuevos. `escudo` es el slug de SporTI del que se baja; `escudoDe` =
 * comparte el archivo de otro club (el femenino de un club masculino).
 */
export const CLUBES = [
  // ── Super 12 · Primeira ─────────────────────────────────────────────────────
  { id: 'farrapos-rugby', name: 'Farrapos', city: 'Bento Gonçalves', region: 'Rio Grande do Sul', escudo: 'farrapos-rugby-clube' },
  { id: 'charrua-rugby-clube', name: 'Charrua', city: null, region: 'Rio Grande do Sul', escudo: 'charrua-rugby-clube' },
  { id: 'desterro-rugby-clube', name: 'Desterro', city: 'Florianópolis', region: 'Santa Catarina', escudo: 'desterro-rugby-clube' },
  { id: 'joaca-rugby-clube', name: 'Joaca', city: null, region: null, escudo: 'joaca-rugby-clube' },
  { id: 'poli-rugby', name: 'Poli', city: 'São Paulo', region: 'São Paulo', escudo: 'associacao-esportiva-politecnica-de-rugby' },
  { id: 'sao-jose-rugby', name: 'São José', city: 'São José dos Campos', region: 'São Paulo', escudo: 'associacao-esportiva-rugby-clube-(sao-jose-rugby)' },
  { id: 'tornados-indaiatuba', name: 'Tornados Indaiatuba', city: 'Indaiatuba', region: 'São Paulo', escudo: 'indaiatuba-rugby-clube' },
  { id: 'rio-branco-rugby-clube', name: 'Rio Branco', city: 'São Paulo', region: 'São Paulo', escudo: 'rio-branco-rugby-clube' },
  { id: 'jacarei-rugby', name: 'Jacareí', city: 'Jacareí', region: 'São Paulo', escudo: 'associacao-esportiva-jacarei-rugby-1' },
  { id: 'sao-paulo-athletic-club', name: 'SPAC', city: 'São Paulo', region: 'São Paulo', escudo: 'sao-paulo-athletic-club' },
  { id: 'pasteur-athletique-club', name: 'Pasteur', city: 'São Paulo', region: 'São Paulo', escudo: 'pasteur-athletique-club' },
  { id: 'nova-lima-rugby', name: 'Nova Lima', city: 'Nova Lima', region: 'Minas Gerais', escudo: 'nova-lima-rugby3' },

  // ── Super 12 · Segunda ──────────────────────────────────────────────────────
  { id: 'brummers-rugby', name: 'Brummers', city: null, region: null, escudo: 'brummers-rugby-clube2' },
  { id: 'serra-gaucha-rugby', name: 'Serra Gaúcha', city: null, region: 'Rio Grande do Sul', escudo: 'serra-gaucha-rugby-clube' },
  // El slug dice "Tauras Carancho" y la tarjeta "COLONOS": manda la tarjeta.
  { id: 'colonos-rugby', name: 'Colonos', city: null, region: null, escudo: 'uniao-de-rugby-tauras-carancho' },
  { id: 'pe-vermelho-rugby', name: 'Pé Vermelho', city: null, region: null, escudo: 'pe-vermelho-rugby-clube' },
  // El slug es el de Mackenzie; la tarjeta y la tabla dicen "LEÕES DE PARAISÓPOLIS".
  { id: 'leoes-de-paraisopolis', name: 'Leões de Paraisópolis', city: 'São Paulo', region: 'São Paulo', escudo: 'associacao-esportiva-engenharia-mackenzie' },
  { id: 'iguanas-rugby-sjc', name: 'Iguanas SJC', city: 'São José dos Campos', region: 'São Paulo', escudo: 'iguanas-rugby3' },
  { id: 'joinville-rugby-clube', name: 'Joinville', city: 'Joinville', region: 'Santa Catarina', escudo: 'joinville-rugby-clube2' },
  { id: 'niteroi-rugby', name: 'Niterói', city: 'Niterói', region: 'Rio de Janeiro', escudo: 'niteroi-rugby-football-clube' },
  { id: 'rio-rugby', name: 'Rio Rugby', city: 'Rio de Janeiro', region: 'Rio de Janeiro', escudo: 'rio-rugby-football-club' },
  { id: 'carioca-rugby', name: 'Carioca', city: 'Rio de Janeiro', region: 'Rio de Janeiro', escudo: 'carioca-rugby-football-club' },
  { id: 'urutu-rugby', name: 'Urutu', city: null, region: null, escudo: 'urutu-rugby-clube' },
  { id: 'vitoria-rugby', name: 'Vitória', city: 'Vitória', region: 'Espírito Santo', escudo: 'vitoria-rugby-club3' },

  // ── Copa do Brasil ──────────────────────────────────────────────────────────
  { id: 'siara-rugby', name: 'Siará Rugby', city: null, region: 'Ceará', escudo: 'ceara-rugby3' },
  { id: 'porto-seguro-rugby', name: 'Porto Seguro', city: 'Porto Seguro', region: 'Bahia', escudo: 'porto-seguro-rugby-clube' },
  { id: 'rugby-sem-fronteiras', name: 'Rugby Sem Fronteiras', city: null, region: null, escudo: 'rugby-sem-fronteiras' },
  { id: 'uniao-pernambucana-de-rugby', name: 'União Pernambucana', city: null, region: 'Pernambuco', escudo: 'uniao-pernambucana-de-rugby' },

  // ── Copa do Brasil Feminina ─────────────────────────────────────────────────
  { id: 'charrua-rugby-clube-femenino', name: 'Charrua Femenino', padre: 'charrua-rugby-clube', escudoDe: 'charrua-rugby-clube' },
  // Solo el equipo femenino compite en la CBRu: la ficha femenina lleva el escudo.
  { id: 'jacroi-femenino', name: 'Jacroí Femenino', city: null, region: null, escudo: 'jacroi' },
  { id: 'melina-rugby-femenino', name: 'Melina Femenino', city: null, region: null, escudo: 'melina-rugby-clube' },
  { id: 'poli-usp-femenino', name: 'Poli-USP Femenino', city: 'São Paulo', region: 'São Paulo', escudo: 'poli-usp' },
];

/** Slug de SporTI → club, por rama. Medido en las vistas de cada fase el 2026-10-02. */
export const EQUIPOS = {
  masculino: {
    'farrapos-rugby-clube': 'farrapos-rugby',
    'charrua-rugby-clube': 'charrua-rugby-clube',
    'desterro-rugby-clube': 'desterro-rugby-clube',
    'joaca-rugby-clube': 'joaca-rugby-clube',
    'associacao-esportiva-politecnica-de-rugby': 'poli-rugby',
    'associacao-esportiva-rugby-clube-(sao-jose-rugby)': 'sao-jose-rugby',
    'indaiatuba-rugby-clube': 'tornados-indaiatuba',
    'rio-branco-rugby-clube': 'rio-branco-rugby-clube',
    'associacao-esportiva-jacarei-rugby-1': 'jacarei-rugby',
    'sao-paulo-athletic-club': 'sao-paulo-athletic-club',
    'pasteur-athletique-club': 'pasteur-athletique-club',
    'nova-lima-rugby3': 'nova-lima-rugby',
    'brummers-rugby-clube2': 'brummers-rugby',
    'serra-gaucha-rugby-clube': 'serra-gaucha-rugby',
    'uniao-de-rugby-tauras-carancho': 'colonos-rugby',
    'pe-vermelho-rugby-clube': 'pe-vermelho-rugby',
    'associacao-esportiva-engenharia-mackenzie': 'leoes-de-paraisopolis',
    'iguanas-rugby3': 'iguanas-rugby-sjc',
    'joinville-rugby-clube2': 'joinville-rugby-clube',
    'niteroi-rugby-football-clube': 'niteroi-rugby',
    'rio-rugby-football-club': 'rio-rugby',
    'carioca-rugby-football-club': 'carioca-rugby',
    'urutu-rugby-clube': 'urutu-rugby',
    'vitoria-rugby-club3': 'vitoria-rugby',
    'ceara-rugby3': 'siara-rugby',
    'porto-seguro-rugby-clube': 'porto-seguro-rugby',
    'rugby-sem-fronteiras': 'rugby-sem-fronteiras',
    'uniao-pernambucana-de-rugby': 'uniao-pernambucana-de-rugby',
  },
  feminino: {
    'charrua-rugby-clube': 'charrua-rugby-clube-femenino',
    jacroi: 'jacroi-femenino',
    'melina-rugby-clube': 'melina-rugby-femenino',
    'poli-usp': 'poli-usp-femenino',
  },
};

export const PUNTOS = { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1 };

export const TIEBREAKERS = [
  { metric: 'points', label: 'Puntos obtenidos', priority: 1, enabled: true },
  { metric: 'head_to_head', label: 'Resultado entre sí', priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'tries_for', label: 'Tries a favor', priority: 4, enabled: true },
  { metric: 'won', label: 'Partidos ganados', priority: 5, enabled: true },
];

/**
 * Las TRES formas del puntaje (canónica del gestor, legacy del motor y
 * `standings` del reglamento), como en el resto de los seeds. El bonus lo
 * calcula el CONECTOR (los partidos van con `points_autocalculated: false`):
 * el `offensive` de acá es el rótulo, el motor no lo aplica.
 */
export const RULESET = {
  pointsWin: PUNTOS.win,
  pointsDraw: PUNTOS.draw,
  pointsLoss: PUNTOS.loss,
  pointsBonusTry: PUNTOS.bonusTry,
  pointsBonusLoss: PUNTOS.bonusLoss,
  points: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
  pointsSystem: { ...PUNTOS, allowBonusPoints: true },
  bonus: {
    offensive: { tries: 4, points: PUNTOS.bonusTry },
    defensive: { margin: 7, points: PUNTOS.bonusLoss },
  },
  standings: {
    points_base: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
    bonus_rules: [
      { id: 'try_bonus', label: '4 tries o más', points_awarded: PUNTOS.bonusTry },
      { id: 'close_loss', label: 'Derrota por 7 o menos', points_awarded: PUNTOS.bonusLoss },
    ],
  },
  competition: { format_type: 'league', parameters: { season_model: 'season' } },
  tiebreakers: TIEBREAKERS,
  organizers: [{ name: 'CBRu', union_id: UNION_CBRU, is_primary: true }],
};
