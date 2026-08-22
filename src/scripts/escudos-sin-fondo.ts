/**
 * Le saca el fondo blanco a los escudos de club y los deja en PNG con alfa.
 *
 *   npx tsx src/scripts/escudos-sin-fondo.ts --proveedor=arusa --plan
 *   npx tsx src/scripts/escudos-sin-fondo.ts --proveedor=arusa --execute
 *   npx tsx src/scripts/escudos-sin-fondo.ts --clubes=trapiales-rc,old-green-rc --plan
 *
 * De dónde viene el problema: Leverade publica el avatar de cada equipo como
 * JPEG, y el JPEG no tiene canal alfa. `arusa-crear-torneo.ts` lo sube tal cual,
 * así que el escudo llega con un rectángulo blanco pegado — invisible sobre
 * fondo claro y un cartel sobre el tema oscuro, que es el de la portada.
 *
 * ── Por qué relleno desde el borde y no "todo lo blanco" ─────────────────────
 * Un escudo tiene blanco ADENTRO: las letras de Old Green, el campo del de
 * Alumni. Cambiar todos los píxeles blancos a transparentes los agujerea. Lo
 * que se saca es lo que está CONECTADO al borde de la imagen, que es el fondo y
 * nada más que el fondo.
 *
 * ── El contorno ──────────────────────────────────────────────────────────────
 * El borde del dibujo viene mezclado con el blanco de atrás (antialias, más el
 * ringing del JPEG). Cortado en seco queda un halo claro alrededor de cada
 * escudo. Por eso los píxeles que tocan el fondo y siguen siendo claros se
 * vuelven PARCIALMENTE transparentes y se les devuelve el color puro: si un
 * píxel es `c` mezclado sobre blanco con opacidad `a`, el color original es
 * `(c - 255·(1-a)) / a`. Sin ese despeje el contorno queda lavado.
 *
 * No toca el que no tiene fondo blanco: el de Escuela Militar lo tiene negro y
 * texturado, y los que ya son PNG con alfa se saltean solos.
 */
import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

const REPO = process.cwd();

const envFile = path.join(REPO, '.env.local');
if (fs.existsSync(envFile)) {
    for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
}
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error('Faltan credenciales de Supabase');
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const modo = process.argv.includes('--execute') ? 'execute'
    : process.argv.includes('--plan') ? 'plan' : null;
const PROVEEDOR = arg('proveedor');
const CLUBES = arg('clubes')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;

if (!modo || (!PROVEEDOR && !CLUBES)) {
    console.error('uso: escudos-sin-fondo.ts (--proveedor=<p> | --clubes=a,b) --plan|--execute');
    process.exit(2);
}

/** Un píxel es fondo si sus tres canales pasan esto. Deja pasar el ruido del JPEG. */
const FONDO = 240;
/** Y es contorno —borde mezclado con el fondo— si pasa esto sin llegar a fondo. */
const CONTORNO = 195;
/** El borde de la imagen tiene que ser blanco al menos en esta proporción. */
const MINIMO_DE_BORDE = 0.85;

interface Club { id: string; name: string; logo_url: string | null }

