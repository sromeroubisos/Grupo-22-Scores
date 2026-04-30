'use client';

interface DonutChartProps {
    home: number;
    away: number;
    label?: string;
    homeLabel?: string;
    awayLabel?: string;
    size?: number;
}

export function DonutChart({ home, away, label, homeLabel = 'Local', awayLabel = 'Visitante', size = 200 }: DonutChartProps) {
    const total = home + away;
    const safeHome = Math.max(0, home);
    const safeAway = Math.max(0, away);
    const homePct = total > 0 ? (safeHome / total) * 100 : 0;
    const awayPct = total > 0 ? (safeAway / total) * 100 : 0;

    const radius = size * 0.4;
    const stroke = size * 0.16;
    const innerRadius = radius - stroke / 2;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * innerRadius;
    const homeArc = (homePct / 100) * circumference;
    const awayArc = (awayPct / 100) * circumference;

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={cx} cy={cy} r={innerRadius} fill="none" stroke="var(--ca-border)" strokeWidth={stroke} />
                {total > 0 && (
                    <>
                        <circle
                            cx={cx}
                            cy={cy}
                            r={innerRadius}
                            fill="none"
                            stroke="var(--ca-success)"
                            strokeWidth={stroke}
                            strokeDasharray={`${homeArc} ${circumference}`}
                            strokeLinecap="butt"
                        />
                        <circle
                            cx={cx}
                            cy={cy}
                            r={innerRadius}
                            fill="none"
                            stroke="var(--ca-accent)"
                            strokeWidth={stroke}
                            strokeDasharray={`${awayArc} ${circumference}`}
                            strokeDashoffset={-homeArc}
                            strokeLinecap="butt"
                        />
                    </>
                )}
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                {total > 0 ? (
                    <>
                        <div style={{ fontSize: '0.65rem', color: 'var(--ca-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label || 'Total'}</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--ca-text)' }}>{total}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--ca-text-secondary)', marginTop: 2 }}>
                            <span style={{ color: 'var(--ca-success)' }}>{Math.round(homePct)}%</span>
                            <span style={{ margin: '0 4px', opacity: 0.4 }}>/</span>
                            <span style={{ color: 'var(--ca-accent)' }}>{Math.round(awayPct)}%</span>
                        </div>
                    </>
                ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--ca-text-muted)' }}>Sin datos</div>
                )}
            </div>
            <div style={{ position: 'absolute', bottom: -4, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 16, fontSize: '0.7rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ca-success)' }}>
                    <span style={{ width: 10, height: 10, background: 'var(--ca-success)', borderRadius: 2 }} /> {homeLabel} {safeHome}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ca-accent)' }}>
                    <span style={{ width: 10, height: 10, background: 'var(--ca-accent)', borderRadius: 2 }} /> {awayLabel} {safeAway}
                </span>
            </div>
        </div>
    );
}
