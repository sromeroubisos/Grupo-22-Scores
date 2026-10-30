// Planillas "Partidos.xls" de la UCR (Liga Desarrollo) -> planilla.json (una fila por partido).
const XLSX = require('xlsx');
const fs = require('fs');
const d = 'C:/Users/srome/.claude/uploads/76286780-4c3a-45b4-8b88-d7e531861204/';
const out = [];
for (const f of ['8582c8e3-Partidos.xls_23.xlsx', '9a190e39-Partidos.xls_22.xlsx']) {
  const wb = XLSX.readFile(d + f);
  for (const n of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' });
    const h = rows[0].map((x) => String(x).trim());
    for (const r of rows.slice(1)) {
      if (!String(r[5]).trim()) continue;
      const o = Object.fromEntries(h.map((k, i) => [k, String(r[i]).trim()]));
      out.push({ archivo: f.slice(0, 8), torneo: o['Torneo'], inst: o['Instancia/Ronda'], ronda: o['Fecha'], dt: o['Fecha/Hora de Juego'], id: o['Id-Partido'], local: o['Local'], res: o['Resultado'], visit: o['Visitante'], estado: o['Estado'] });
    }
  }
}
fs.writeFileSync(__dirname + '/planilla.json', JSON.stringify(out, null, 1));
const c = {};
for (const o of out) { const k = o.archivo + ' | ' + o.torneo + ' | ' + o.inst; c[k] = (c[k] || 0) + 1; }
console.log(out.length, 'filas'); console.log(c);
const e = {}; for (const o of out) e[o.estado] = (e[o.estado] || 0) + 1; console.log(e);
