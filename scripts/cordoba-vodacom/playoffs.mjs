// Junta "Semifinales" y "Final" en UNA fase "Playoffs" con llaves del constructor (codigos, origen de cada lado y reglas de avance).
import fs from 'node:fs';
import crypto from 'node:crypto';
const e = {}; for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) e[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); }
const H = { apikey: e.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json', prefer: 'return=representation' };
const U = `${e.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
const call = async (method, p, body) => { const r = await fetch(U + p, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${await r.text()}`); return r.json(); };
const T = '0bee851d-fc17-4dde-9214-06c8eab0eb40';
const fases = await call('GET', `tournament_phases?select=id,name,settings,order_index&tournament_id=eq.${T}&order=order_index`);
const semis = fases.find((f) => f.name === 'Semifinales'), fin = fases.find((f) => f.name === 'Final');
if (!semis || !fin) throw new Error('ya está reorganizado');
const sm = await call('GET', `matches?select=id,home_club_id,away_club_id&phase_id=eq.${semis.id}`);
const fm = (await call('GET', `matches?select=id,round_uuid&phase_id=eq.${fin.id}`))[0];
const sf1 = sm.find((m) => m.home_club_id === 'jockey-club-cordoba-intermedia'), sf2 = sm.find((m) => m !== sf1);
console.log({ sf1, sf2, fm });
const upd = (id, d) => call('PATCH', `matches?id=eq.${id}`, d);
const std = (p) => ({ type: 'standing', position: p });
await upd(sf1.id, { bracket_match_code: 'SF1', home_source_label: '1º Campeonato', away_source_label: '3º Campeonato', participant_source: { home: std(1), away: std(3) }, notes: 'SF1 · Semifinal 1' });
await upd(sf2.id, { bracket_match_code: 'SF2', home_source_label: '2º Campeonato', away_source_label: '4º Campeonato', participant_source: { home: std(2), away: std(4) }, notes: 'SF2 · Semifinal 2' });
await upd(fm.id, { phase_id: semis.id, bracket_match_code: 'FINAL', home_source_label: 'Ganador SF2', away_source_label: 'Ganador SF1', participant_source: { home: { type: 'winner', ref: 'SF2' }, away: { type: 'winner', ref: 'SF1' } }, notes: 'FINAL · Final' });
await call('PATCH', `tournament_rounds?id=eq.${fm.round_uuid}`, { phase_id: semis.id, order_index: 2 });
await call('POST', 'tournament_match_advancement_rules', [
  { id: crypto.randomUUID(), phase_id: semis.id, source_match_id: sf2.id, outcome: 'winner', target_match_id: fm.id, target_slot: 'home', target_group_id: null },
  { id: crypto.randomUUID(), phase_id: semis.id, source_match_id: sf1.id, outcome: 'winner', target_match_id: fm.id, target_slot: 'away', target_group_id: null },
]);
// los 4 que juegan la fase = los de las semis
const equipos = sm.flatMap((m) => [m.home_club_id, m.away_club_id]);
const pp = await call('GET', `tournament_phase_participants?select=id,participant_id&phase_id=eq.${fin.id}`);
await call('DELETE', `tournament_phase_participants?phase_id=eq.${fin.id}`);
console.log('equipos de la fase', equipos.length, 'participantes de Final descartados', pp.length);
await call('DELETE', `tournament_phases?id=eq.${fin.id}`);
await call('PATCH', `tournament_phases?id=eq.${semis.id}`, { name: 'Playoffs', settings: { ...semis.settings, phaseMode: 'playoff', bracketMode: 'auto', advanceCount: 1, teamsCount: 4, playoffStages: [
  { id: 'playoff_stage_1', name: 'Semifinal', orderIndex: 1, matchCount: 2 }, { id: 'playoff_stage_2', name: 'Final', orderIndex: 2, matchCount: 1 }] } });
console.log('listo');
