/**
 * Presentacion de un evento de partido: como se llama, de que color es y con
 * que icono se dibuja. Vive aparte de la cronologia porque la vision general
 * muestra los ultimos sucesos y tiene que decir lo mismo: sin esto el resumen
 * escribia el tipo crudo ("penalty_goal", "card_red") sobre una pantalla en
 * castellano mientras la pestana de al lado ya lo traducia.
 */
import React from 'react';
import { isGoalKickAttemptEvent } from '@/lib/matchEventStats';

export const TYPE_LABELS: Record<string, string> = {
  try: 'Try',
  penalty_try: 'Penalty Try',
  conversion: 'Conversion',
  penalty: 'Penal',
  penalty_goal: 'Penal a los palos',
  drop_goal: 'Drop',
  goal: 'Gol',
  own_goal: 'Gol en contra',
  yellow_card: 'Tarjeta amarilla',
  red_card: 'Tarjeta roja',
  card_yellow: 'Tarjeta amarilla',
  card_red: 'Tarjeta roja',
  substitution: 'Cambio',
  kick: 'Patada',
  line: 'Line',
  scrum: 'Scrum',
  tackle: 'Tackle',
  penalty_committed: 'Penal cometido',
  knock_on: 'Knock-on',
  forward_pass: 'Pase forward',
  handling_error: 'Error de manejo',
  turnover_lost: 'Turnover perdido',
  turnover_won: 'Turnover ganado',
  ruck: 'Ruck',
  maul: 'Maul',
  recovery: 'Recuperacion',
  entradas_22: 'Entradas en 22',
  pass: 'Pase',
  injury: 'Lesion',
  free_kick: 'Free Kick',
  foul: 'Falta',
  match_start: 'Inicio del partido',
  match_half: 'Entretiempo',
  match_end: 'Final del partido',
  start_period: 'Inicio de periodo',
  end_period: 'Fin de periodo',
  touchdown: 'Touchdown',
  field_goal: 'Field goal',
  extra_point: 'Punto extra',
  two_point_conversion: 'Conversion de 2',
  safety: 'Safety',
  // Futbol americano. Sin estas el fallback escribe "Pass Complete" y
  // "Turnover On Downs" en una pantalla en castellano.
  rush: 'Carrera',
  pass_complete: 'Pase completo',
  pass_incomplete: 'Pase incompleto',
  first_down: 'Primer down',
  sack: 'Sack',
  interception: 'Intercepcion',
  forced_fumble: 'Fumble forzado',
  fumble: 'Fumble',
  turnover_on_downs: 'Perdida en downs',
  punt: 'Punt',
  kickoff: 'Kickoff',
  touchback: 'Touchback',
  // Flag: sin estas la cronologia publica escribe "Flag Pull For Loss".
  flag_pull: 'Flag pull',
  flag_pull_for_loss: 'Flag pull con perdida',
  pass_defended: 'Pase defendido',
  blitz: 'Blitz',
  run: 'Carrera',
  home_run: 'Home run',
  point: 'Punto',
  ace: 'Ace',
  block_point: 'Bloqueo',
  seven_meter_goal: 'Gol de 7m',
  // Handball. Sin estas el fallback escribe "Seven Meter" y "Two Min
  // Suspension" sobre una pantalla en castellano.
  seven_meter: 'Lanzamiento de 7m',
  seven_meter_miss: '7m errado',
  shot: 'Lanzamiento sin gol',
  steal: 'Robo',
  two_min_suspension: 'Suspensión 2 min',
  blue_card: 'Tarjeta azul',
  official_timeout: 'Tiempo muerto del árbitro',
  // Hockey y handball comparten la definicion fuera del partido.
  shootout_start: 'Inicio de la definición',
  shootout_scored: 'Definición: convertido',
  shootout_missed: 'Definición: fallado',
  shootout_end: 'Fin de la definición',
  // Hockey. Sin estas dos entradas el fallback prettifica el tipo y escribe
  // "Penalty Corner" sobre una pantalla en castellano.
  penalty_corner: 'Corner corto',
  penalty_stroke: 'Penal',
  free_throw: 'Tiro libre',
  two_pointer: 'Doble',
  three_pointer: 'Triple',
  timeout: 'Tiempo muerto',
  green_card: 'Tarjeta verde',
};

