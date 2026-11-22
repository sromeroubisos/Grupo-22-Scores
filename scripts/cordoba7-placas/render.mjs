/**
 * Placas de Córdoba Seven en rojo y blanco: resultado, horarios y tabla de zonas.
 * Cada una sale en historia (1080x1920) y posteo (1080x1350). Fondo de color liso.
 *
 *   node scripts/cordoba7-placas/render.mjs [--ejemplo] [--salida <carpeta>] [--datos <json>]
 *
 * Los datos van en un JSON (ver datos-ejemplo.json): equipos, partidos y zonas.
 * Dibuja HTML y lo saca a PNG con Chrome headless. `--ejemplo` pone una etiqueta
 * "EJEMPLO" en la esquina para que un resultado inventado no se confunda con uno real.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const valor = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const EJEMPLO = args.includes('--ejemplo');
const SALIDA = path.resolve(valor('--salida', path.join(AQUI, 'salida')));
const datos = JSON.parse(fs.readFileSync(path.resolve(valor('--datos', path.join(AQUI, 'datos-ejemplo.json'))), 'utf8'));
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
if (!CHROME) throw new Error('No encontré Chrome ni Edge');

const FORMATOS = { historia: { w: 1080, h: 1920, k: 1 }, posteo: { w: 1080, h: 1350, k: 0.74 } };
const equipo = (id) => datos.equipos[id];
const img = (rel) => pathToFileURL(path.join(AQUI, rel)).href;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function escudo(id, tam, pad = 0.08) {
  const e = equipo(id);
  const inner = e.escudo
    ? `<img src="${img(e.escudo)}" alt="">`
    : `<span class="mono" style="font-size:${Math.round(Math.min(tam.w, tam.h) * 0.42)}px">${esc(e.corto.split(/\s+/).map((p) => p[0]).join('').slice(0, 3))}</span>`;
  return `<div class="tile" style="width:${tam.w}px;height:${tam.h}px;--pad:${Math.round(Math.min(tam.w, tam.h) * pad)}px">${inner}</div>`;
}

const CSS = (f) => `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@500;600;700;800&display=swap');
:root{--rojo:#D1111F;--oscuro:#8C0A14;--blanco:#fff;--k:${f.k}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${f.w}px;height:${f.h}px;background:var(--rojo);overflow:hidden;color:#fff;font-family:'Barlow Condensed','Arial Narrow',sans-serif}
.pag{position:relative;width:${f.w}px;height:${f.h}px;display:flex;flex-direction:column;align-items:center;padding:calc(70px*var(--k)) 70px calc(60px*var(--k))}
.logo{height:calc(230px*var(--k));object-fit:contain}
.anton{font-family:'Anton','Impact',sans-serif;letter-spacing:.01em;text-transform:uppercase}
.tag{font-weight:700;font-size:calc(42px*var(--k));letter-spacing:.14em;text-transform:uppercase}
.tile{background:#fff;display:flex;align-items:center;justify-content:center;flex:none;padding:calc(var(--pad,10px));overflow:hidden}
.tile img{max-width:100%;max-height:100%;object-fit:contain}
.mono{font-family:'Anton',sans-serif;color:var(--rojo);font-size:calc(80px*var(--k));letter-spacing:.04em}
.pie{margin-top:auto;padding-top:calc(18px*var(--k));font-weight:800;letter-spacing:.3em;font-size:calc(32px*var(--k));opacity:.9}
.ejemplo{position:absolute;top:24px;right:24px;border:3px solid #fff;padding:4px 14px;font-weight:800;font-size:28px;letter-spacing:.2em}
`;

const pagina = (f, cuerpo) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS(f)}</style></head><body><div class="pag">${EJEMPLO ? '<div class="ejemplo">EJEMPLO</div>' : ''}${cuerpo}<div class="pie">G22 SCORES</div></div></body></html>`;
const cabecera = (extra = '') => `<img class="logo" src="${img('logo-torneo.png')}" alt="Córdoba Seven">${extra}`;

/** Un partido: dos escudos, los dos puntajes y la etapa. Sin nombres: los escudos hablan. */
function resultado(f, p) {
  const t = f.h === 1920 ? 330 : 215;
  const gana = p.puntos.local === p.puntos.visita ? '' : p.puntos.local > p.puntos.visita ? 'local' : 'visita';
  const num = (v, quien) => `<div class="anton" style="font-size:${f.h === 1920 ? 300 : 215}px;line-height:1;${gana && gana !== quien ? 'opacity:.55' : ''}">${v}</div>`;
  return pagina(f, `${cabecera(`<div class="tag" style="margin-top:calc(26px*var(--k))">${esc(p.etapa)}</div>`)}
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;width:100%;padding:${f.h === 1920 ? 14 : 16}px 0">
    ${escudo(p.local, { w: t, h: t })}
    ${num(p.puntos.local, 'local')}
    <div style="display:flex;align-items:center;gap:28px;width:100%"><i style="flex:1;height:4px;background:#fff"></i><span class="tag" style="font-size:calc(56px*var(--k))">FINAL</span><i style="flex:1;height:4px;background:#fff"></i></div>
    ${num(p.puntos.visita, 'visita')}
    ${escudo(p.visita, { w: t, h: t })}
  </div>`);
}

