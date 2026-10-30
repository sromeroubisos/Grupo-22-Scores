// Cruza planilla.json contra la base (liga-desarrollo-*) por club (alias) + fecha. Informa lo que falta, sobra o difiere.
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY };
const get = async (p) => (await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/' + p, { headers: H })).json();
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
(async () => {
  const plan = JSON.parse(fs.readFileSync(__dirname + '/planilla.json', 'utf8'));
  const ts = await get('tournaments?select=id,slug&slug=in.(liga-desarrollo-capital-este,liga-desarrollo-sur-centro)');
  const ms = await get('matches?select=id,tournament_id,date_time,home_club_id,away_club_id,status,score,round_label,phase_id&limit=1000&tournament_id=in.(' + ts.map((t) => t.id).join(',') + ')');
  const cl = await get('clubs?select=id,name&id=in.(' + [...new Set(ms.flatMap((m) => [m.home_club_id, m.away_club_id]))].join(',') + ')');
  const nombre = Object.fromEntries(cl.map((c) => [c.id, c.name]));
  const ids = cl.map((c) => c.id);
  const ALIAS = JSON.parse(fs.readFileSync(__dirname + '/alias.json', 'utf8'));
  const resolver = (n) => {
    const k = norm(n);
    if (ALIAS[k]) return ALIAS[k];
    const ex = ids.filter((i) => norm(nombre[i]) === k || norm(i) === k);
    return ex[0] || null;
  };
  const sinClub = new Set();
  const ART = (s) => { const [d, t] = s.split(' '); const [dd, mm, yy] = d.split('/'); return `${yy}-${mm}-${dd}`; };
  const key = (a, b) => [a, b].sort().join('~');
  const usados = new Set(); const falta = []; const dif = [];
  for (const p of plan) {
    if (/Amistosos/i.test(p.inst)) continue;
    const t = ts.find((x) => x.slug === (/CAPITAL/.test(p.torneo) ? 'liga-desarrollo-capital-este' : 'liga-desarrollo-sur-centro'));
    const a = resolver(p.local), b = resolver(p.visit);
    if (!a) sinClub.add(p.local); if (!b) sinClub.add(p.visit);
    if (!a || !b) { falta.push({ p, why: 'club sin resolver' }); continue; }
    // misma pareja en el mismo torneo; si hay varias, la de fecha mas cercana
    const cand = ms.filter((m) => m.tournament_id === t.id && !usados.has(m.id) && key(m.home_club_id, m.away_club_id) === key(a, b));
    const dia = new Date(ART(p.dt) + 'T12:00:00Z').getTime();
    cand.sort((x, y) => Math.abs(new Date(x.date_time) - dia) - Math.abs(new Date(y.date_time) - dia));
    const m = cand[0];
    if (!m) { falta.push({ p, why: 'sin partido en la base' }); continue; }
    usados.add(m.id);
    const [sh, sa] = p.res.split('-').map(Number);
    const cerrado = /^Cerrado/.test(p.estado);
    const dbSc = m.score ? [m.score.home, m.score.away] : [null, null];
    const dDia = new Date(new Date(m.date_time).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
    const orient = m.home_club_id === a;
    const probs = [];
    if (cerrado && m.status !== 'final') probs.push(`estado base=${m.status}, planilla=${p.estado}`);
    if (cerrado && m.status === 'final') { const x = orient ? [sh, sa] : [sa, sh]; if (x[0] !== dbSc[0] || x[1] !== dbSc[1]) probs.push(`marcador planilla ${p.res} vs base ${dbSc.join('-')}${orient ? '' : ' (invertido)'}`); }
    if (!cerrado && m.status === 'final') probs.push(`base final, planilla ${p.estado}`);
    if (dDia !== ART(p.dt)) probs.push(`fecha planilla ${ART(p.dt)} vs base ${dDia}`);
    if (probs.length) dif.push({ id: p.id, par: `${p.local} - ${p.visit}`, ronda: p.ronda, probs, mid: m.id });
  }
  const sobran = ms.filter((m) => !usados.has(m.id));
  console.log('planilla', plan.length, 'base', ms.length, 'cruzados', usados.size);
  console.log('\nCLUBES SIN RESOLVER:', [...sinClub]);
  console.log('\nFALTAN EN LA BASE:'); falta.forEach((f) => console.log(' ', f.p.id, f.p.inst, f.p.ronda, f.p.dt, '|', f.p.local, f.p.res, f.p.visit, '|', f.p.estado, '|', f.why));
  console.log('\nDIFERENCIAS:'); dif.forEach((d) => console.log(' ', d.id, d.ronda, d.par, '->', d.probs.join('; '), d.mid));
  console.log('\nSOBRAN EN LA BASE:'); sobran.forEach((m) => console.log(' ', m.id, m.round_label, m.date_time, nombre[m.home_club_id], m.status, nombre[m.away_club_id]));
})();
