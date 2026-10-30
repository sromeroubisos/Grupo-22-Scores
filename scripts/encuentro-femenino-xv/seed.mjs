/**
 * Carga las listas de buena fe del Encuentro Femenino de Selecciones de XV 2026.
 *
 *   node scripts/encuentro-femenino-xv/seed.mjs --plan
 *   node scripts/encuentro-femenino-xv/seed.mjs --execute
 *
 * La convocatoria es una membresía de `team_memberships` del club de selección
 * (`alto-valle-femenino`…), con el plazo en `joined_at`/`left_at`. La ficha
 * (`people`) se reusa si hay una con el nombre completo idéntico (plegado, sin
 * tildes) y NO contradice la fecha de nacimiento; si no, se crea colgando del
 * club de selección. A las reusadas se les completan DNI, nacimiento y género
 * solo donde estén vacíos.
 *
 * Idempotente: la convocatoria de este plazo se reemplaza, no se suma.
 */
import fs from 'node:fs';
import path from 'node:path';

import { PLANTELES, PLAZO } from './datos.mjs';

const REPO = process.cwd();
const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

const env = { ...process.env };
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

async function leer(recurso) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
async function escribir(metodo, recurso, cuerpo, devolver = false) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: metodo,
    headers: { ...H, 'content-type': 'application/json', prefer: devolver ? 'return=representation' : 'return=minimal' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`${metodo} ${recurso}: ${res.status} ${(await res.text()).slice(0, 400)}`);
  return devolver ? res.json() : null;
}

const plegar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** ILIKE del nombre completo sin depender de tildes: vocal = comodín, sin `*` a los costados. */
const patronNombre = (completo) => plegar(completo).replace(/[aeiou]/g, '_').replace(/ /g, '_');

async function resolver(j) {
  const completo = `${j.nombre} ${j.apellido}`;
  const clave = plegar(completo);
  const patron = patronNombre(completo);
  const filas = await leer(`people?select=id,full_name,name,club_id,birth_date,id_number,gender,created_at&or=(full_name.ilike.${patron},name.ilike.${patron})&order=created_at&limit=1000`);
  const mismas = filas.filter((p) => plegar(p.full_name || p.name || '') === clave);
  const exacta = mismas.filter((p) => p.birth_date === j.nacimiento);
  const sinFecha = mismas.filter((p) => !p.birth_date);
  const existente = exacta[0] ?? sinFecha[0] ?? null;
  const dudosas = mismas.filter((p) => p !== existente);
  return { j, completo, existente, dudosas, reusada: Boolean(existente) };
}

async function main() {
  console.log(`modo: ${modo}\n`);
  const clubes = Object.keys(PLANTELES);
  const ok = new Set((await leer(`clubs?select=id&id=in.(${clubes.join(',')})`)).map((c) => c.id));
  const faltan = clubes.filter((c) => !ok.has(c));
  if (faltan.length) throw new Error(`clubes de selección inexistentes: ${faltan.join(', ')}`);

  const resultado = {};
  for (const club of clubes) {
    resultado[club] = [];
    for (const j of PLANTELES[club]) resultado[club].push(await resolver(j));
    const r = resultado[club];
    console.log(`${club}: ${r.length} · reusa ${r.filter((x) => x.reusada).length} · nuevas ${r.filter((x) => !x.reusada).length}`);
    for (const x of r) {
      if (x.reusada) console.log(`   = ${x.completo.padEnd(38)} ${x.existente.id.slice(0, 8)} (${x.existente.club_id})`);
      for (const d of x.dudosas) console.log(`   ? ${x.completo.padEnd(38)} homónima NO tomada ${d.id.slice(0, 8)} (${d.club_id}, nac ${d.birth_date ?? '—'})`);
    }
  }
  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  for (const club of clubes) {
    const r = resultado[club];
    const nuevas = r.filter((x) => !x.reusada);
    if (nuevas.length) {
      const creadas = await escribir('POST', 'people?select=id,full_name', nuevas.map((x) => ({
        club_id: club,
        first_name: x.j.nombre,
        last_name: x.j.apellido,
        full_name: x.completo,
        name: x.completo,
        id_number: x.j.dni,
        doc_country: 'AR',
        birth_date: x.j.nacimiento,
        gender: 'F',
        position: x.j.posicion,
        role: 'player',
        status: 'active',
        source: 'quick-squad',
      })), true);
      for (const c of creadas) {
        const x = nuevas.find((n) => n.completo === c.full_name && !n.existente);
        if (x) x.existente = c;
      }
    }
    for (const x of r.filter((y) => y.reusada)) {
      const e = x.existente;
      const parche = {};
      if (!e.birth_date) parche.birth_date = x.j.nacimiento;
      if (!e.id_number) parche.id_number = x.j.dni;
      if (!e.gender) parche.gender = 'F';
      if (Object.keys(parche).length) await escribir('PATCH', `people?id=eq.${e.id}`, parche);
    }
    await escribir('DELETE', `team_memberships?club_id=eq.${club}&joined_at=eq.${PLAZO.desde}&left_at=eq.${PLAZO.hasta}`);
    await escribir('POST', 'team_memberships', r.map((x) => ({
      club_id: club,
      person_id: x.existente.id,
      role: 'player',
      status: 'active',
      position: x.j.posicion,
      jersey_number: null,
      joined_at: PLAZO.desde,
      left_at: PLAZO.hasta,
      notes: x.j.clubTexto,
    })));
    console.log(`✓ ${club}: ${r.length} convocadas (${nuevas.length} fichas nuevas)`);
  }
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