/** Filas de partidos: escudo, hora (o marcador) y nombres, escudo. */
function filasPartidos(lista, alto) {
  const ancho = alto;
  return lista.map((p) => {
    const centro = p.puntos
      ? `<div class="anton" style="font-size:${alto * 0.5}px;line-height:1">${p.puntos.local} <span style="opacity:.6">-</span> ${p.puntos.visita}</div>`
      : `<div class="anton" style="font-size:${alto * 0.5}px;line-height:1">${esc(p.hora)}</div>`;
    return `<div style="display:flex;align-items:stretch;gap:14px;width:100%;height:${alto}px">
      ${escudo(p.local, { w: ancho, h: alto })}
      <div style="flex:1;background:var(--oscuro);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0">
        ${centro}
        <div class="tag" style="font-size:${alto * 0.2}px;letter-spacing:.06em;white-space:nowrap;overflow:hidden;max-width:96%">${esc(equipo(p.local).corto)} · ${esc(equipo(p.visita).corto)}</div>
        ${p.zona ? `<div class="tag" style="font-size:${alto * 0.16}px;opacity:.75">${esc(p.zona)}${p.puntos ? ' · FINAL' : ''}</div>` : ''}
      </div>
      ${escudo(p.visita, { w: ancho, h: alto })}</div>`;
  }).join('');
}

/** Horarios del día (con resultado si el partido ya se jugó). */
function horarios(f, dia, lista, titulo = 'HORARIOS') {
  const alto = f.h === 1920 ? 118 : 80;
  return pagina(f, `${cabecera(`<div class="anton" style="font-size:calc(${f.h === 1920 ? 190 : 170}px*var(--k));line-height:1;margin-top:calc(10px*var(--k))">${titulo}</div><div class="tag" style="margin:calc(8px*var(--k)) 0 calc(16px*var(--k))">${esc(dia)}</div>`)}
  <div style="display:flex;flex-direction:column;gap:${f.h === 1920 ? 16 : 9}px;width:100%">${filasPartidos(lista, alto)}</div>`);
}

