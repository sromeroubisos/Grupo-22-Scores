/**
 * Guardián de contraste de la tabla de posiciones.
 *
 * Mide el contraste REAL, después de la cascada, en un render de Chrome sin
 * cabeza. No es lo mismo que leer el CSS: cuando se hizo a mano, el cálculo
 * acertó 13 de 16 y falló los tres marginales —`formWin` 4,42 · `formDraw` 4,18
 * · `statusBadgeWarning` 4,19—, porque las fichas van sobre un tinte propio que
 * en tema claro compone más claro de lo que uno estima.
 *
 * Y comprueba algo que ningún análisis del archivo puede: que los tokens
 * RESUELVAN. `--ok-ink` y compañía se definen en `.operation-console-shell`
 * (operation-console.css) y los usan clases de un CSS Module. Si el módulo se
 * renderizara fuera de ese contenedor, cada `var()` caería a su respaldo y el
 * tema claro quedaría con las tintas del oscuro, sin que nada fallara.
 *
 * Las clases del módulo se usan CRUDAS: en el archivo fuente están escritas así,
 * el hash lo agrega el bundler.
 *
 *   node scripts/contraste-standings.mjs
 *
 * Sale con código 1 si alguna combinación baja de 4,5:1 (WCAG AA, texto normal).
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BASE = join(RAIZ, 'src', 'components', 'admin', 'entities', 'tournament');

const CANDIDATOS_CHROME = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

/** Cada medición: el id del elemento y las clases que lo pintan. */
const CASOS = [
    ['numericPositive', '<span class="numericPositive" id="ID">+12</span>'],
    ['numericNegative', '<span class="numericNegative" id="ID">-7</span>'],
    ['emptyInline', '<span class="emptyInline" id="ID">--</span>'],
    ['tiebreakerBadge', '<span class="tiebreakerBadge" id="ID">1</span>'],
    ['auditTime', '<p class="auditTime" id="ID">Hace 3 min</p>'],
    ['statusTextSuccess', '<p class="statusTextSuccess" id="ID">Calculada</p>'],
    ['statusTextError', '<p class="statusTextError" id="ID">Con error</p>'],
    ['labelsError', '<p class="labelsError" id="ID">No se pudo guardar</p>'],
    ['ruleValueWarning', '<p class="ruleValueWarning" id="ID">Sin definir</p>'],
    ['warningCopy', '<p class="warningCopy" id="ID">Faltan resultados</p>'],
    ['formWin', '<span class="formPill formWin" id="ID">W</span>'],
    ['formDraw', '<span class="formPill formDraw" id="ID">D</span>'],
    ['formLoss', '<span class="formPill formLoss" id="ID">L</span>'],
    ['statusBadgeSuccess', '<span class="statusBadge statusBadgeSuccess" id="ID">Clasificado</span>'],
    ['statusBadgeDanger', '<span class="statusBadge statusBadgeDanger" id="ID">Descenso</span>'],
    ['statusBadgeWarning', '<span class="statusBadge statusBadgeWarning" id="ID">En zona</span>'],
];

const TOKENS = ['--ok-ink', '--bad-ink', '--muted-ink', '--warn-ink', '--tiebreak-chip-bg'];
const CORTE = 4.5;

/**
 * Se comprueba que el archivo EXISTA, no se lo ejecuta con `--version`: en
 * Windows ese flag no escribe a stdout y el proceso se queda esperando, así que
 * un sondeo que en Linux tarda milisegundos acá cuelga el script entero.
 */
function buscarChrome() {
    return CANDIDATOS_CHROME.find((ruta) => ruta && existsSync(ruta)) ?? null;
}

