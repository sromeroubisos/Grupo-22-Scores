/**
 * Crea las dos copas europeas como torneo de la base, con su escudo:
 *
 *   npx tsx src/scripts/epcr-vincular-copas.ts --plan
 *   npx tsx src/scripts/epcr-vincular-copas.ts --execute
 *
 * Van aparte del importador de torneos porque son el caso raro: el proveedor
 * LAS TIENE —aparecen en la tabla external_tournaments con su id de etapa, que es como
 * el feed diario las vio— pero no hay ruta que las resuelva. Probé ocho
 * variantes (/rugby-union/europe/champions-cup/, world/, investec-, heineken-,
 * european-rugby-…) y todas vuelven rechazadas, y el proveedor no expone
 * buscador, asi que el slug no se puede descubrir desde acá.
 *
 * Igual se guarda el id de etapa en el ruleset: el dia que aparezca la URL, esto
 * es completar un campo y no rehacer el vinculo.
 *
 * El escudo sale de la carpeta de Recursos, a la mitad de lado y comprimido, y
 * se sube al bucket tournaments como el resto (logos/<uuid>.png).
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const require_ = createRequire('c:/Users/srome/OneDrive/Escritorio/Grupo-22-Scores/package.json');
const sharp = require_('sharp');

const env = Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')]}));
const U=env.NEXT_PUBLIC_SUPABASE_URL, K=env.SUPABASE_SERVICE_ROLE_KEY;
const H={apikey:K,Authorization:`Bearer ${K}`};
const EJECUTAR = process.argv.includes('--execute');
const RAIZ='C:/Users/srome/OneDrive/Documentos/________S22/Recursos';

// Las dos copas europeas viven en `external_tournaments` con su id de etapa del
// proveedor pero SIN url, y el proveedor rechaza todas las rutas candidatas. Se
// guarda el id igual: el dia que aparezca la url es un campo, no una migracion.
const COPAS = [
  { slug:'rugby-champions-cup', name:'Champions Cup', stage:'z50otgjb', logo:`${RAIZ}/Heineken_Champions_Cup_CoreLogo_3C_CMYK_OnLight.png`, prioridad:98 },
  { slug:'rugby-challenge-cup-epcr', name:'Challenge Cup', stage:'kfassg54', logo:`${RAIZ}/CHALLENGE CUP.png`, prioridad:92 },
];

async function subirLogo(archivo){
  const img = sharp(archivo);
  const meta = await img.metadata();
  const buf = await img.resize(Math.round(meta.width/2), Math.round(meta.height/2), {fit:'inside'})
    .png({compressionLevel:9}).toBuffer();
  const ruta = `logos/${randomUUID()}.png`;
  if(!EJECUTAR) return { url:`(dry-run) ${ruta}`, kb:Math.round(buf.length/1024), dim:`${Math.round(meta.width/2)}x${Math.round(meta.height/2)}` };
  const res = await fetch(`${U}/storage/v1/object/tournaments/${ruta}`,{
    method:'POST', headers:{...H,'content-type':'image/png'}, body:buf,
  });
  if(!res.ok) throw new Error(`subida: ${res.status} ${await res.text()}`);
  return { url:`${U}/storage/v1/object/public/tournaments/${ruta}`, kb:Math.round(buf.length/1024), dim:`${Math.round(meta.width/2)}x${Math.round(meta.height/2)}` };
}

const existentes = await (await fetch(`${U}/rest/v1/tournaments?select=slug&slug=in.(${COPAS.map(c=>c.slug).join(',')})`,{headers:H})).json();
const yaEstan = new Set(existentes.map(t=>t.slug));

const filas=[];
for(const c of COPAS){
  if(yaEstan.has(c.slug)){ console.log(`= ${c.name}: ya existe`); continue; }
  const logo = await subirLogo(c.logo);
  console.log(`+ ${c.name.padEnd(16)} escudo ${logo.dim} · ${logo.kb} KB`);
  filas.push({
    id: randomUUID(), name:c.name, display_name:c.name, slug:c.slug,
    sport:'rugby', sport_id:'rugby', country_id:'international', country:'Internacional', country_name:'Internacional',
    external_id:`flashscore:${c.stage}`,
    ruleset:{ external:{ flashscore:{ tournament_stage_id:c.stage } } },
    is_api_managed:true, data_source:'flashscore',
    status:'published', is_visible:true, is_active:true,
    logo_url: EJECUTAR ? logo.url : null,
    priority:c.prioridad,
  });
}

if(!EJECUTAR){ console.log(`\n--plan: entrarian ${filas.length} torneos.`); process.exit(0); }
if(filas.length){
  const res=await fetch(`${U}/rest/v1/tournaments`,{method:'POST',headers:{...H,'content-type':'application/json',prefer:'return=minimal'},body:JSON.stringify(filas)});
  if(!res.ok){ console.error('ERROR', res.status, await res.text()); process.exit(1); }
}
console.log(`\nListo: ${filas.length} torneos creados con escudo.`);
