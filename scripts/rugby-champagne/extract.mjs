// Rugby Champagne (rugbychampagneweb.com): cronología de partidos -> extract/2026.json
//
// Solo extrae. No toca la base. El sitio es Astro con render de servidor: los
// fixtures salen de /estadisticas/fixtures?campeonato=<id> y cada cronología
// de /partido/<id> (<li class="match-timeline__item ...">). No hay API.
//
//   node scripts/rugby-champagne/extract.mjs            # las 8 competiciones
//   node scripts/rugby-champagne/extract.mjs 27 73      # solo esos campeonatos
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.rugbychampagneweb.com';
const AQUI = dirname(fileURLToPath(import.meta.url));

// campeonato (query del sitio) -> torneo nuestro. Solo lo que nos interesa.
export const CAMPEONATOS = {
  27: { sitio: 'URBA Top 14 2026', torneoIds: ['d29703d0-125c-44a1-ab38-137450935a6e'] },
  19: { sitio: 'URBA Primera A 2026', torneoIds: ['e5c74c61-ff94-4091-9773-ec7303088fdc'] },
  20: { sitio: 'URBA Primera B 2026', torneoIds: ['797e1b94-6397-4d73-a676-c166e40be5a9'] },
  22: { sitio: 'URBA Segunda División 2026', torneoIds: ['6c91c204-f5d7-4d10-9f10-0b3171c5501b'] },
  24: { sitio: 'URBA Desarrollo 2026', torneoIds: ['e0e20e06-8c98-4804-9edc-2cc978b7da56', '2554d14f-105f-468d-99eb-0af2dd28545d'] },
  30: { sitio: 'Torneo del Interior A 2026', torneoIds: ['ed986d61-7389-48e5-b478-c1703b0e8379'] },
  31: { sitio: 'Torneo del Interior B 2026', torneoIds: ['e2712855-36f4-4363-978e-5036af5c5449'] },
  73: { sitio: 'Súper Rugby Américas 2026', torneoIds: ['f76e47e2-5f9c-4f39-8f06-f6137f5a2846'] },
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(ruta) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(BASE + ruta, { headers: { 'User-Agent': 'Mozilla/5.0 (G22 Scores)' } });
      if (r.ok) return await r.text();
    } catch {
      /* reintenta */
    }
    await dormir(1500);
  }
  return null;
}

const ent = (s) =>
  s
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
const txt = (s) =>
  ent(s.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const pick = (s, re) => {
  const m = s.match(re);
  return m ? txt(m[1]) : null;
};

export function parseFixtures(h) {
  const out = [];
  for (const sec of h.match(/<section aria-labelledby="statistics-round-\d+">[\s\S]*?<\/section>/g) ?? []) {
    const ronda = pick(sec, /round__title[^>]*>([\s\S]*?)</);
    for (const card of sec.split('<div class="statistics-round__card"').slice(1)) {
      const id = card.match(/\/partido\/(\d+)/)?.[1];
      if (!id) continue;
      const nombres = [...card.matchAll(/team-name[^>]*>([\s\S]*?)<\/(?:span|div|p)/g)].map((m) => txt(m[1]));
      const goles = [...card.matchAll(/round__score[^>]*>([\s\S]*?)<\/(?:span|div|p)/g)].map((m) => txt(m[1]));
      out.push({
        id: Number(id),
        ronda,
        local: nombres[0] ?? null,
        visitante: nombres[1] ?? null,
        marcador: goles.map((g) => (/^\d+$/.test(g) ? Number(g) : null)),
        estado: pick(card, /round__status[^>]*>([\s\S]*?)</),
        fecha: card.match(/dateTime="(\d{4}-\d{2}-\d{2})/)?.[1] ?? null,
      });
    }
  }
  return out;
}

export function parseCronologia(h) {
  const eventos = [];
  for (const li of h.match(/<li class="match-timeline__item[^"]*"[^>]*>[\s\S]*?<\/li>/g) ?? []) {
    const cls = li.match(/class="([^"]*)"/)[1];
    if (cls.includes('milestone')) {
      eventos.push({ hito: txt(li) });
      continue;
    }
    const campo = (k) => pick(li, new RegExp(`match-timeline__${k}[^>]*>([\\s\\S]*?)</`));
    const minuto = campo('time')?.match(/\d+/)?.[0];
    const puntos = campo('points')?.match(/\d+/)?.[0];
    const [mLocal, mVisit] = (campo('score') ?? '').match(/\d+/g) ?? [];
    eventos.push({
      lado: cls.includes('--home') ? 'local' : cls.includes('--away') ? 'visitante' : null,
      tipo: campo('event'),
      puntos: puntos ? Number(puntos) : null,
      jugador: campo('player'),
      minuto: minuto ? Number(minuto) : null,
      marcador: mLocal === undefined ? null : [Number(mLocal), Number(mVisit)],
    });
  }
  return eventos;
}

async function enLote(items, n, fn) {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        res[k] = await fn(items[k]);
        await dormir(150);
      }
    }),
  );
  return res;
}

async function main() {
  const pedidos = process.argv.slice(2).map(Number);
  const ids = pedidos.length ? pedidos : Object.keys(CAMPEONATOS).map(Number);
  const salida = {};
  for (const c of ids) {
    const def = CAMPEONATOS[c];
    if (!def) throw new Error(`campeonato ${c} no está en CAMPEONATOS`);
    const h = await get(`/estadisticas/fixtures?campeonato=${c}`);
    if (!h) throw new Error(`no pude bajar los fixtures de ${c}`);
    const partidos = parseFixtures(h);
    const jugados = partidos.filter((p) => p.estado === 'Finalizado');
    const crono = await enLote(jugados, 4, async (p) => {
      const ph = await get(`/partido/${p.id}`);
      return ph ? parseCronologia(ph) : null;
    });
    jugados.forEach((p, i) => {
      p.cronologia = crono[i];
    });
    salida[c] = { ...def, partidos };
    const con = jugados.filter((p) => p.cronologia?.some((e) => e.tipo)).length;
    console.log(`${c} ${def.sitio}: ${partidos.length} partidos, ${jugados.length} jugados, ${con} con cronología`);
  }
  const dir = join(AQUI, 'extract');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '2026.json'), JSON.stringify(salida, null, 1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