async function rest<T>(recurso: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${URL_BASE}/rest/v1/${recurso}`, { ...init, headers: { ...H, ...(init?.headers ?? {}) } });
    if (!res.ok) throw new Error(`${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 ? (null as T) : await res.json() as T;
}

async function bytesDe(url: string): Promise<Buffer> {
    if (url.startsWith('data:')) return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
}

type Resultado =
    | { estado: 'recortado'; png: Buffer; fondo: number; contorno: number; total: number }
    | { estado: 'sin fondo blanco' | 'ya transparente' };

async function sacarFondo(bytes: Buffer): Promise<Resultado> {
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels: ch } = info;
    const px = new Uint8ClampedArray(data);
    const idx = (x: number, y: number) => (y * w + x) * ch;
    const minCanal = (i: number) => Math.min(px[i], px[i + 1], px[i + 2]);

    // ¿Vale la pena? El borde de la imagen tiene que ser blanco opaco.
    let borde = 0; let blanco = 0; let transparente = 0;
    const mirarBorde = (x: number, y: number) => {
        const i = idx(x, y); borde += 1;
        if (px[i + 3] < 32) transparente += 1;
        else if (minCanal(i) >= FONDO) blanco += 1;
    };
    for (let x = 0; x < w; x++) { mirarBorde(x, 0); mirarBorde(x, h - 1); }
    for (let y = 0; y < h; y++) { mirarBorde(0, y); mirarBorde(w - 1, y); }
    if (transparente / borde > MINIMO_DE_BORDE) return { estado: 'ya transparente' };
    if (blanco / borde < MINIMO_DE_BORDE) return { estado: 'sin fondo blanco' };

    // Relleno por inundación desde el borde: sólo se va lo CONECTADO al afuera.
    const esFondo = new Uint8Array(w * h);
    const cola: number[] = [];
    const encolar = (x: number, y: number) => {
        const p = y * w + x;
        if (esFondo[p]) return;
        const i = p * ch;
        if (px[i + 3] < 32 || minCanal(i) >= FONDO) { esFondo[p] = 1; cola.push(p); }
    };
    for (let x = 0; x < w; x++) { encolar(x, 0); encolar(x, h - 1); }
    for (let y = 0; y < h; y++) { encolar(0, y); encolar(w - 1, y); }
    for (let c = 0; c < cola.length; c++) {
        const p = cola[c]; const x = p % w; const y = (p - x) / w;
        if (x > 0) encolar(x - 1, y);
        if (x < w - 1) encolar(x + 1, y);
        if (y > 0) encolar(x, y - 1);
        if (y < h - 1) encolar(x, y + 1);
    }

    // El contorno: lo que TOCA el fondo y todavía es claro. Dos anillos alcanzan;
    // más adentro ya es dibujo, y lavarlo sería peor que el halo.
    const esContorno = new Uint8Array(w * h);
    let tocados = 0;
    let frente = new Uint8Array(esFondo);
    for (let anillo = 0; anillo < 2; anillo++) {
        const siguiente = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const p = y * w + x;
                if (esFondo[p] || esContorno[p]) continue;
                const vecino = (x > 0 && frente[p - 1]) || (x < w - 1 && frente[p + 1])
                    || (y > 0 && frente[p - w]) || (y < h - 1 && frente[p + w]);
                if (!vecino) continue;
                const i = p * ch;
                if (px[i + 3] < 32 || minCanal(i) < CONTORNO) continue;
                esContorno[p] = 1; siguiente[p] = 1; tocados += 1;
            }
        }
        frente = siguiente;
    }

    let sacados = 0;
    for (let p = 0; p < w * h; p++) {
        const i = p * ch;
        if (esFondo[p]) { px[i + 3] = 0; sacados += 1; continue; }
        if (!esContorno[p]) continue;
        // Opacidad real del píxel y despeje del blanco de atrás.
        const a = (255 - minCanal(i)) / (255 - CONTORNO);
        if (a >= 1) continue;
        const alfa = Math.round(a * px[i + 3]);
        if (alfa <= 0) { px[i + 3] = 0; sacados += 1; continue; }
        for (let k = 0; k < 3; k++) {
            px[i + k] = Math.max(0, Math.min(255, Math.round((px[i + k] - 255 * (1 - a)) / a)));
        }
        px[i + 3] = alfa;
    }

    const png = await sharp(Buffer.from(px), { raw: { width: w, height: h, channels: ch as 4 } })
        .png({ compressionLevel: 9 }).toBuffer();
    return { estado: 'recortado', png, fondo: sacados, contorno: tocados, total: w * h };
}

async function main() {
    let ids = CLUBES;
    if (!ids) {
        const mapa = await rest<{ club_id: string }[]>(
            `club_external_ids?select=club_id&provider=eq.${encodeURIComponent(PROVEEDOR!)}`);
        ids = [...new Set(mapa.map((m) => m.club_id))];
    }

    const clubes: Club[] = [];
    for (let i = 0; i < ids.length; i += 80) {
        clubes.push(...await rest<Club[]>(
            `clubs?select=id,name,logo_url&id=in.(${ids.slice(i, i + 80).map(encodeURIComponent).join(',')})&order=id`));
    }
    console.log(`clubes ${clubes.length} · modo ${modo}\n`);

    const cuenta: Record<string, number> = {};
    const persistClubLogo = modo === 'execute'
        ? (await import('@/lib/server/persistClubLogo')).persistClubLogo
        : null;

    for (const club of clubes) {
        if (!club.logo_url) { cuenta['sin logo'] = (cuenta['sin logo'] ?? 0) + 1; continue; }
        let r: Resultado;
        try {
            r = await sacarFondo(await bytesDe(club.logo_url));
        } catch (e) {
            cuenta['error'] = (cuenta['error'] ?? 0) + 1;
            console.log(`  !!  ${club.id.padEnd(32)} ${(e as Error).message}`);
            continue;
        }

        cuenta[r.estado] = (cuenta[r.estado] ?? 0) + 1;
        if (r.estado !== 'recortado') continue;

        const pct = (r.fondo / r.total * 100).toFixed(0);
        console.log(`  ${modo === 'plan' ? '··' : '->'}  ${club.id.padEnd(32)} fondo ${pct.padStart(3)}% · contorno ${String(r.contorno).padStart(5)} px`);
        if (!persistClubLogo) continue;

        const dataUri = `data:image/png;base64,${r.png.toString('base64')}`;
        const subido = await persistClubLogo(club.id, dataUri);
        if (subido.origin !== 'storage' || !subido.url) {
            throw new Error(`${club.id}: el escudo no llegó a Storage (${subido.warning ?? subido.origin})`);
        }
        await rest(`clubs?id=eq.${encodeURIComponent(club.id)}`, {
            method: 'PATCH', headers: { prefer: 'return=minimal' },
            body: JSON.stringify({ logo_url: subido.url }),
        });
    }

    console.log(`\n${Object.entries(cuenta).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    if (modo === 'plan') console.log('(plan: no se escribió nada)');
}

main().catch((err) => { console.error(err); process.exit(1); });