/** Tabla de una o varias zonas. */
function tablas(f, zonas, titulo = 'TABLA DE POSICIONES') {
  const una = zonas.length === 1;
  const lado = una ? 96 : f.h === 1920 ? 70 : 50;
  const fila = (z, i) => `<tr>
    <td class="pos">${i + 1}</td>
    <td class="eq"><div style="display:flex;align-items:center;gap:14px">${escudo(z.id, { w: lado, h: lado }, 0.02)}<span>${esc(equipo(z.id).corto)}</span></div></td>
    <td>${z.j}</td><td>${z.g}</td><td>${z.e}</td><td>${z.p}</td><td>${z.pf}</td><td>${z.pc}</td><td>${z.dif > 0 ? '+' : ''}${z.dif}</td><td class="pts">${z.pts}</td></tr>`;
  const alt = una ? (f.h === 1920 ? 118 : 96) : f.h === 1920 ? 82 : 54;
  const tarjetas = zonas.map((zona) => `<div style="width:100%;background:#fff;color:#1b1b1b">
      <div style="background:var(--oscuro);color:#fff;padding:${f.h === 1920 ? 6 : 2}px 24px"><span class="anton" style="font-size:${una ? 54 : f.h === 1920 ? 40 : 34}px">${esc(zona.nombre)}</span></div>
      <table><thead><tr><th></th><th class="eq"></th><th>J</th><th>G</th><th>E</th><th>P</th><th>PF</th><th>PC</th><th>DIF</th><th>PTS</th></tr></thead><tbody>${zona.filas.map(fila).join('')}</tbody></table></div>`).join(`<div style="height:${una ? 0 : 22}px"></div>`);
  const css = `<style>
    table{width:100%;border-collapse:collapse;font-weight:700;font-size:${una ? 40 : 32}px;text-align:center}
    th{font-size:${una ? 26 : 22}px;color:#777;letter-spacing:.08em;padding:8px 4px;font-weight:700}
    td{height:${alt}px;border-top:1px solid #e4e4e4;padding:0 4px}
    td.pos{width:60px;color:#999}td.eq{text-align:left;font-weight:800;text-transform:uppercase;white-space:nowrap}
    td.pts{color:var(--rojo);font-weight:800;font-size:${una ? 48 : 38}px}
  </style>`;
  return pagina(f, `${css}${cabecera(`<div class="anton" style="font-size:calc(${una ? 150 : f.h === 1920 ? 120 : 100}px*var(--k));line-height:1;margin-top:calc(10px*var(--k));text-align:center">${titulo}</div><div class="tag" style="margin:calc(10px*var(--k)) 0 calc(22px*var(--k))">${esc(datos.fase || '')}</div>`)}<div style="width:100%">${tarjetas}</div>${una ? `<div class="tag" style="margin:calc(34px*var(--k)) 0 calc(14px*var(--k))">PARTIDOS DE LA ${esc(zonas[0].nombre)}</div><div style="display:flex;flex-direction:column;gap:12px;width:100%">${filasPartidos(datos.partidos.filter((p) => p.zona === zonas[0].nombre), f.h === 1920 ? 104 : 72)}</div>` : ''}`);
}

/** Formaciones: los dos planteles de un partido, con escudo. */
function formaciones(f, p) {
  const story = f.h === 1920;
  const t = story ? 250 : 170, fila = story ? 80 : 50, fs = story ? 33 : 30;
  const columna = (id) => {
    const e = equipo(id);
    const nombres = (e.jugadores || []).map((n, i) => `<div style="height:${fila}px;display:flex;align-items:center;gap:12px;border-top:2px solid rgba(255,255,255,.35);font-weight:700;font-size:${fs}px;letter-spacing:0;text-transform:uppercase;white-space:nowrap;overflow:hidden">${esc(n)}</div>`).join('');
    return `<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:${story ? 22 : 14}px">${escudo(id, { w: t, h: t })}<div class="tag" style="font-size:${story ? 38 : 28}px;letter-spacing:.06em;text-align:center">${esc(e.corto)}</div><div style="width:100%">${nombres}</div></div>`;
  };
  return pagina(f, `${cabecera(`<div class="anton" style="font-size:calc(${story ? 150 : 140}px*var(--k));line-height:1;margin-top:calc(10px*var(--k))">FORMACIONES</div><div class="tag" style="margin:calc(8px*var(--k)) 0 calc(${story ? 28 : 18}px*var(--k))">${esc(p.etapa)}</div>`)}
  <div style="display:flex;gap:34px;width:100%">${columna(p.local)}${columna(p.visita)}</div>`);
}

function sacar(nombre, formato, html) {
  const f = FORMATOS[formato];
  fs.mkdirSync(SALIDA, { recursive: true });
  const tmp = path.join(SALIDA, `.${nombre}-${formato}.html`);
  const png = path.join(SALIDA, `${nombre}-${formato}.png`);
  fs.writeFileSync(tmp, html);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${f.w},${f.h}`, '--virtual-time-budget=15000', `--screenshot=${png}`, pathToFileURL(tmp).href], { stdio: 'ignore' });
  fs.unlinkSync(tmp);
  console.log('→', png);
}

for (const formato of Object.keys(FORMATOS)) {
  const f = { ...FORMATOS[formato] };
  const conResultado = datos.partidos.filter((p) => p.puntos);
  if (conResultado[0]) sacar('resultado', formato, resultado(f, conResultado[0]));
  sacar('formaciones', formato, formaciones(f, datos.partidos[0]));
  sacar('horarios', formato, horarios(f, datos.dia, datos.partidos));
  sacar('tabla-todas-las-zonas', formato, tablas(f, datos.zonas));
  sacar('tabla-zona-individual', formato, tablas(f, [datos.zonas[0]]));
}
