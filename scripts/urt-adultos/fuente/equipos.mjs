// Nombres de equipo de la URT → clave de club + letra. Compartido por deduce.mjs y build.mjs.
const sinTilde = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
// ── Nombres de equipo ────────────────────────────────────────────────────────
const CLUBES = [
  [/aguara/, 'AGUARA'], [/cardenales/, 'CARDENALES'], [/coipu/, 'COIPU'], [/huirapuca/, 'HUIRAPUCA'],
  [/jockey.*salta|salta.*jockey/, 'JOCKEY SALTA'], [/jockey/, 'JOCKEY'], [/querencia/, 'QUERENCIA'],
  [/lince/, 'LINCE'], [/liceo/, 'LICEO'], [/tarcos/, 'TARCOS'], [/nat(acion|\.)/, 'NATACION'],
  [/san martin/, 'SANMARTIN'], [/(stgo|santiago).*lawn|lawn.*(stgo|santiago)/, 'STGO LAWN'],
  [/santiago rugby|stgo\.? rugby/, 'STGO RUGBY'], [/l\.\s*t\.|l\.\s*tennis|lawn|l\.tennis/, 'LAWN'],
  [/t\.\s*rug|tuc[,.]?\s*r(ugby|\.)|tucuman rugby/, 'TRUGBY'], [/univ.*salta|salta.*univ/, 'UNI SALTA'],
  [/^uni|universitario/, 'UNI'], [/bajo hondo/, 'BAJO HONDO'], [/corsarios/, 'CORSARIOS'],
  [/gim\.? y tiro|gimnasia y tiro/, 'GIM Y TIRO'], [/tiro federal/, 'TIRO FEDERAL'], [/old lions/, 'OLD LIONS'],
  [/monteros/, 'MONTEROS'], [/suri/, 'SURI'], [/tafi/, 'TAFI VIEJO'], [/tigres/, 'TIGRES'], [/alisos/, 'ALISOS'],
  [/san isidro/, 'SAN ISIDRO'], [/anatuya/, 'ANATUYA'], [/cobras/, 'COBRAS'], [/santa ana/, 'SANTA ANA'],
  [/jujuy/, 'JUJUY'], [/^libre/, 'LIBRE'],
];
export function claveEquipo(nombre) {
  const s = sinTilde(nombre).toLowerCase().replace(/\((gp|pp)\)/g, '').replace(/[|]/g, ' ').trim();
  let club = null;
  for (const [re, c] of CLUBES) if (re.test(s)) { club = c; break; }
  const lab = (s.match(/"\s*([a-z])\s*"/) || [])[1];
  const color = (s.match(/\b(verde|negro|azul|blanco|gris|amarillo)\b/) || [])[1] || '';
  return { club, label: (lab || '').toUpperCase(), color, gp: /\(gp\)/i.test(nombre), pp: /\(pp\)/i.test(nombre) };
}

