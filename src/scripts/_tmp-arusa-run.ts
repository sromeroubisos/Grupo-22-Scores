import path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
{
  const Module = require('node:module');
  const cargar = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === 'server-only' || request === 'client-only') return {};
    if (String(request).includes('cronAuth')) return { authorizeCronRequest: async () => true };
    return cargar.call(this, request, ...rest);
  };
}
(async () => {
  const { GET } = await import('@/app/api/cron/arusa-sync/route');
  const res = await GET(new Request(`http://localhost/api/cron/arusa-sync?${process.argv[2]}`) as never);
  const j = await res.json();
  require('node:fs').writeFileSync(process.argv[3], JSON.stringify(j, null, 1));
  let act = 0, cre = 0;
  for (const t of j.torneos ?? []) for (const r of t.ramas ?? []) { act += r.actualizar ?? 0; cre += r.crear ?? 0; }
  console.log('status', res.status, 'dry', j.dry, 'actualizados', act, 'creados', cre, 'errors', JSON.stringify(j.errors));
})();
