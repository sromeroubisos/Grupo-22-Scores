/**
 * Seven de la República 2026 en vivo, corrida local. La lógica es la misma del
 * cron de Vercel (`/api/cron/seven-republica-sync`) y vive en
 * `src/lib/integrations/sevenrepublica/sync.ts`; esto sólo carga credenciales,
 * toma un candado y escribe el log.
 *
 *   npx tsx scripts/seven-republica/vivo.mjs --plan       (muestra qué cambiaría)
 *   npx tsx scripts/seven-republica/vivo.mjs --execute
 *   npx tsx scripts/seven-republica/vivo.mjs --execute --archivo=pub.csv   (copia local)
 *
 * Va con tsx por el alias `@/` del módulo y del recálculo de tabla.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

// Candado: dos corridas locales a la vez escribirían dos veces.
const CANDADO = path.join(REPO, 'tmp', 'seven-republica-vivo.lock');
function tomarCandado() {
  fs.mkdirSync(path.dirname(CANDADO), { recursive: true });
  try {
    if (Date.now() - fs.statSync(CANDADO).mtimeMs < 5 * 60 * 1000) return false;
  } catch { /* no había */ }
  fs.writeFileSync(CANDADO, String(process.pid));
  return true;
}

async function main() {
  console.log(`${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} · modo ${modo}`);
  if (modo === 'execute' && !tomarCandado()) { console.log('otra corrida en curso: salgo'); return; }
  try {
    const { sincronizarSevenRepublica } = await import('@/lib/integrations/sevenrepublica/sync');
    const archivo = process.argv.find((a) => a.startsWith('--archivo='))?.slice('--archivo='.length);
    await sincronizarSevenRepublica({
      escribir: modo === 'execute',
      csv: archivo ? fs.readFileSync(archivo, 'utf8') : undefined,
      log: (l) => console.log(l),
    });
  } finally {
    if (modo === 'execute') fs.rmSync(CANDADO, { force: true });
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
