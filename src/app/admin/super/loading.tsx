export default function SuperAdminLoading() {
    const pulse = { animation: 'pulse 1.5s ease-in-out infinite' } as React.CSSProperties;
    const card = { height: 80, borderRadius: 10, background: 'rgba(255,255,255,0.05)', ...pulse };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0f1117)', color: '#fff', padding: '24px' }}>
            {/* Page title */}
            <div style={{ width: 200, height: 24, borderRadius: 4, background: 'rgba(255,255,255,0.10)', marginBottom: 24, ...pulse }} />

            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
                {[0, 1, 2, 3].map(i => (
                    <div key={i} style={card} />
                ))}
            </div>

            {/* Table header */}
            <div style={{ height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.07)', marginBottom: 8, ...pulse }} />

            {/* Table rows */}
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} style={{ height: 48, borderRadius: 6, background: 'rgba(255,255,255,0.03)', marginBottom: 4, ...pulse }} />
            ))}

            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
        </div>
    );
}
