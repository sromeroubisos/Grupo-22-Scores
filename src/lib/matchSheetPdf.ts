export interface MatchSheetPdfLineupPlayer {
  number?: string;
  name: string;
  position?: string;
  role?: string;
  isCaptain?: boolean;
  /** N° de documento para la planilla oficial (columna N°Doc). */
  docNumber?: string;
  /** Curso de primeras líneas aprobado: la marca ① de la planilla oficial. */
  frontRow?: boolean;
}

export interface MatchSheetPdfCoach {
  name: string;
  docNumber?: string;
}

export interface MatchSheetPdfTeam {
  name: string;
  shortName: string;
  logoUrl?: string | null;
  score: string;
  points?: string;
  pointsDetail?: string;
  lineup: MatchSheetPdfLineupPlayer[];
  /** Entrenador del club (pie de la planilla oficial). */
  coach?: MatchSheetPdfCoach | null;
}

export interface MatchSheetPdfEvent {
  period: string;
  minute: string;
  summary: string;
  team: string;
  detail: string;
  score?: string;
  /** Lado del evento, para volcarlo en las incidencias de la planilla oficial. */
  side?: 'home' | 'away' | null;
  /** Puntos que sumó el evento (try 5, conversión 2, penal 3). */
  points?: number | null;
  /** Dorsal del jugador del evento, si se pudo casar con la formación. */
  playerNumber?: string | null;
  /** Nombre del jugador del evento (columna Observaciones). */
  playerName?: string | null;
}

export interface MatchSheetPdfStatRow {
  label: string;
  home: number | string;
  away: number | string;
}

export interface MatchSheetPdfStatSection {
  title: string;
  rows: MatchSheetPdfStatRow[];
}

export interface MatchSheetPdfInput {
  title: string;
  status: string;
  statusLabel: string;
  date: string;
  time: string;
  venue: string;
  referee: string;
  roundLabel: string;
  category: string;
  accentColor: string;
  tournament: {
    name: string;
    logoUrl?: string | null;
  };
  home: MatchSheetPdfTeam;
  away: MatchSheetPdfTeam;
  timeline: MatchSheetPdfEvent[];
  statSections: MatchSheetPdfStatSection[];
  notes?: string;
  /**
   * Si viene, el PDF abre con las planillas oficiales (formato UAR): una
   * página para el equipo LOCAL y otra para el VISITANTE, con dorsal, marca ①
   * de primeras líneas, documento, firmas e incidencias para completar a mano.
   */
  officialSheet?: {
    /** N° de partido en el sistema de la unión (BD UAR). Opcional. */
    number?: string | null;
    /** Instancia del torneo (ej: "Fase Clasificación"). Opcional. */
    instance?: string | null;
  };
}

const ROLE_LABELS: Record<string, string> = {
  starter: 'Titular',
  substitute: 'Suplente',
  reserve: 'Reserva',
};

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function safeAccentColor(value: string | null | undefined) {
  const color = String(value || '').trim();
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : '#2563eb';
}

