export default function ClubLoading() {
    const pulse = { animation: 'pulse 1.5s ease-in-out infinite' } as React.CSSProperties;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0f1117)', color: '#fff' }}>
            {/* Hero */}
            <div style={{
                background: 'linear-gradient(135deg, #1a1f2e 0%, #16213e 100%)',
                padding: '24px 16px 28px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                {/* Back */}
                <div style={{ width: 80, height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: 20, ...pulse }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {/* Logo */}
                    <div style={{ width: 72, height: 72, borderRadius: 12, background: 'rgba(255,255,255,0.08)', flexShrink: 0, ...pulse }} />
                    <div style={{ flex: 1 }}>
                        {/* Club name */}
                        <div style={{ width: '55%', height: 24, borderRadius: 4, background: 'rgba(255,255,255,0.12)', marginBottom: 10, ...pulse }} />
                        {/* Sport badges */}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ width: 60, height: 22, borderRadius: 11, background: 'rgba(255,255,255,0.06)', ...pulse }} />
                            <div style={{ width: 48, height: 22, borderRadius: 11, background: 'rgba(255,255,255,0.06)', ...pulse }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
                {[80, 96, 72, 80, 104].map((w, i) => (
                    <div key={i} style={{ width: w, height: 32, borderRadius: 6, flexShrink: 0, background: i === 0 ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)', ...pulse }} />
                ))}
            </div>

            {/* Content */}
            <div style={{ padding: '16px', maxWidth: 900, margin: '0 auto' }}>
                <div style={{ height: 90, borderRadius: 12, background: 'rgba(255,255,255,0.05)', marginBottom: 16, ...pulse }} />
                {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{ height: 56, borderRadius: 8, background: 'rgba(255,255,255,0.04)', marginBottom: 8, ...pulse }} />
                ))}
            </div>

            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
        </div>
    );
}