function armarHtml() {
    const cuerpo = CASOS.map(([id, html]) => html.replace('ID', `m-${id}`)).join('\n      ');

    return `<meta charset="utf-8">
<link rel="stylesheet" href="basalt.css">
<link rel="stylesheet" href="operation-console.css">
<link rel="stylesheet" href="modulo.css">
<div class="basalt-body"><div class="operation-console-shell"><div class="page"><div class="pageInner">
  <section class="glassPanel tableShell"><div class="tableScroll"><table class="table"><tbody><tr class="row"><td>
      ${cuerpo}
  </td></tr></tbody></table></div></section>
</div></div></div></div>
<pre id="salida"></pre>
<script>
const CASOS = ${JSON.stringify(CASOS.map(([id]) => id))};
const TOKENS = ${JSON.stringify(TOKENS)};
const CORTE = ${CORTE};

const aRgb = (css) => {
  const m = css.match(/rgba?\\(([^)]+)\\)/);
  if (!m) return null;
  const p = m[1].split(',').map((s) => parseFloat(s.trim()));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
};

// Compone hacia arriba hasta el primer fondo opaco: ése es el que se ve detrás.
function fondoEfectivo(el) {
  const capas = [];
  let n = el;
  while (n && n !== document.documentElement) {
    const bg = aRgb(getComputedStyle(n).backgroundColor);
    if (bg && bg.a > 0) { capas.unshift(bg); if (bg.a === 1) break; }
    n = n.parentElement;
  }
  if (!capas.length) return { r: 255, g: 255, b: 255 };
  let out = capas[0];
  for (let i = 1; i < capas.length; i++) {
    const t = capas[i];
    out = { r: t.r*t.a + out.r*(1-t.a), g: t.g*t.a + out.g*(1-t.a), b: t.b*t.a + out.b*(1-t.a) };
  }
  return out;
}

const lum = (c) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
  return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b);
};
const contraste = (fg, bg) => { const [a,b] = [lum(fg), lum(bg)].sort((x,y)=>y-x); return (a+0.05)/(b+0.05); };

function medir(tema) {
  const shell = getComputedStyle(document.querySelector('.operation-console-shell'));
  const tokens = {};
  for (const t of TOKENS) tokens[t] = shell.getPropertyValue(t).trim() || null;

  const filas = CASOS.map((id) => {
    const el = document.getElementById('m-' + id);
    if (!el) return { id, ratio: null };
    const fg = aRgb(getComputedStyle(el).color);
    const bg = fondoEfectivo(el);
    const rd = (c) => \`rgb(\${Math.round(c.r)},\${Math.round(c.g)},\${Math.round(c.b)})\`;
    return { id, ratio: contraste(fg, bg), fg: rd(fg), bg: rd(bg) };
  });

  return { tema, tokens, filas };
}

const out = [medir('oscuro')];
document.documentElement.setAttribute('data-theme', 'light');
out.push(medir('claro'));
document.getElementById('salida').textContent = JSON.stringify(out);
</script>`;
}

const chrome = buscarChrome();
if (!chrome) {
    console.error('No se encontró Chrome. Este guardián necesita un navegador para medir la cascada real.');
    process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), 'contraste-standings-'));
try {
    copyFileSync(join(BASE, 'basalt.css'), join(dir, 'basalt.css'));
    copyFileSync(join(BASE, 'operation-console.css'), join(dir, 'operation-console.css'));
    copyFileSync(join(BASE, 'standings', 'TournamentStandingsTab.module.css'), join(dir, 'modulo.css'));
    writeFileSync(join(dir, 'banco.html'), armarHtml(), 'utf8');

    const dom = execFileSync(chrome, [
        '--headless=new', '--disable-gpu', '--no-sandbox',
        '--virtual-time-budget=4000', '--dump-dom',
        `file:///${join(dir, 'banco.html').replace(/\\/g, '/')}`,
    ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

    const m = dom.match(/<pre id="salida">([\s\S]*?)<\/pre>/);
    if (!m) {
        console.error('El banco no produjo salida. ¿Cambió el marcado de la página de prueba?');
        process.exit(2);
    }

    const desescapar = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const resultados = JSON.parse(desescapar(m[1]));

    let fallas = 0;
    for (const { tema, tokens, filas } of resultados) {
        console.log(`\n### TEMA ${tema.toUpperCase()}`);

        const sinDefinir = TOKENS.filter((t) => !tokens[t]);
        if (sinDefinir.length) {
            fallas += sinDefinir.length;
            console.log(`  TOKENS SIN RESOLVER: ${sinDefinir.join(', ')}`);
            console.log('  (el módulo se está pintando fuera de .operation-console-shell)');
        } else {
            console.log(`  tokens: ${TOKENS.map((t) => `${t}=${tokens[t]}`).join('  ')}`);
        }

        for (const { id, ratio, fg, bg } of filas) {
            if (ratio === null) { fallas++; console.log(`  AUSENTE  ${id}`); continue; }
            const ok = ratio >= CORTE;
            if (!ok) fallas++;
            console.log(`  ${(ok ? 'ok' : 'FALLA').padEnd(6)} ${ratio.toFixed(2).padStart(6)}  ${id.padEnd(20)} ${fg} sobre ${bg}`);
        }
    }

    console.log(`\n${fallas === 0 ? 'OK' : 'FALLA'}: ${fallas} problema(s) sobre ${resultados.length * CASOS.length} mediciones (corte ${CORTE}:1)`);
    process.exit(fallas === 0 ? 0 : 1);
} finally {
    rmSync(dir, { recursive: true, force: true });
}