export const EVENT_COLORS: Record<string, string> = {
  try: '#22c55e',
  goal: '#22c55e',
  touchdown: '#22c55e',
  point: '#22c55e',
  ace: '#22c55e',
  block_point: '#22c55e',
  run: '#22c55e',
  home_run: '#22c55e',
  conversion: '#3b82f6',
  // El corner corto es jugada fija, no anotacion: el azul lo separa del gol
  // verde sin bajarlo al gris de los eventos neutros.
  penalty_corner: '#3b82f6',
  penalty_stroke: '#3b82f6',
  penalty_goal: '#3b82f6',
  drop_goal: '#3b82f6',
  penalty: '#3b82f6',
  field_goal: '#3b82f6',
  extra_point: '#3b82f6',
  two_point_conversion: '#3b82f6',
  safety: '#22c55e',
  // Lo que pierde la posesion va en rojo, como el turnover del rugby.
  interception: '#f43f5e',
  fumble: '#f43f5e',
  turnover_on_downs: '#f43f5e',
  sack: '#f97316',
  forced_fumble: '#f97316',
  first_down: '#60a5fa',
  rush: '#9ca3af',
  pass_complete: '#9ca3af',
  pass_incomplete: '#9ca3af',
  punt: '#9ca3af',
  kickoff: '#9ca3af',
  touchback: '#9ca3af',
  kick: '#60a5fa',
  free_kick: '#60a5fa',
  penalty_committed: '#f43f5e',
  foul: '#f43f5e',
  knock_on: '#f43f5e',
  forward_pass: '#f43f5e',
  handling_error: '#f43f5e',
  turnover_lost: '#f43f5e',
  yellow_card: '#eab308',
  card_yellow: '#eab308',
  green_card: '#22c55e',
  red_card: '#ef4444',
  card_red: '#ef4444',
  substitution: '#8b5cf6',
  line: '#9ca3af',
  scrum: '#9ca3af',
  tackle: '#9ca3af',
  ruck: '#9ca3af',
  maul: '#9ca3af',
  recovery: '#9ca3af',
  entradas_22: '#9ca3af',
  pass: '#9ca3af',
  injury: '#f97316',
  timeout: '#9ca3af',
  // Handball. El 7 metros es jugada fija, como el corner corto: azul. La
  // exclusion de 2 minutos no es tarjeta pero si sancion: naranja.
  seven_meter: '#3b82f6',
  seven_meter_goal: '#3b82f6',
  shot: '#9ca3af',
  steal: '#f97316',
  two_min_suspension: '#f97316',
  blue_card: '#2563eb',
  official_timeout: '#9ca3af',
  shootout_scored: '#22c55e',
  shootout_missed: '#9ca3af',
  match_start: '#9ca3af',
  match_half: '#9ca3af',
  match_end: '#9ca3af',
  start_period: '#9ca3af',
  end_period: '#9ca3af',
  // El llamador cae aca cuando el tipo no esta en la tabla.
  default: '#9ca3af',
};