function normalizeMatchStatus(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function isFinalStatus(value: unknown) {
  const status = normalizeMatchStatus(value);
  return ['final', 'finished', 'completed', 'scored', 'ft'].includes(status)
    || status.includes('finalizado');
}

function isScheduledStatus(value: unknown) {
  const status = normalizeMatchStatus(value);
  return ['scheduled', 'programado', 'fixture', 'pending'].includes(status);
}

function resolveAssetUrl(value: string | null | undefined, origin: string) {
  const src = String(value || '').trim();
  if (!src) return '';
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  try {
    return new URL(src, origin).toString();
  } catch {
    return '';
  }
}

function initialsFor(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || 'G22';
}

function renderLogo(url: string | null | undefined, label: string, origin: string, sizeClass = '') {
  const resolved = resolveAssetUrl(url, origin);
  if (resolved) {
    return `<span class="logoBox ${sizeClass}"><img src="${escapeHtml(resolved)}" alt="${escapeHtml(label)}" /></span>`;
  }

  return `<span class="logoBox logoFallback ${sizeClass}">${escapeHtml(initialsFor(label))}</span>`;
}

function renderLineupTable(team: MatchSheetPdfTeam) {
  const players = team.lineup.filter((player) => player.name.trim());
  if (players.length === 0) {
    return '<p class="emptyText">Sin jugadores cargados.</p>';
  }

  const rows = players.map((player, index) => {
    const role = ROLE_LABELS[String(player.role || '').trim()] || player.role || '-';
    const number = String(player.number || '').trim() || String(index + 1).padStart(2, '0');
    const captain = player.isCaptain ? '<span class="captainTag">Capitan</span>' : '';

    return `
      <tr>
        <td class="numCell">${escapeHtml(number)}</td>
        <td>
          <strong>${escapeHtml(player.name)}</strong>
          ${captain}
        </td>
        <td>${escapeHtml(player.position || '-')}</td>
        <td>${escapeHtml(role)}</td>
      </tr>
    `;
  }).join('');

  return `
    <table>
      <thead>
        <tr>
          <th>Nro</th>
          <th>Jugador</th>
          <th>Posicion</th>
          <th>Rol</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderMatchState(input: MatchSheetPdfInput) {
  if (isFinalStatus(input.status)) {
    return `
      <section class="matchState finalState">
        <div>
          <span class="eyebrow">Resultado final</span>
          <strong class="scoreLine">${escapeHtml(input.home.score)} - ${escapeHtml(input.away.score)}</strong>
        </div>
        <div class="pointsBlock">
          <span class="eyebrow">Puntos obtenidos</span>
          <div class="pointsGrid">
            <div>
              <span>${escapeHtml(input.home.shortName)}</span>
              <strong>${escapeHtml(input.home.points || '0')} pts</strong>
              ${input.home.pointsDetail ? `<small>${escapeHtml(input.home.pointsDetail)}</small>` : ''}
            </div>
            <div>
              <span>${escapeHtml(input.away.shortName)}</span>
              <strong>${escapeHtml(input.away.points || '0')} pts</strong>
              ${input.away.pointsDetail ? `<small>${escapeHtml(input.away.pointsDetail)}</small>` : ''}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  if (isScheduledStatus(input.status)) {
    return `
      <section class="matchState scheduledState">
        <span class="eyebrow">Horario del partido</span>
        <strong>${escapeHtml(input.date)}${input.time ? ` - ${escapeHtml(input.time)}` : ''}</strong>
      </section>
    `;
  }

  return `
    <section class="matchState">
      <div>
        <span class="eyebrow">Estado del partido</span>
        <strong>${escapeHtml(input.statusLabel)}</strong>
      </div>
      <div>
        <span class="eyebrow">Marcador</span>
        <strong>${escapeHtml(input.home.score)} - ${escapeHtml(input.away.score)}</strong>
      </div>
    </section>
  `;
}

function renderInfoGrid(input: MatchSheetPdfInput) {
  const rows = [
    ['Estado', input.statusLabel],
    ['Fecha', input.date],
    ['Hora', input.time || 'Hora a confirmar'],
    ['Torneo', input.tournament.name],
    ['Jornada', input.roundLabel || 'Sin jornada'],
    ['Categoria', input.category || 'Sin categoria'],
  ];

  return rows.map(([label, value]) => `
    <div class="infoItem">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join('');
}

// La planilla oficial siempre imprime 23 renglones (XV titular + 8 suplentes),
// aunque la formación cargada tenga menos. Con más jugadores, crece.
const OFFICIAL_SHEET_MIN_ROWS = 23;
// Renglones vacíos de la tabla de incidencias, para completar a mano.
const OFFICIAL_SHEET_INCIDENT_ROWS = 14;

function officialSheetRoleOrder(role: string | undefined) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'starter' || normalized === 'titular') return 0;
  return 1;
}

/** Titulares primero, por dorsal; el mismo orden en el HTML y en el PDF. */
function sortedOfficialSheetPlayers(team: MatchSheetPdfTeam) {
  return team.lineup
    .filter((player) => player.name.trim())
    .map((player, index) => ({ ...player, originalIndex: index }))
    .sort((a, b) => {
      const roleDelta = officialSheetRoleOrder(a.role) - officialSheetRoleOrder(b.role);
      if (roleDelta !== 0) return roleDelta;
      const aNumber = Number.parseInt(String(a.number || ''), 10);
      const bNumber = Number.parseInt(String(b.number || ''), 10);
      if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) return aNumber - bNumber;
      return a.originalIndex - b.originalIndex;
    });
}

/**
 * Una página de planilla oficial (formato UAR) para un lado del partido. La
 * mayoría de las celdas quedan vacías A PROPÓSITO: minutos, tarjetas, firmas e
 * incidencias se completan a mano el día del partido.
 */
function renderOfficialSheet(input: MatchSheetPdfInput, side: 'local' | 'visitante') {
  const team = side === 'local' ? input.home : input.away;
  const rival = side === 'local' ? input.away : input.home;
  const sideLabel = side === 'local' ? 'LOCAL' : 'VISITANTE';
  const sheetNumber = String(input.officialSheet?.number || '').trim();
  const instance = String(input.officialSheet?.instance || '').trim();
  const showScores = isFinalStatus(input.status);

  const players = sortedOfficialSheetPlayers(team);

  const rowCount = Math.max(OFFICIAL_SHEET_MIN_ROWS, players.length);
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const player = players[index];
    const pos = String(index + 1).padStart(2, '0');
    const dorsal = player ? (String(player.number || '').trim() || String(index + 1)) : '';
    const name = player
      ? `${player.name}${player.isCaptain ? ' (C)' : ''}`
      : '';

    return `
      <tr>
        <td class="osNum">${pos}</td>
        <td class="osNum">${escapeHtml(dorsal)}</td>
        <td class="osMark">${player?.frontRow ? '&#9312;' : ''}</td>
        <td class="osMark"></td>
        <td class="osName">${escapeHtml(name)}</td>
        <td class="osNum">${escapeHtml(player?.docNumber || '')}</td>
        <td></td><td></td>
        <td></td><td></td><td></td><td></td><td></td>
        <td></td><td></td><td></td><td></td><td></td>
        <td></td><td></td>
      </tr>
    `;
  }).join('');

  // Las incidencias cargadas en el partido se vuelcan a la planilla del lado
  // que corresponde; los renglones restantes quedan vacíos para completar a
  // mano el día del partido.
  const eventSide = side === 'local' ? 'home' : 'away';
  const sideEvents = input.timeline.filter((event) => event.side === eventSide);
  const incidentRowCount = Math.max(OFFICIAL_SHEET_INCIDENT_ROWS, sideEvents.length);
  const incidentRows = Array.from({ length: incidentRowCount }, (_, index) => {
    const event = sideEvents[index];
    if (!event) {
      return '<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
    }
    const points = typeof event.points === 'number' && event.points > 0 ? String(event.points) : '';
    return `
      <tr>
        <td class="osNum">${escapeHtml(event.period || '')}</td>
        <td class="osNum">${escapeHtml(event.minute || '')}</td>
        <td>${escapeHtml(event.summary || '')}</td>
        <td class="osNum">${escapeHtml(points)}</td>
        <td class="osNum">${escapeHtml(event.playerNumber || '')}</td>
        <td>${escapeHtml(event.playerName || '')}</td>
      </tr>
    `;
  }).join('');

  const coachLine = team.coach
    ? `${team.coach.name}${team.coach.docNumber ? ` ${team.coach.docNumber}` : ''}`
    : '';

  return `
    <section class="officialSheet">
      <h2 class="osTitle">Planilla de equipo ${sideLabel} para el partido${sheetNumber ? ` N&deg;: ${escapeHtml(sheetNumber)}` : ''}</h2>

      <table class="osHeaderTable">
        <thead>
          <tr>
            <th>Cancha</th><th>Dia</th><th>Hora</th><th>Torneo</th><th>Division</th><th>Instancia</th><th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(input.venue || '')}</td>
            <td>${escapeHtml(input.date || '')}</td>
            <td>${escapeHtml(input.time || '')}</td>
            <td>${escapeHtml(input.tournament.name || '')}</td>
            <td>${escapeHtml(input.category || '')}</td>
            <td>${escapeHtml(instance)}</td>
            <td>${escapeHtml(input.roundLabel || '')}</td>
          </tr>
        </tbody>
      </table>

      <div class="osScoreRow">
        <table class="osScoreTable">
          <thead><tr><th>Local</th><th class="osPts">Puntos</th></tr></thead>
          <tbody><tr>
            <td>${escapeHtml(input.home.name)}</td>
            <td class="osPts">${showScores ? escapeHtml(input.home.score) : ''}</td>
          </tr></tbody>
        </table>
        <table class="osScoreTable">
          <thead><tr><th>Visitante</th><th class="osPts">Puntos</th></tr></thead>
          <tbody><tr>
            <td>${escapeHtml(input.away.name)}</td>
            <td class="osPts">${showScores ? escapeHtml(input.away.score) : ''}</td>
          </tr></tbody>
        </table>
      </div>

      <p class="osHint">Indicar los minutos en los que se producen las incidencias</p>

      <table class="osPlayersTable">
        <thead>
          <tr>
            <th colspan="6" class="osGroupHead">Informacion</th>
            <th colspan="2" class="osGroupHead"></th>
            <th colspan="5" class="osGroupHead">Tarjeta amarilla 1</th>
            <th colspan="5" class="osGroupHead">Tarjeta amarilla 2</th>
            <th colspan="2" class="osGroupHead"></th>
          </tr>
          <tr>
            <th>Pos</th><th>Dor</th><th>1L</th><th>O.M.</th><th class="osName">Apellido y Nombre</th><th>N&deg;Doc</th>
            <th>Sal.</th><th>Ent.</th>
            <th>S.C.</th><th>L.I.</th><th>J.G.</th><th>J.S.</th><th>DI.</th>
            <th>S.C.</th><th>L.I.</th><th>J.G.</th><th>J.S.</th><th>DI.</th>
            <th>Exp.</th><th>C.C.</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="osSignRow">
        <div class="osSignBox"><span>Firma Capitan ${sideLabel === 'LOCAL' ? 'Local' : 'Visitante'}</span></div>
        <div class="osSignBox"><span>Firma Encargado ${sideLabel === 'LOCAL' ? 'Local' : 'Visitante'}</span></div>
        <div class="osSignBox"><span>Firma Capitan ${sideLabel === 'LOCAL' ? 'Visitante' : 'Local'}</span></div>
        <div class="osSignBox"><span>Firma Encargado ${sideLabel === 'LOCAL' ? 'Visitante' : 'Local'}</span></div>
      </div>

      <div class="osBottomGrid">
        <div class="osOfficialsCol">
          <div class="osSignBox osTall"><span>Referee - Firma y Aclaracion</span></div>
          <div class="osSignRow2">
            <div class="osSignBox osTall"><span>R.A. 1 - Firma y Aclaracion</span></div>
            <div class="osSignBox osTall"><span>R.A. 2 - Firma y Aclaracion</span></div>
          </div>
          <div class="osSignRow2">
            <div class="osSignBox osTall"><span>Director del partido - Firma y Aclaracion</span></div>
            <div class="osSignBox osTall"><span>Medico ${sideLabel === 'LOCAL' ? 'Local' : 'Visitante'} - Firma y Aclaracion</span></div>
          </div>
          <div class="osCoachBox">
            <span>Entrenador:</span>
            <strong>${escapeHtml(coachLine)}</strong>
          </div>
        </div>
        <div class="osIncidentsCol">
          <table class="osIncidentsTable">
            <thead>
              <tr><th colspan="6">Incidencias equipo ${sideLabel}</th></tr>
              <tr>
                <th>Tie.</th><th>Min.</th><th>Incid.</th><th>Ptos.</th><th>Jug.N&deg;</th><th>Observaciones</th>
              </tr>
            </thead>
            <tbody>${incidentRows}</tbody>
          </table>
        </div>
      </div>

      <table class="osLegendTable">
        <thead><tr><th colspan="6">Tipos de amarilla</th></tr></thead>
        <tbody>
          <tr>
            <td class="osLegendKey">S.C.</td><td>Scrum</td>
            <td class="osLegendKey">L.I.</td><td>Line</td>
            <td class="osLegendKey">J.G.</td><td>Juego general</td>
          </tr>
          <tr>
            <td class="osLegendKey">J.S.</td><td>Juego sucio</td>
            <td class="osLegendKey">DI</td><td>Disciplina</td>
            <td class="osLegendKey"></td><td>${escapeHtml(rival.name ? `Rival: ${rival.name}` : '')}</td>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}

// How many timeline rows fit comfortably on one A4 page once headers, padding,
// and the section title are accounted for. Tweak if layout changes.
const TIMELINE_ROWS_PER_TABLE = 22;

function renderTimelineChunk(chunk: MatchSheetPdfEvent[], chunkIndex: number, totalChunks: number) {
  const captionAttr = totalChunks > 1
    ? `<caption>Cronologia (parte ${chunkIndex + 1} de ${totalChunks})</caption>`
    : '';
  return `
    <table class="timelineTable">
      ${captionAttr}
      <thead>
        <tr>
          <th>Periodo</th>
          <th>Min</th>
          <th>Evento</th>
          <th>Equipo</th>
          <th>Detalle</th>
          <th>Marcador</th>
        </tr>
      </thead>
      <tbody>
        ${chunk.map((event) => `
          <tr>
            <td>${escapeHtml(event.period || '-')}</td>
            <td class="numCell">${escapeHtml(event.minute || '--')}</td>
            <td><strong>${escapeHtml(event.summary || 'Evento')}</strong></td>
            <td>${escapeHtml(event.team || 'Neutral')}</td>
            <td>${escapeHtml(event.detail || 'Sin detalle')}</td>
            <td class="numCell">${escapeHtml(event.score || '-')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderTimeline(events: MatchSheetPdfEvent[]) {
  if (events.length === 0) {
    return '<p class="emptyText">Todavia no hay eventos cargados en el partido.</p>';
  }

  // Split long timelines into multiple tables so the print engine can keep
  // each one on a single page (combined with `page-break-inside: avoid` on
  // `.timelineTable`). The overall PDF grows pages as needed.
  const chunks: MatchSheetPdfEvent[][] = [];
  for (let i = 0; i < events.length; i += TIMELINE_ROWS_PER_TABLE) {
    chunks.push(events.slice(i, i + TIMELINE_ROWS_PER_TABLE));
  }

  return chunks
    .map((chunk, index) => `
      <div class="timelineChunk">
        ${renderTimelineChunk(chunk, index, chunks.length)}
      </div>
    `)
    .join('');
}

function renderStats(input: MatchSheetPdfInput) {
  const sections = input.statSections.filter((section) => section.rows.length > 0);
  if (sections.length === 0) {
    return '<p class="emptyText">Sin estadisticas disponibles.</p>';
  }

  return sections.map((section) => `
    <article class="statBlock">
      <h3>${escapeHtml(section.title)}</h3>
      <table>
        <thead>
          <tr>
            <th>Estadistica</th>
            <th>${escapeHtml(input.home.shortName)}</th>
            <th>${escapeHtml(input.away.shortName)}</th>
          </tr>
        </thead>
        <tbody>
          ${section.rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.label)}</td>
              <td class="numCell">${escapeHtml(row.home)}</td>
              <td class="numCell">${escapeHtml(row.away)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </article>
  `).join('');
}

function buildMatchSheetHtml(input: MatchSheetPdfInput, origin: string) {
  const accent = safeAccentColor(input.accentColor);
  const generatedAt = new Date().toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    html { background: #f3f4f6; }
    img,
    table,
    .sheet,
    .sheet * {
      max-width: 100%;
    }
    body {
      margin: 0;
      background: #f3f4f6;
      color: #111827;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: min(100%, 980px);
      margin: 24px auto;
      background: #fff;
      border: 1px solid #d1d5db;
      box-shadow: 0 18px 60px rgba(15, 23, 42, 0.12);
      padding: 34px;
      --accent: ${accent};
      overflow-wrap: anywhere;
    }
    .topbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      border-bottom: 3px solid var(--accent);
      padding-bottom: 18px;
    }
    .teamsLogos,
    .tournamentLogo {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .tournamentLogo {
      justify-content: flex-end;
      text-align: right;
    }
    .logoBox {
      width: 54px;
      height: 54px;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #fff;
      color: #111827;
      font-weight: 800;
      flex: 0 0 auto;
    }
    .logoBox img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: 4px;
    }
    .logoFallback { background: #f9fafb; }
    .logoTournament { width: 64px; height: 64px; }
    .vs {
      color: var(--accent);
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0.12em;
    }
    .tournamentName {
      display: grid;
      gap: 3px;
      max-width: 230px;
      min-width: 0;
    }
    .tournamentName span,
    .eyebrow {
      color: #6b7280;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .tournamentName strong {
      color: #111827;
      font-size: 15px;
      line-height: 1.2;
    }
    h1 {
      margin: 24px 0 8px;
      font-size: 28px;
      line-height: 1.1;
      letter-spacing: 0;
    }
    .subtitle {
      margin: 0 0 20px;
      color: #4b5563;
      font-size: 13px;
    }
    .matchState {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      margin: 20px 0;
      padding: 18px;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      background: #f9fafb;
      min-width: 0;
    }
    .matchState strong {
      display: block;
      margin-top: 4px;
      font-size: 19px;
      color: #111827;
    }
    .scoreLine {
      font-size: 34px !important;
      letter-spacing: 0;
    }
    .pointsBlock > .eyebrow {
      display: block;
      margin-bottom: 8px;
      text-align: right;
    }
    .pointsGrid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      min-width: min(320px, 100%);
    }
    .pointsGrid div {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background: #fff;
      padding: 10px 12px;
    }
    .pointsGrid span,
    .pointsGrid small {
      display: block;
      color: #6b7280;
      font-size: 11px;
      font-weight: 700;
    }
    .pointsGrid strong {
      margin: 3px 0;
      color: var(--accent);
      font-size: 20px;
    }
    .infoGrid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin: 16px 0 24px;
    }
    .infoItem {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px 12px;
      background: #fff;
    }
    .infoItem span {
      display: block;
      margin-bottom: 3px;
      color: #6b7280;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .infoItem strong {
      display: block;
      color: #111827;
      font-size: 13px;
      line-height: 1.25;
    }
    .section {
      margin-top: 26px;
      page-break-inside: avoid;
    }
    .section h2 {
      margin: 0 0 12px;
      color: #111827;
      font-size: 17px;
      line-height: 1.2;
    }
    .sectionHeader {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid #d1d5db;
      margin-bottom: 12px;
      padding-bottom: 8px;
    }
    .lineupGrid,
    .statsGrid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      align-items: start;
    }
    .teamBlock,
    .statBlock,
    .officialsGrid > div {
      border: 1px solid #d1d5db;
      border-radius: 10px;
      background: #fff;
      padding: 14px;
      page-break-inside: avoid;
    }
    .teamBlock h3,
    .statBlock h3 {
      margin: 0 0 10px;
      color: var(--accent);
      font-size: 14px;
    }
    .officialsGrid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .officialsGrid span {
      display: block;
      margin-bottom: 4px;
      color: #6b7280;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .officialsGrid strong { font-size: 15px; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      table-layout: fixed;
    }
    th {
      background: #f3f4f6;
      color: #4b5563;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-align: left;
      text-transform: uppercase;
    }
    th,
    td {
      border-bottom: 1px solid #e5e7eb;
      padding: 8px 7px;
      vertical-align: top;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    tbody tr:last-child td { border-bottom: 0; }
    .timelineTable th:nth-child(5),
    .timelineTable td:nth-child(5) {
      width: 34%;
    }
    .numCell {
      color: #111827;
      font-family: "SFMono-Regular", Consolas, ui-monospace, monospace;
      font-weight: 800;
      text-align: center;
      white-space: nowrap;
    }
    .captainTag {
      display: inline-block;
      margin-left: 6px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 14%, white);
      color: var(--accent);
      padding: 2px 6px;
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
    }
    .emptyText {
      margin: 0;
      border: 1px dashed #d1d5db;
      border-radius: 8px;
      padding: 12px;
      color: #6b7280;
      font-size: 12px;
      text-align: center;
    }
    .notesBox {
      border-left: 4px solid var(--accent);
      background: #f9fafb;
      padding: 12px 14px;
      color: #374151;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border-top: 1px solid #d1d5db;
      margin-top: 30px;
      padding-top: 12px;
      color: #6b7280;
      font-size: 10px;
    }
    /* ── Planilla oficial (formato UAR): una página por equipo ── */
    .officialSheet {
      page-break-after: always;
      break-after: page;
      margin-bottom: 28px;
      color: #111827;
    }
    .officialSheet table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
    }
    .officialSheet th,
    .officialSheet td {
      border: 1px solid #9ca3af;
      padding: 2px 4px;
      font-size: 9px;
      vertical-align: middle;
      overflow-wrap: anywhere;
    }
    .officialSheet th {
      background: #f3f4f6;
      color: #374151;
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-align: center;
      text-transform: none;
    }
    .osTitle {
      margin: 0 0 12px;
      font-size: 18px;
      font-weight: 800;
    }
    .osHeaderTable td { text-align: center; }
    .osScoreRow {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin: 12px 0;
    }
    .osScoreTable td { height: 18px; font-weight: 700; }
    .osPts { width: 80px; text-align: center; }
    .osHint {
      margin: 10px 0 4px;
      font-size: 10px;
      font-weight: 800;
    }
    .osGroupHead { text-align: center; }
    .osPlayersTable td { height: 15px; }
    .osPlayersTable .osName { text-align: left; width: 26%; }
    .osNum {
      font-family: "SFMono-Regular", Consolas, ui-monospace, monospace;
      text-align: center;
      white-space: nowrap;
    }
    .osMark { text-align: center; width: 20px; font-size: 10px; }
    .osSignRow {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .osSignRow2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 8px;
    }
    .osSignBox {
      border: 1px solid #9ca3af;
      min-height: 52px;
      padding: 4px 6px;
      background: #fff;
    }
    .osSignBox span {
      font-size: 8.5px;
      font-weight: 700;
      color: #374151;
    }
    .osTall { min-height: 64px; }
    .osBottomGrid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
      gap: 12px;
      margin-top: 12px;
      align-items: start;
    }
    .osCoachBox {
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid #9ca3af;
      margin-top: 8px;
      padding: 6px 8px;
      background: #fff;
    }
    .osCoachBox span { font-size: 9px; font-weight: 700; color: #374151; }
    .osCoachBox strong { font-size: 11px; }
    .osIncidentsTable td { height: 14px; }
    .osLegendTable { margin-top: 12px; }
    .osLegendKey { font-weight: 800; width: 36px; text-align: center; }
    @media print {
      @page { size: A4 portrait; margin: 14mm; }

      html,
      body {
        background: #fff;
        width: 100%;
        min-width: 0;
      }

      .sheet {
        width: 100%;
        max-width: 182mm;
        margin: 0;
        border: 0;
        box-shadow: none;
        padding: 0;
        overflow: visible;
      }

      .topbar,
      .matchState,
      .footer {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .topbar,
      .matchState {
        gap: 12px;
      }

      .topbar {
        align-items: flex-start;
      }

      .tournamentLogo {
        flex: 1 1 42%;
      }

      .teamsLogos {
        flex: 1 1 42%;
      }

      .tournamentName {
        max-width: none;
      }

      h1 {
        margin-top: 16px;
        font-size: 22px;
      }

      .subtitle {
        margin-bottom: 12px;
      }

      .logoBox {
        width: 42px;
        height: 42px;
        border-radius: 8px;
      }

      .logoTournament {
        width: 50px;
        height: 50px;
      }

      .matchState {
        flex-wrap: wrap;
        margin: 14px 0;
        padding: 12px;
      }

      .matchState > div {
        flex: 1 1 220px;
        min-width: 0;
      }

      .matchState strong {
        font-size: 16px;
      }

      .scoreLine {
        font-size: 28px !important;
      }

      .pointsBlock > .eyebrow {
        text-align: left;
      }

      .infoGrid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 16px;
      }

      .section {
        margin-top: 18px;
        break-inside: auto;
        page-break-inside: auto;
      }

      .sectionHeader {
        break-after: avoid;
        page-break-after: avoid;
      }

      .lineupGrid,
      .statsGrid,
      .officialsGrid {
        grid-template-columns: 1fr;
        gap: 10px;
      }

      .teamBlock,
      .statBlock,
      .officialsGrid > div {
        padding: 10px;
        /* Each lineup / stat block holds exactly one table — keep it whole
           on a single page. If it doesn't fit, the print engine will move
           the entire block to a new page (and the PDF gains pages as needed). */
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .timelineChunk {
        /* Each timeline chunk is sized to fit on one page. */
        break-inside: avoid;
        page-break-inside: avoid;
        margin-bottom: 12px;
      }

      table {
        table-layout: fixed;
        font-size: 9.5px;
        /* Tables must NOT split across pages. We keep timelines short by
           chunking them into multiple tables on the JS side. */
        break-inside: avoid;
        page-break-inside: avoid;
      }

      caption {
        caption-side: top;
        text-align: left;
        padding: 4px 0 6px;
        color: #6b7280;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      thead {
        display: table-header-group;
      }

      tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      th,
      td {
        padding: 5px 4px;
        white-space: normal;
      }

      .timelineTable th:nth-child(1),
      .timelineTable td:nth-child(1) {
        width: 15%;
      }

      .timelineTable th:nth-child(2),
      .timelineTable td:nth-child(2),
      .timelineTable th:nth-child(6),
      .timelineTable td:nth-child(6) {
        width: 10%;
      }

      .timelineTable th:nth-child(5),
      .timelineTable td:nth-child(5) {
        width: auto;
      }

      .captainTag {
        margin: 3px 0 0;
      }

      .footer {
        margin-top: 18px;
        flex-wrap: wrap;
      }
    }
  </style>
</head>
<body>
  <main class="sheet">
    ${input.officialSheet ? renderOfficialSheet(input, 'local') + renderOfficialSheet(input, 'visitante') : ''}
    <header class="topbar">
      <div class="teamsLogos">
        ${renderLogo(input.home.logoUrl, input.home.name, origin)}
        <span class="vs">VS</span>
        ${renderLogo(input.away.logoUrl, input.away.name, origin)}
      </div>
      <div class="tournamentLogo">
        <div class="tournamentName">
          <span>Competicion</span>
          <strong>${escapeHtml(input.tournament.name)}</strong>
        </div>
        ${renderLogo(input.tournament.logoUrl, input.tournament.name, origin, 'logoTournament')}
      </div>
    </header>

    <h1>${escapeHtml(input.title)}</h1>
    <p class="subtitle">${escapeHtml(input.home.name)} vs ${escapeHtml(input.away.name)}</p>

    ${renderMatchState(input)}

    <section class="infoGrid" aria-label="Informacion general">
      ${renderInfoGrid(input)}
    </section>

    <section class="section">
      <div class="sectionHeader">
        <h2>1. Plantillas</h2>
      </div>
      <div class="lineupGrid">
        <article class="teamBlock">
          <h3>${escapeHtml(input.home.name)}</h3>
          ${renderLineupTable(input.home)}
        </article>
        <article class="teamBlock">
          <h3>${escapeHtml(input.away.name)}</h3>
          ${renderLineupTable(input.away)}
        </article>
      </div>
    </section>

    <section class="section">
      <div class="sectionHeader">
        <h2>2. &Aacute;rbitro y estadio</h2>
      </div>
      <div class="officialsGrid">
        <div>
          <span>&Aacute;rbitro asignado</span>
          <strong>${escapeHtml(input.referee || 'A confirmar')}</strong>
        </div>
        <div>
          <span>Estadio / sede</span>
          <strong>${escapeHtml(input.venue || 'Sede a confirmar')}</strong>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="sectionHeader">
        <h2>3. L&iacute;nea de tiempo</h2>
        <span class="eyebrow">${input.timeline.length} eventos</span>
      </div>
      ${renderTimeline(input.timeline)}
    </section>

    <section class="section">
      <div class="sectionHeader">
        <h2>4. Estad&iacute;sticas</h2>
      </div>
      <div class="statsGrid">
        ${renderStats(input)}
      </div>
    </section>

    ${input.notes?.trim() ? `
      <section class="section">
        <div class="sectionHeader">
          <h2>Notas internas</h2>
        </div>
        <div class="notesBox">${escapeHtml(input.notes)}</div>
      </section>
    ` : ''}

    <footer class="footer">
      <span>G22 Scores - Planilla de partido</span>
      <span>Generado: ${escapeHtml(generatedAt)}</span>
    </footer>
  </main>
</body>
</html>`;
}

async function fetchAsDataUri(url: string | null | undefined, origin: string): Promise<string | null> {
  const resolved = resolveAssetUrl(url, origin);
  if (!resolved) return null;
  if (resolved.startsWith('data:')) return resolved;

  try {
    const response = await fetch(resolved, { credentials: 'same-origin' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function inlineLogosAsDataUris(input: MatchSheetPdfInput, origin: string): Promise<MatchSheetPdfInput> {
  // Inline every logo as a base64 data URI before writing the print document.
  // External hosts (Supabase storage, FlashScore, etc.) sometimes fail in the
  // popup's print pipeline — auth, CORS taint, redirects, or transient errors
  // can all leave the <img> broken. Embedding the bytes sidesteps all of it.
  const [homeLogo, awayLogo, tournamentLogo] = await Promise.all([
    fetchAsDataUri(input.home.logoUrl, origin),
    fetchAsDataUri(input.away.logoUrl, origin),
    fetchAsDataUri(input.tournament.logoUrl, origin),
  ]);

  return {
    ...input,
    home: { ...input.home, logoUrl: homeLogo ?? input.home.logoUrl },
    away: { ...input.away, logoUrl: awayLogo ?? input.away.logoUrl },
    tournament: { ...input.tournament, logoUrl: tournamentLogo ?? input.tournament.logoUrl },
  };
}

type PdfDoc = import('jspdf').jsPDF;
type AutoTableFn = typeof import('jspdf-autotable').default;
type AutoTableStyles = Partial<import('jspdf-autotable').Styles>;

const PDF_MARGIN = 36;

const PDF_TABLE_STYLES: AutoTableStyles = {
  fontSize: 6.5,
  cellPadding: 1.5,
  lineColor: [156, 163, 175],
  lineWidth: 0.5,
  textColor: [17, 24, 39],
  valign: 'middle',
};

const PDF_HEAD_STYLES: AutoTableStyles = {
  fillColor: [243, 244, 246],
  textColor: [55, 65, 81],
  fontStyle: 'bold',
  halign: 'center',
  lineColor: [156, 163, 175],
  lineWidth: 0.5,
};

function pdfFinalY(doc: PdfDoc, fallback: number) {
  return (doc as PdfDoc & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback;
}

function ensurePdfSpace(doc: PdfDoc, y: number, needed: number) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed <= pageHeight - PDF_MARGIN) return y;
  doc.addPage();
  return PDF_MARGIN;
}

/** Caja con borde y rótulo chico, para firmas y aclaraciones. */
function drawPdfLabeledBox(doc: PdfDoc, x: number, y: number, width: number, height: number, label: string) {
  doc.setDrawColor(156, 163, 175);
  doc.setLineWidth(0.75);
  doc.rect(x, y, width, height);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(55, 65, 81);
  doc.text(doc.splitTextToSize(label, width - 8) as string[], x + 4, y + 9);
}

/**
 * Convierte un escudo (ya inlineado como data URI) a PNG vía canvas: jsPDF no
 * sabe de SVG ni de todos los formatos, y el canvas los normaliza todos.
 */
async function logoToPngDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url || typeof document === 'undefined') return null;
  try {
    const image = new Image();
    const loaded = await new Promise<boolean>((resolve) => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = url;
    });
    if (!loaded || !image.naturalWidth || !image.naturalHeight) return null;

    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const ratio = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * ratio;
    const height = image.naturalHeight * ratio;
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** Una página de planilla oficial (formato UAR) dibujada en vectorial. */
function drawOfficialSheetPage(doc: PdfDoc, autoTable: AutoTableFn, input: MatchSheetPdfInput, side: 'local' | 'visitante') {
  const margin = PDF_MARGIN;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  const team = side === 'local' ? input.home : input.away;
  const sideLabel = side === 'local' ? 'LOCAL' : 'VISITANTE';
  const sheetNumber = String(input.officialSheet?.number || '').trim();
  const instance = String(input.officialSheet?.instance || '').trim();
  const showScores = isFinalStatus(input.status);

  let y = margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(17, 24, 39);
  doc.text(`Planilla de equipo ${sideLabel} para el partido${sheetNumber ? ` N°: ${sheetNumber}` : ''}`, margin, y + 4);
  y += 16;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { ...PDF_TABLE_STYLES, halign: 'center' },
    headStyles: { ...PDF_HEAD_STYLES, fontSize: 6 },
    head: [['Cancha', 'Dia', 'Hora', 'Torneo', 'Division', 'Instancia', 'Fecha']],
    body: [[
      input.venue || '', input.date || '', input.time || '', input.tournament.name || '',
      input.category || '', instance, input.roundLabel || '',
    ]],
  });
  y = pdfFinalY(doc, y) + 10;

  const half = (contentWidth - 12) / 2;
  const scoreStart = y;
  autoTable(doc, {
    startY: scoreStart,
    margin: { left: margin },
    tableWidth: half,
    theme: 'grid',
    styles: { ...PDF_TABLE_STYLES, fontSize: 7, minCellHeight: 14, fontStyle: 'bold' },
    headStyles: { ...PDF_HEAD_STYLES, fontSize: 6 },
    head: [['Local', 'Puntos']],
    body: [[input.home.name, showScores ? input.home.score : '']],
    columnStyles: { 1: { cellWidth: 50, halign: 'center' } },
  });
  const leftScoreBottom = pdfFinalY(doc, scoreStart);
  autoTable(doc, {
    startY: scoreStart,
    margin: { left: margin + half + 12 },
    tableWidth: half,
    theme: 'grid',
    styles: { ...PDF_TABLE_STYLES, fontSize: 7, minCellHeight: 14, fontStyle: 'bold' },
    headStyles: { ...PDF_HEAD_STYLES, fontSize: 6 },
    head: [['Visitante', 'Puntos']],
    body: [[input.away.name, showScores ? input.away.score : '']],
    columnStyles: { 1: { cellWidth: 50, halign: 'center' } },
  });
  y = Math.max(leftScoreBottom, pdfFinalY(doc, scoreStart)) + 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(17, 24, 39);
  doc.text('Indicar los minutos en los que se producen las incidencias', margin, y);
  y += 4;

  const players = sortedOfficialSheetPlayers(team);
  const rowCount = Math.max(OFFICIAL_SHEET_MIN_ROWS, players.length);
  const frontRowIndexes = new Set<number>();
  const playersBody = Array.from({ length: rowCount }, (_, index) => {
    const player = players[index];
    if (player?.frontRow) frontRowIndexes.add(index);
    return [
      String(index + 1).padStart(2, '0'),
      player ? (String(player.number || '').trim() || String(index + 1)) : '',
      '', '',
      player ? `${player.name}${player.isCaptain ? ' (C)' : ''}` : '',
      player?.docNumber || '',
      '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    ];
  });

  const smallCol = { cellWidth: 15 } as const;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { ...PDF_TABLE_STYLES, fontSize: 6, cellPadding: 1, minCellHeight: 11.5, halign: 'center' },
    headStyles: { ...PDF_HEAD_STYLES, fontSize: 5.5, cellPadding: 1 },
    head: [
      [
        { content: 'Informacion', colSpan: 6 },
        { content: '', colSpan: 2 },
        { content: 'Tarjeta amarilla 1', colSpan: 5 },
        { content: 'Tarjeta amarilla 2', colSpan: 5 },
        { content: '', colSpan: 2 },
      ],
      [
        'Pos', 'Dor', '1L', 'O.M.', 'Apellido y Nombre', 'N°Doc', 'Sal.', 'Ent.',
        'S.C.', 'L.I.', 'J.G.', 'J.S.', 'DI.', 'S.C.', 'L.I.', 'J.G.', 'J.S.', 'DI.',
        'Exp.', 'C.C.',
      ],
    ],
    body: playersBody,
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 16 },
      2: { cellWidth: 14 },
      3: { cellWidth: 16 },
      4: { cellWidth: 'auto', halign: 'left' },
      5: { cellWidth: 50 },
      6: { cellWidth: 16 },
      7: { cellWidth: 16 },
      8: smallCol, 9: smallCol, 10: smallCol, 11: smallCol, 12: smallCol,
      13: smallCol, 14: smallCol, 15: smallCol, 16: smallCol, 17: smallCol,
      18: { cellWidth: 17 },
      19: { cellWidth: 17 },
    },
    didDrawCell: (data) => {
      // La marca ① se dibuja (círculo + 1): las fuentes base de jsPDF no
      // tienen el glifo.
      if (data.section !== 'body' || data.column.index !== 2) return;
      if (!frontRowIndexes.has(data.row.index)) return;
      const cx = data.cell.x + data.cell.width / 2;
      const cy = data.cell.y + data.cell.height / 2;
      doc.setDrawColor(17, 24, 39);
      doc.setLineWidth(0.6);
      doc.circle(cx, cy, 3);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(17, 24, 39);
      doc.text('1', cx, cy + 1.9, { align: 'center' });
    },
  });
  y = pdfFinalY(doc, y) + 10;

  const signWidth = (contentWidth - 30) / 4;
  const signLabels = sideLabel === 'LOCAL'
    ? ['Firma Capitan Local', 'Firma Encargado Local', 'Firma Capitan Visitante', 'Firma Encargado Visitante']
    : ['Firma Capitan Visitante', 'Firma Encargado Visitante', 'Firma Capitan Local', 'Firma Encargado Local'];
  signLabels.forEach((label, index) => {
    drawPdfLabeledBox(doc, margin + index * (signWidth + 10), y, signWidth, 34, label);
  });
  y += 44;

  const leftWidth = contentWidth * 0.46;
  const rightX = margin + leftWidth + 10;
  const rightWidth = contentWidth - leftWidth - 10;
  const boxesTop = y;
  const halfLeft = (leftWidth - 6) / 2;
  drawPdfLabeledBox(doc, margin, y, leftWidth, 38, 'Referee - Firma y Aclaracion');
  y += 44;
  drawPdfLabeledBox(doc, margin, y, halfLeft, 38, 'R.A. 1 - Firma y Aclaracion');
  drawPdfLabeledBox(doc, margin + halfLeft + 6, y, halfLeft, 38, 'R.A. 2 - Firma y Aclaracion');
  y += 44;
  drawPdfLabeledBox(doc, margin, y, halfLeft, 38, 'Director del partido - Firma y Aclaracion');
  drawPdfLabeledBox(doc, margin + halfLeft + 6, y, halfLeft, 38, `Medico ${sideLabel === 'LOCAL' ? 'Local' : 'Visitante'} - Firma y Aclaracion`);
  y += 44;
  drawPdfLabeledBox(doc, margin, y, leftWidth, 20, 'Entrenador:');
  const coachLine = team.coach
    ? `${team.coach.name}${team.coach.docNumber ? ` ${team.coach.docNumber}` : ''}`
    : '';
  if (coachLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(17, 24, 39);
    doc.text(coachLine, margin + 46, y + 12.5);
  }
  const leftBottom = y + 20;

  const eventSide = side === 'local' ? 'home' : 'away';
  const sideEvents = input.timeline.filter((event) => event.side === eventSide);
  const incidentRowCount = Math.max(OFFICIAL_SHEET_INCIDENT_ROWS, sideEvents.length);
  const incidentBody = Array.from({ length: incidentRowCount }, (_, index) => {
    const event = sideEvents[index];
    if (!event) return ['', '', '', '', '', ''];
    const points = typeof event.points === 'number' && event.points > 0 ? String(event.points) : '';
    return [
      event.period || '', event.minute || '', event.summary || '',
      points, event.playerNumber || '', event.playerName || '',
    ];
  });

  autoTable(doc, {
    startY: boxesTop,
    margin: { left: rightX, right: margin },
    tableWidth: rightWidth,
    theme: 'grid',
    styles: { ...PDF_TABLE_STYLES, fontSize: 5.8, cellPadding: 1, minCellHeight: 10, halign: 'center' },
    headStyles: { ...PDF_HEAD_STYLES, fontSize: 5.8, cellPadding: 1 },
    head: [
      [{ content: `Incidencias equipo ${sideLabel}`, colSpan: 6 }],
      ['Tie.', 'Min.', 'Incid.', 'Ptos.', 'Jug.N°', 'Observaciones'],
    ],
    body: incidentBody,
    columnStyles: {
      0: { cellWidth: 36 },
      1: { cellWidth: 20 },
      2: { cellWidth: 38 },
      3: { cellWidth: 20 },
      4: { cellWidth: 26 },
      5: { cellWidth: 'auto', halign: 'left' },
    },
  });

  y = Math.max(leftBottom, pdfFinalY(doc, boxesTop)) + 10;
  y = ensurePdfSpace(doc, y, 36);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { ...PDF_TABLE_STYLES, fontSize: 6, halign: 'left' },
    headStyles: { ...PDF_HEAD_STYLES, fontSize: 6 },
    head: [[{ content: 'Tipos de amarilla', colSpan: 6 }]],
    body: [
      ['S.C.', 'Scrum', 'L.I.', 'Line', 'J.G.', 'Juego general'],
      ['J.S.', 'Juego sucio', 'DI', 'Disciplina', '', ''],
    ],
    columnStyles: {
      0: { cellWidth: 26, fontStyle: 'bold' },
      2: { cellWidth: 26, fontStyle: 'bold' },
      4: { cellWidth: 26, fontStyle: 'bold' },
    },
  });
}

/** El informe del partido (resumen, plantillas, cronología, estadísticas). */
function drawReportPages(
  doc: PdfDoc,
  autoTable: AutoTableFn,
  input: MatchSheetPdfInput,
  logos: { home: string | null; away: string | null; tournament: string | null },
) {
  const margin = PDF_MARGIN;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  let logoX = margin;
  if (logos.home) {
    doc.addImage(logos.home, 'PNG', logoX, y, 24, 24);
    logoX += 30;
  }
  if (logos.away) {
    doc.addImage(logos.away, 'PNG', logoX, y, 24, 24);
  }
  if (logos.tournament) {
    doc.addImage(logos.tournament, 'PNG', margin + contentWidth - 26, y, 26, 26);
  }
  if (logos.home || logos.away || logos.tournament) {
    y += 34;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  const titleLines = doc.splitTextToSize(input.title, contentWidth) as string[];
  doc.text(titleLines, margin, y + 10);
  y += 10 + titleLines.length * 15;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(75, 85, 99);
  doc.text(`${input.home.name} vs ${input.away.name}`, margin, y);
  y += 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  const pointsLine = input.home.points || input.away.points
    ? `   (${input.home.shortName} ${input.home.points || '0'} pts - ${input.away.shortName} ${input.away.points || '0'} pts)`
    : '';
  const stateLine = isFinalStatus(input.status)
    ? `Resultado final: ${input.home.score} - ${input.away.score}${pointsLine}`
    : `${input.statusLabel} - Marcador: ${input.home.score} - ${input.away.score}`;
  doc.text(stateLine, margin, y);
  y += 10;

  const labelStyle: AutoTableStyles = { fontStyle: 'bold', fillColor: [243, 244, 246] };
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { ...PDF_TABLE_STYLES, fontSize: 7.5, cellPadding: 3, halign: 'left' },
    body: [
      ['Estado', input.statusLabel, 'Fecha', input.date],
      ['Hora', input.time || 'Hora a confirmar', 'Torneo', input.tournament.name],
      ['Jornada', input.roundLabel || 'Sin jornada', 'Categoria', input.category || 'Sin categoria'],
      ['Arbitro', input.referee || 'A confirmar', 'Estadio / sede', input.venue || 'Sede a confirmar'],
    ],
    columnStyles: {
      0: { cellWidth: 55, ...labelStyle },
      2: { cellWidth: 70, ...labelStyle },
    },
  });
  y = pdfFinalY(doc, y) + 16;

  const sectionTitle = (text: string, needed = 70) => {
    y = ensurePdfSpace(doc, y, needed);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text(text, margin, y + 4);
    y += 14;
  };
  const emptyNote = (text: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(text, margin, y + 4);
    y += 18;
  };

  sectionTitle('1. Plantillas', 120);
  for (const team of [input.home, input.away]) {
    y = ensurePdfSpace(doc, y, 70);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(17, 24, 39);
    doc.text(team.name, margin, y + 2);
    y += 8;

    const players = team.lineup.filter((player) => player.name.trim());
    if (players.length === 0) {
      emptyNote('Sin jugadores cargados.');
      continue;
    }
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, top: margin, bottom: margin },
      theme: 'grid',
      styles: { ...PDF_TABLE_STYLES, fontSize: 7, cellPadding: 2, halign: 'left' },
      headStyles: { ...PDF_HEAD_STYLES, halign: 'left' },
      head: [['Nro', 'Jugador', 'Posicion', 'Rol', 'Documento']],
      body: players.map((player, index) => [
        String(player.number || '').trim() || String(index + 1).padStart(2, '0'),
        `${player.name}${player.isCaptain ? ' (C)' : ''}`,
        player.position || '-',
        ROLE_LABELS[String(player.role || '').trim()] || player.role || '-',
        player.docNumber || '',
      ]),
      columnStyles: {
        0: { cellWidth: 28, halign: 'center' },
        2: { cellWidth: 90 },
        3: { cellWidth: 60 },
        4: { cellWidth: 70 },
      },
    });
    y = pdfFinalY(doc, y) + 12;
  }

  sectionTitle(`2. Linea de tiempo (${input.timeline.length} eventos)`, 90);
  if (input.timeline.length === 0) {
    emptyNote('Todavia no hay eventos cargados en el partido.');
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, top: margin, bottom: margin },
      theme: 'grid',
      styles: { ...PDF_TABLE_STYLES, fontSize: 7, cellPadding: 2, halign: 'left' },
      headStyles: { ...PDF_HEAD_STYLES, halign: 'left' },
      head: [['Periodo', 'Min', 'Evento', 'Equipo', 'Detalle', 'Marcador']],
      body: input.timeline.map((event) => [
        event.period || '-', event.minute || '--', event.summary || 'Evento',
        event.team || 'Neutral', event.detail || '', event.score || '-',
      ]),
      columnStyles: {
        0: { cellWidth: 58 },
        1: { cellWidth: 26, halign: 'center' },
        2: { cellWidth: 68 },
        3: { cellWidth: 68 },
        5: { cellWidth: 44, halign: 'center' },
      },
    });
    y = pdfFinalY(doc, y) + 12;
  }

  const statSections = input.statSections.filter((section) => section.rows.length > 0);
  sectionTitle('3. Estadisticas', 90);
  if (statSections.length === 0) {
    emptyNote('Sin estadisticas disponibles.');
  }
  for (const section of statSections) {
    y = ensurePdfSpace(doc, y, 60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(17, 24, 39);
    doc.text(section.title, margin, y + 2);
    y += 8;
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, top: margin, bottom: margin },
      theme: 'grid',
      styles: { ...PDF_TABLE_STYLES, fontSize: 7, cellPadding: 2, halign: 'left' },
      headStyles: { ...PDF_HEAD_STYLES, halign: 'left' },
      head: [['Estadistica', input.home.shortName, input.away.shortName]],
      body: section.rows.map((row) => [row.label, String(row.home), String(row.away)]),
      columnStyles: {
        1: { cellWidth: 70, halign: 'center' },
        2: { cellWidth: 70, halign: 'center' },
      },
    });
    y = pdfFinalY(doc, y) + 10;
  }

  if (input.notes?.trim()) {
    sectionTitle('Notas internas', 60);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(55, 65, 81);
    const noteLines = doc.splitTextToSize(input.notes.trim(), contentWidth) as string[];
    y = ensurePdfSpace(doc, y, noteLines.length * 10 + 10);
    doc.text(noteLines, margin, y + 4);
    y += noteLines.length * 10 + 10;
  }

  const generatedAt = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  y = ensurePdfSpace(doc, y, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  doc.text(`G22 Scores - Planilla de partido - Generado: ${generatedAt}`, margin, y + 10);
}

/**
 * Genera el PDF en VECTORIAL (jspdf + jspdf-autotable, por import dinámico) y
 * lo descarga en el dispositivo: texto nítido y seleccionable, sin capturas de
 * pantalla. Si `officialSheet` viene, abre con las dos planillas oficiales y
 * sigue con el informe del partido.
 */
export async function downloadMatchSheetPdf(input: MatchSheetPdfInput, fileName = 'planilla-partido.pdf') {
  if (typeof window === 'undefined') return false;

  try {
    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const autoTable = autoTableModule.default;

    const origin = window.location.origin;
    const inlinedInput = await inlineLogosAsDataUris(input, origin);
    const [homeLogo, awayLogo, tournamentLogo] = await Promise.all([
      logoToPngDataUri(inlinedInput.home.logoUrl),
      logoToPngDataUri(inlinedInput.away.logoUrl),
      logoToPngDataUri(inlinedInput.tournament.logoUrl),
    ]);

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    if (inlinedInput.officialSheet) {
      drawOfficialSheetPage(doc, autoTable, inlinedInput, 'local');
      doc.addPage();
      drawOfficialSheetPage(doc, autoTable, inlinedInput, 'visitante');
      doc.addPage();
    }

    drawReportPages(doc, autoTable, inlinedInput, {
      home: homeLogo,
      away: awayLogo,
      tournament: tournamentLogo,
    });

    doc.save(fileName);
    return true;
  } catch {
    return false;
  }
}

export async function exportMatchSheetPdf(input: MatchSheetPdfInput) {
  if (typeof window === 'undefined') return false;

  const printWindow = window.open('', '_blank', 'width=920,height=1100');
  if (!printWindow) return false;

  const origin = window.location.origin;
  const inlinedInput = await inlineLogosAsDataUris(input, origin);

  printWindow.document.open();
  printWindow.document.write(buildMatchSheetHtml(inlinedInput, origin));
  printWindow.document.close();

  const triggerPrint = () => {
    printWindow.focus();
    printWindow.print();
  };

  const waitForImages = () => {
    const images = Array.from(printWindow.document.images);
    if (images.length === 0) {
      window.setTimeout(triggerPrint, 250);
      return;
    }

    let pending = images.length;
    const done = () => {
      pending -= 1;
      if (pending <= 0) {
        window.setTimeout(triggerPrint, 250);
      }
    };

    images.forEach((image) => {
      if (image.complete) {
        done();
        return;
      }
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
    });
  };

  if (printWindow.document.readyState === 'complete') {
    waitForImages();
  } else {
    printWindow.addEventListener('load', waitForImages, { once: true });
  }

  return true;
}
