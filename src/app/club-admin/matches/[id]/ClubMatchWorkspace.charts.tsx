'use client';

export function ComparisonBarChart({ home, away, max, homeLabel, awayLabel }: { home: number; away: number; max?: number; homeLabel?: string; awayLabel?: string }) {
  const total = Math.max(max ?? 0, home + away, 1);
  const homePct = (home / total) * 100;
  const awayPct = (away / total) * 100;
  const hasData = home > 0 || away > 0;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
        <span style={{ minWidth: 60, textAlign: 'right', color: 'var(--success)' }}>{homeLabel || 'Local'}</span>
        <div style={{ flex: 1, height: 20, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden', display: 'flex', position: 'relative' }}>
          <div style={{ width: `${homePct}%`, background: 'linear-gradient(90deg, var(--success), color-mix(in srgb, var(--success) 70%, #fff))', height: '100%', transition: 'width 0.4s ease' }} />
          {!hasData && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--text-dim)' }}>Sin datos</span>}
        </div>
        <strong style={{ minWidth: 28, textAlign: 'right' }}>{home}</strong>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
        <span style={{ minWidth: 60, textAlign: 'right', color: 'var(--club-accent)' }}>{awayLabel || 'Visitante'}</span>
        <div style={{ flex: 1, height: 20, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden', display: 'flex', position: 'relative' }}>
          <div style={{ width: `${awayPct}%`, background: 'linear-gradient(90deg, var(--club-accent), color-mix(in srgb, var(--club-accent) 70%, #fff))', height: '100%', transition: 'width 0.4s ease' }} />
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
          <div style={{ display: 'flex', gap: 4, height: 8, background: 'var(--surface-strong)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(item.home / max) * 100}%`, background: 'var(--success)', height: '100%', transition: 'width 0.4s ease' }} />
            <div style={{ width: `${(item.away / max) * 100}%`, background: 'var(--club-accent)', height: '100%', transition: 'width 0.4s ease' }} />
          </div>
        </div>
      ))}
      {!hasAnyData && (
        <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-dim)', padding: '12px 0' }}>
          Cargá eventos en &quot;En Vivo&quot; para ver las estadísticas
        </div>
      )}
    </div>
  );
}

export type RadarAxis = { label: string; home: number; away: number; max: number };

export function RadarChart({ axes, size = 280 }: { axes: RadarAxis[]; size?: number }) {
  const safeAxes = axes.length >= 3 ? axes : [];
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.36;
  const levels = 4;

  const getPoint = (value: number, max: number, index: number, total: number) => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    const safeMax = max > 0 ? max : 1;
    const r = (Math.max(0, Math.min(value, safeMax)) / safeMax) * radius;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  if (safeAxes.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: size, fontSize: '0.85rem', color: 'var(--text-dim)' }}>
        Necesitás al menos 3 estadísticas para un radar
      </div>
    );
  }

  const homePoints = safeAxes.map((axis, i) => getPoint(axis.home, axis.max, i, safeAxes.length));
  const awayPoints = safeAxes.map((axis, i) => getPoint(axis.away, axis.max, i, safeAxes.length));

  const homePoly = homePoints.map((p) => `${p.x},${p.y}`).join(' ');
  const awayPoly = awayPoints.map((p) => `${p.x},${p.y}`).join(' ');

  const hasData = safeAxes.some((a) => a.home > 0 || a.away > 0);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
      <svg width={size} height={size} style={{ opacity: hasData ? 1 : 0.4 }}>
        {[...Array(levels)].map((_, i) => (
          <circle key={i} cx={cx} cy={cy} r={(radius * (i + 1)) / levels} fill="none" stroke="var(--border)" />
        ))}
        {safeAxes.map((_, i) => {
          const angle = (Math.PI * 2 * i) / safeAxes.length - Math.PI / 2;
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" />;
        })}
        <polygon points={homePoly} fill="color-mix(in srgb, var(--success) 25%, transparent)" stroke="var(--success)" strokeWidth={2} />
        <polygon points={awayPoly} fill="color-mix(in srgb, var(--club-accent) 25%, transparent)" stroke="var(--club-accent)" strokeWidth={2} />
        {safeAxes.map((axis, i) => {
          const angle = (Math.PI * 2 * i) / safeAxes.length - Math.PI / 2;
          const x = cx + (radius + 18) * Math.cos(angle);
          const y = cy + (radius + 18) * Math.sin(angle);
          return (
            <text key={`label-${i}`} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="var(--text-main)" fontSize={11} fontWeight={700}>
              {axis.label}
            </text>
          );
        })}
      </svg>
      {!hasData && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
          Sin datos de eventos
        </div>
      )}
    </div>
  );
}
