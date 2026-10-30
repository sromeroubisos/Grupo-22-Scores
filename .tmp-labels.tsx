const Module = require('module');
Module._extensions['.css'] = (m: any) => {
  const clases = new Proxy({}, { get: (_t: unknown, k: string) => String(k) });
  m.exports = { __esModule: true, default: clases };
};

(async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { TopStatRow } = await import('./src/app/matches/[id]/TopStatsRows');

  // Etiquetas como las manda el proveedor: SIN clave. Solo queda el texto.
  const casos: Array<[string, number, number, 'local'|'visitante']> = [
    ['Tarjetas amarillas',      1, 3, 'local'],
    ['Tarjetas rojas',          0, 1, 'local'],
    ['Faltas',                 14, 9, 'visitante'],
    ['Pérdidas de balón',      18, 7, 'visitante'],
    ['Fuera de juego',          4, 1, 'visitante'],
    ['Posesión de balón',      72, 28, 'local'],
    ['Tiros a puerta',          9, 1, 'local'],
    ['Pases acertados',       731, 236, 'local'],
    ['Córners',                 6, 2, 'local'],
    ['Atajadas',                7, 2, 'local'],
    ['Tiros fuera',             7, 2, 'visitante'],
    ['Errores que llevan a gol', 2, 0, 'visitante'],
  ];

  let fallos = 0;
  for (const [label, h, a, esperado] of casos) {
    const html = renderToStaticMarkup(React.createElement(TopStatRow, {
      label, home: { texto: String(h), valor: h }, away: { texto: String(a), valor: a },
    }));
    const i = html.indexOf('topStatValueWin');
    const real = i === -1 ? 'ninguna' : (html.slice(0, i).includes('topStatValueAway') ? 'visitante' : 'local');
    const ok = real === esperado;
    if (!ok) fallos++;
    console.log(`${ok ? 'OK   ' : 'FALLA'} ${label.padEnd(26)} ${String(h).padStart(3)}-${String(a).padEnd(3)} chapa=${real.padEnd(9)} esperado=${esperado}`);
  }
  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLAS`);
})();
