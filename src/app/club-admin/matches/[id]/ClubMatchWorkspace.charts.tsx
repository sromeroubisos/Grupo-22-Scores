'use client';

import type { MatchStats } from './ClubMatchWorkspace.types';

export function ComparisonBarChart({ home, away, max, homeLabel, awayLabel }: { home: number; away: number; max?: number; homeLabel?: string; awayLabel?: string }) {
  const total = Math.max(max ?? 0, home + away, 1);
  const homePct = (home / total) * 100;
  const awayPct = (away / total) * 100;
  const hasData = home > 0 || away > 0;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
        <span style={{ minWidth: 60, textAlign: 'right', color: '#6ee7b7' }}>{homeLabel || 'Local'}</span>
        <div style={{ flex: 1, height: 20, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', display: 'flex', position: 'relative' }}>
          <div style={{ width: `${homePct}%`, background: 'linear-gradient(90deg, #10b981, #34d399)', height: '100%', transition: 'width 0.4s ease' }} />
          {!hasData && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>Sin datos</span>}
        </div>
        <strong style={{ minWidth: 28, textAlign: 'right' }}>{home}</strong>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
        <span style={{ minWidth: 60, textAlign: 'right', color: '#93c5fd' }}>{awayLabel || 'Visitante'}</span>
        <div style={{ flex: 1, height: 20, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', display: 'flex', position: 'relative' }}>
          <div style={{ width: `${awayPct}%`, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', height: '100%', transition: 'width 0.4s ease' }} />
        </div>
        <strong style={{ minWidth: 28, textAlign: 'right' }}>{away}</strong>
      </div>
    </div>
  );
}


export function MiniBarChart({ data }: { data: Array<{ label: string; home: number; away: number }> }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.home, d.away]));
  const hasAnyData = data.some((d) => d.home > 0 || d.away > 0);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {data.map((item) => (
        <div key={item.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4, opacity: 0.7 }}>
            <span>{item.label}</span>
            <span>{item.home} - {item.away}</span>
          </div>
          <div style={{ display: 'flex', gap: 4, height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(item.home / max) * 100}%`, background: '#10b981', height: '100%', transition: 'width 0.4s ease' }} />
            <div style={{ width: `${(item.away / max) * 100}%`, background: '#3b82f6', height: '100%', transition: 'width 0.4s ease' }} />
          </div>
        </div>
      ))}
      {!hasAnyData && (
        <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', padding: '12px 0' }}>
          Cargá eventos en &quot;En Vivo&quot; para ver las estadísticas
        </div>
      )}
    </div>
  );
}

export function RadarChart({ stats }: { stats: MatchStats }) {
  const axes = [
    { key: 'tries', label: 'Tries', max: 8 },
    { key: 'conversions', label: 'Conv', max: 8 },
    { key: 'penalties', label: 'Pen', max: 8 },
    { key: 'tackles', label: 'Tack', max: 20 },
    { key: 'scrumsWon', label: 'Scrum', max: 15 },
    { key: 'linesWon', label: 'Line', max: 15 },
  ];
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 100;
  const levels = 4;

  const getPoint = (value: number, max: number, index: number) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const r = (value / max) * radius;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const homeValues = [stats.tries.home, stats.conversions.home, stats.penalties.home, Math.min(stats.tackles.home, 20), stats.scrums.home.won, stats.lines.home.won];
  const awayValues = [stats.tries.away, stats.conversions.away, stats.penalties.away, Math.min(stats.tackles.away, 20), stats.scrums.away.won, stats.lines.away.won];

  const hasData = homeValues.some((v) => v > 0) || awayValues.some((v) => v > 0);

  const homePoints = axes.map((axis, i) => getPoint(homeValues[i], axis.max, i));
  const awayPoints = axes.map((axis, i) => getPoint(awayValues[i], axis.max, i));

  const homePoly = homePoints.map((p) => `${p.x},${p.y}`).join(' ');
  const awayPoly = awayPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
      <svg width={size} height={size} style={{ opacity: hasData ? 1 : 0.4 }}>
        {[...Array(levels)].map((_, i) => (
          <circle key={i} cx={cx} cy={cy} r={(radius * (i + 1)) / levels} fill="none" stroke="rgba(255,255,255,0.18)" />
        ))}
        {axes.map((_, i) => {
          const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.18)" />;
        })}
        <polygon points={homePoly} fill="rgba(16,185,129,0.25)" stroke="#10b981" strokeWidth={2} />
        <polygon points={awayPoly} fill="rgba(59,130,246,0.25)" stroke="#3b82f6" strokeWidth={2} />
        {axes.map((axis, i) => {
          const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
          const x = cx + (radius + 16) * Math.cos(angle);
          const y = cy + (radius + 16) * Math.sin(angle);
          return (
            <text key={`label-${i}`} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.7)" fontSize={11} fontWeight={700}>
              {axis.label}
            </text>
          );
        })}
      </svg>
      {!hasData && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>
          Sin datos de eventos
        </div>
      )}
    </div>
  );
}
