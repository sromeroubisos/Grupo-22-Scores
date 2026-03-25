export default function HomeLoading() {
    const pulse = { animation: 'pulse 1.5s ease-in-out infinite' } as React.CSSProperties;
    const skeletonBg = { background: 'rgba(255,255,255,0.07)' };
    const skeletonBgDim = { background: 'rgba(255,255,255,0.04)' };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0f1117)' }}>
            {/* Sport bar */}
            <div style={{ display: 'flex', gap: 8, padding: '12px 16px', overflowX: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {[56, 72, 64, 48, 80, 56, 72].map((w, i) => (
                    <div key={i} style={{ width: w, height: 32, borderRadius: 16, flexShrink: 0, ...skeletonBg, ...pulse }} />
                ))}
            </div>

            {/* Date selector */}
            <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {[40, 40, 40, 40, 40, 40, 40].map((w, i) => (
                    <div key={i} style={{ width: w, height: 48, borderRadius: 8, flexShrink: 0, ...skeletonBgDim, ...pulse }} />
                ))}
            </div>

            {/* Match list */}
            <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 12px' }}>
                {[0, 1, 2].map(group => (
                    <div key={group} style={{ marginTop: 20 }}>
                        {/* Tournament header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', marginBottom: 4 }}>
                            <div style={{ width: 24, height: 24, borderRadius: 4, ...skeletonBg, ...pulse }} />
                            <div style={{ width: 140, height: 14, borderRadius: 4, ...skeletonBg, ...pulse }} />
                        </div>
                        {/* Match rows */}
                        {[0, 1, 2].map(row => (
                            <div key={row} style={{ height: 60, borderRadius: 10, marginBottom: 6, ...skeletonBgDim, ...pulse }} />
                        ))}
                    </div>
                ))}
            </div>

            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
        </div>
    );
}
