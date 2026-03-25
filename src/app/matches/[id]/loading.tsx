export default function MatchLoading() {
    const pulse = { animation: 'pulse 1.5s ease-in-out infinite' } as React.CSSProperties;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0f1117)', color: '#fff' }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, #1a1f2e 0%, #16213e 100%)',
                padding: '16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                {/* Breadcrumb */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', ...pulse }} />
                    <div style={{ width: 120, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.07)', ...pulse }} />
                </div>

                {/* Teams + Score */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    {/* Home team */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
                        <div style={{ width: 56, height: 56, borderRadius: 8, background: 'rgba(255,255,255,0.08)', ...pulse }} />
                        <div style={{ width: '70%', height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.07)', ...pulse }} />
                    </div>

                    {/* Score + status */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 80, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.10)', ...pulse }} />
                        <div style={{ width: 60, height: 20, borderRadius: 12, background: 'rgba(255,255,255,0.06)', ...pulse }} />
                    </div>

                    {/* Away team */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
                        <div style={{ width: 56, height: 56, borderRadius: 8, background: 'rgba(255,255,255,0.08)', ...pulse }} />
                        <div style={{ width: '70%', height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.07)', ...pulse }} />
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
                {[80, 64, 72, 96, 64, 88].map((w, i) => (
                    <div key={i} style={{ width: w, height: 32, borderRadius: 6, flexShrink: 0, background: i === 0 ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)', ...pulse }} />
                ))}
            </div>

            {/* Content */}
            <div style={{ padding: '16px', maxWidth: 700, margin: '0 auto' }}>
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} style={{ height: 52, borderRadius: 8, background: 'rgba(255,255,255,0.04)', marginBottom: 8, ...pulse }} />
                ))}
            </div>

            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
        </div>
    );
}
