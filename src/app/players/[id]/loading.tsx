export default function PlayerLoading() {
    const pulse = { animation: 'pulse 1.5s ease-in-out infinite' } as React.CSSProperties;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0f1117)', color: '#fff' }}>
            {/* Profile header */}
            <div style={{
                background: 'linear-gradient(135deg, #1a1f2e 0%, #16213e 100%)',
                padding: '24px 16px 28px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                {/* Back */}
                <div style={{ width: 80, height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: 20, ...pulse }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {/* Avatar */}
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', flexShrink: 0, ...pulse }} />
                    <div style={{ flex: 1 }}>
                        {/* Name */}
                        <div style={{ width: '50%', height: 22, borderRadius: 4, background: 'rgba(255,255,255,0.12)', marginBottom: 10, ...pulse }} />
                        {/* Position + Club */}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ width: 72, height: 20, borderRadius: 4, background: 'rgba(255,255,255,0.07)', ...pulse }} />
                            <div style={{ width: 90, height: 20, borderRadius: 4, background: 'rgba(255,255,255,0.07)', ...pulse }} />
                        </div>
                    </div>
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    {[72, 72, 72, 72].map((w, i) => (
                        <div key={i} style={{ width: w, height: 48, borderRadius: 8, background: 'rgba(255,255,255,0.06)', ...pulse }} />
                    ))}
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {[80, 72].map((w, i) => (
                    <div key={i} style={{ width: w, height: 32, borderRadius: 6, background: i === 0 ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)', ...pulse }} />
                ))}
            </div>

            {/* Content */}
            <div style={{ padding: '16px', maxWidth: 700, margin: '0 auto' }}>
                {[1, 2, 3].map(i => (
                    <div key={i} style={{ height: 64, borderRadius: 8, background: 'rgba(255,255,255,0.04)', marginBottom: 10, ...pulse }} />
                ))}
            </div>

            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
        </div>
    );
}
