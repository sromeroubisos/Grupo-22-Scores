export default function TournamentLoading() {
    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary, #0f1117)', color: '#fff' }}>
            {/* Header skeleton */}
            <div style={{
                background: 'linear-gradient(135deg, #1a1f2e 0%, #16213e 100%)',
                padding: '24px 16px 32px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                {/* Back button */}
                <div style={{ width: 80, height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: 20, animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {/* Logo */}
                    <div style={{ width: 64, height: 64, borderRadius: 12, background: 'rgba(255,255,255,0.08)', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
                    <div style={{ flex: 1 }}>
                        {/* Tournament name */}
                        <div style={{ width: '60%', height: 24, borderRadius: 4, background: 'rgba(255,255,255,0.12)', marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
                        {/* Country + year */}
                        <div style={{ width: '40%', height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.07)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    </div>
                </div>
                {/* Stats row */}
                <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                    {[80, 96, 80, 96].map((w, i) => (
                        <div key={i} style={{ width: w, height: 48, borderRadius: 8, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    ))}
                </div>
            </div>

            {/* Tabs skeleton */}
            <div style={{ display: 'flex', gap: 4, padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
                {[72, 88, 64, 104, 64, 72, 88].map((w, i) => (
                    <div key={i} style={{ width: w, height: 32, borderRadius: 6, background: i === 0 ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))}
            </div>

            {/* Content skeleton */}
            <div style={{ padding: '16px', maxWidth: 900, margin: '0 auto' }}>
                {/* Featured match card */}
                <div style={{ height: 100, borderRadius: 12, background: 'rgba(255,255,255,0.05)', marginBottom: 20, animation: 'pulse 1.5s ease-in-out infinite' }} />
                {/* Match rows */}
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} style={{ height: 56, borderRadius: 8, background: 'rgba(255,255,255,0.04)', marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))}
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
            `}</style>
        </div>
    );
}
