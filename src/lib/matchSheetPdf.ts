export interface MatchSheetPdfLineupPlayer {
  number?: string;
  name: string;
  position?: string;
  role?: string;
  isCaptain?: boolean;
}

export interface MatchSheetPdfTeam {
  name: string;
  shortName: string;
  logoUrl?: string | null;
  score: string;
  points?: string;
  pointsDetail?: string;
  lineup: MatchSheetPdfLineupPlayer[];
}

export interface MatchSheetPdfEvent {
  period: string;
  minute: string;
  summary: string;
  team: string;
  detail: string;
  score?: string;
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