export function labelForType(type: string): string {
  return TYPE_LABELS[type.toLowerCase()] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function cleanDescription(desc: string, type: string): string {
  let cleaned = String(desc || '')
    .replace(/\[palos:(ok|miss)\]/gi, '')
    // Desenlace de un corner corto / penal stroke: el rotulo ya viene al lado.
    .replace(/\[res:[a-z0-9_-]+\]\s*/gi, '')
    .replace(/\[temporal\]\s*/gi, '')
    .replace(/^Dist:\s*/i, '')
    .trim();

  if (!cleaned) return '';

  const t = type.toLowerCase();
  if (t === 'substitution' && cleaned.toLowerCase().startsWith('entra:')) {
    return cleaned;
  }

  // For goal-kick attempts, append outcome from the original description
  if (isGoalKickAttemptEvent({ type, detail: desc })) {
    const raw = String(desc || '').toLowerCase();
    if (/fallad[ao]|errad[ao]|erró|falló|no convert|\bmissed\b/.test(raw) || /\[palos:miss\]/i.test(String(desc || ''))) {
      cleaned = cleaned ? `${cleaned} · fallada` : 'Fallada';
    } else if (/convertid|acertad|made|\bok\b/.test(raw) || /\[palos:ok\]/i.test(String(desc || ''))) {
      cleaned = cleaned ? `${cleaned} · acertada` : 'Acertada';
    }
  }

  return cleaned;
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function IconTry({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <ellipse cx="12" cy="12" rx="10" ry="6" />
      <line x1="8" y1="9" x2="8" y2="15" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />
      <line x1="16" y1="9" x2="16" y2="15" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />
    </svg>
  );
}

function IconGoal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function IconConversion({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 18V6M18 18V6M6 6h12" />
      <circle cx="12" cy="10" r="2" fill="currentColor" />
    </svg>
  );
}

function IconPenalty({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

function IconDropGoal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 4v10M9 7l3-3 3 3" />
      <circle cx="12" cy="16" r="3" fill="currentColor" />
    </svg>
  );
}

function IconCardYellow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <rect x="5" y="3" width="14" height="18" rx="2" />
    </svg>
  );
}

function IconCardRed({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <rect x="5" y="3" width="14" height="18" rx="2" />
    </svg>
  );
}

function IconSubstitution({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 3l5 5-5 5M8 21l-5-5 5-5" />
      <path d="M21 8h-8M3 16h8" />
    </svg>
  );
}

function IconLine({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="20" x2="20" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <circle cx="12" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

function IconScrum({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="12" r="4" />
      <circle cx="15" cy="12" r="4" />
      <path d="M9 16v4M15 16v4" />
    </svg>
  );
}

function IconKick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 16c0-2 2-4 5-4h6c3 0 5 2 5 4v2H4z" fill="currentColor" />
      <path d="M9 12V8a3 3 0 013-3" />
    </svg>
  );
}

function IconTackle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3" />
      <circle cx="15" cy="8" r="3" />
      <path d="M7 12l-2 6M17 12l2 6M9 12l3 4 3-4" />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function IconDefault({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

export function EventTypeIcon({ type, className }: { type: string; className?: string }) {
  const t = type.toLowerCase();
  if (t.includes('try')) return <IconTry className={className} />;
  if (t === 'goal' || t === 'own_goal' || t === 'point' || t === 'ace' || t === 'block_point') return <IconGoal className={className} />;
  if (t === 'touchdown' || t === 'run' || t === 'home_run') return <IconGoal className={className} />;
  if (t === 'conversion') return <IconConversion className={className} />;
  if ((t === 'penalty' || t === 'penalty_goal') && !t.includes('conceded') && !t.includes('won')) return <IconPenalty className={className} />;
  if (t === 'drop_goal') return <IconDropGoal className={className} />;
  if (t === 'field_goal') return <IconPenalty className={className} />;
  if (t.includes('yellow') || t === 'card_yellow') return <IconCardYellow className={className} />;
  if (t.includes('red') || t === 'card_red') return <IconCardRed className={className} />;
  if (t.includes('green') || t === 'green_card') return <IconCardYellow className={className} />;
  if (t.includes('subst')) return <IconSubstitution className={className} />;
  if (t.includes('line')) return <IconLine className={className} />;
  if (t.includes('scrum')) return <IconScrum className={className} />;
  if (t.includes('kick') || t === 'free_kick') return <IconKick className={className} />;
  if (t.includes('tackle')) return <IconTackle className={className} />;
  if (t.includes('match_') || t.includes('period') || t.includes('timeout')) return <IconClock className={className} />;
  return <IconDefault className={className} />;
}
