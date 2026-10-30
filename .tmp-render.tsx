// Los CSS modules no existen fuera del bundler. Se registra el hook ANTES de
// cargar el componente, por eso la carga es dinamica: un `import` se hoistea.
const Module = require('module');
Module._extensions['.css'] = (m: any) => {
  // `import styles from './x.module.css'` es un default import: sin
  // __esModule/default el interop deja `styles` en undefined.
  const clases = new Proxy({}, { get: (_t: unknown, k: string) => String(k) });
  m.exports = { __esModule: true, default: clases };
};

(async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { TopStatSplit, TopStatRow } = await import('./src/app/matches/[id]/TopStatsRows');

  const casos = [
    { metricKey: 'turnoversLost',     label: 'Perdidas',             home: 12, away: 4, esperado: 'fila'  },
    { metricKey: 'twoMinSuspensions', label: 'Exclusiones de 2 min', home:  5, away: 1, esperado: 'fila'  },
    { metricKey: 'turnovers',         label: 'Turnovers',            home:  3, away: 1, esperado: 'fila'  },
    { metricKey: 'points',            label: 'Puntos',               home: 28, away: 21, esperado: 'barra' },
    { metricKey: 'firstDowns',        label: 'Primeros downs',       home: 18, away: 12, esperado: 'barra' },
    { metricKey: 'saves',             label: 'Atajadas',             home:  9, away: 4, esperado: 'barra' },
    { metricKey: 'points',            label: 'Puntos',               home:  0, away: 0, esperado: 'fila'  },
  ];

  let fallos = 0;
  for (const c of casos) {
    const html = renderToStaticMarkup(React.createElement(TopStatSplit, c));
    const real = html.includes('topStatSplitTrack') ? 'barra' : 'fila';
    let detalle = '';
    if (real === 'fila') {
      const i = html.indexOf('topStatValueWin');
      detalle = i === -1 ? '  chapa=ninguna'
        : `  chapa=${html.slice(0, i).includes('topStatValueAway') ? 'visitante' : 'local'}`;
    }
    const ok = real === c.esperado;
    if (!ok) fallos++;
    console.log(`${ok ? 'OK   ' : 'FALLA'} ${c.label.padEnd(22)} ${c.home}-${c.away} -> ${real}${detalle}`);
  }

  // Filas sueltas: la chapa tiene que caer del lado correcto en los dos sentidos.
  const pruebas = [
    { k: 'yellowCards', l: 'Amarillas', h: 1, a: 3, gana: 'local'     },
    { k: 'shotsSaved',  l: 'Atajados',  h: 7, a: 2, gana: 'visitante' },
    { k: 'tries',       l: 'Tries',     h: 4, a: 1, gana: 'local'     },
    { k: 'tries',       l: 'Tries',     h: 2, a: 2, gana: 'ninguna'   },
  ];
  for (const p of pruebas) {
    const html = renderToStaticMarkup(React.createElement(TopStatRow, {
      metricKey: p.k, label: p.l,
      home: { texto: String(p.h), valor: p.h }, away: { texto: String(p.a), valor: p.a },
    }));
    const i = html.indexOf('topStatValueWin');
    const real = i === -1 ? 'ninguna' : (html.slice(0, i).includes('topStatValueAway') ? 'visitante' : 'local');
    const ok = real === p.gana;
    if (!ok) fallos++;
    console.log(`${ok ? 'OK   ' : 'FALLA'} ${p.l.padEnd(22)} ${p.h}-${p.a} -> chapa=${real} (esperado ${p.gana})`);
  }
  console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLAS`);
})();
