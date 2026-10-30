// Sube extract/load-plan.json a public.stg_rugbychampagne_eventos (tabla de paso).
// NO toca match_events. La carga real es un INSERT ... SELECT desde esa tabla,
// en una sola transacción con el trigger de avisos apagado:
//
//   begin;
//   alter table public.match_events disable trigger trg_g22_notify_team_event;
//   insert into public.match_events (match_id, club_id, player_id, player_name, event_type, minute, details)
//     select s.match_id, s.club_id, s.player_id, s.player_name, s.event_type, s.minute, s.details
//     from public.stg_rugbychampagne_eventos s
//     where not exists (select 1 from public.match_events e where e.match_id = s.match_id)
//     order by s.n;
//   update public.matches m set events_count = c.n
//     from (select match_id, count(*) n from public.stg_rugbychampagne_eventos group by 1) c
//    where m.id = c.match_id and coalesce(m.events_count, 0) = 0;
//   alter table public.match_events enable trigger trg_g22_notify_team_event;
//   commit;
//
// Si algo falla, la transacción entera (el DISABLE también) se deshace; y como
// el ENABLE va antes del COMMIT, ninguna otra sesión ve el trigger apagado.
//
//   node scripts/rugby-champagne/stage.mjs
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');

const env = { ...process.env };
for (const l of readFileSync(join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};
const TABLA = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/stg_rugbychampagne_eventos`;

const plan = JSON.parse(readFileSync(join(AQUI, 'extract', 'load-plan.json'), 'utf8'));
const filas = plan.filas.map(({ match_id, club_id, player_id, player_name, event_type, minute, details }) => ({
  match_id, club_id, player_id, player_name, event_type, minute, details,
}));

// El orden de inserción define la columna `n`: se sube en orden y de a tandas.
for (let i = 0; i < filas.length; i += 500) {
  const r = await fetch(TABLA, { method: 'POST', headers: H, body: JSON.stringify(filas.slice(i, i + 500)) });
  if (!r.ok) throw new Error(`tanda ${i}: ${r.status} ${await r.text()}`);
}
console.log(`subidas ${filas.length} filas de ${plan.partidos.length} partidos`);
