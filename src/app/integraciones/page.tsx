import Link from 'next/link';

export default function IntegracionesPage() {
    return (
        <div className="container" style={{ paddingTop: '48px', paddingBottom: '64px' }}>
            <div className="card">
                <h1 style={{ marginBottom: '8px' }}>Integraciones</h1>
                <p style={{ marginBottom: '24px' }}>
                    Acceso directo al panel de integraciones para administradores.
                </p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Link href="/admin/super/integraciones" className="btn btn-primary">Ir al panel</Link>
                    <Link href="/" className="btn btn-secondary">Volver al inicio</Link>
                </div>
            </div>
        </div>
    );
}
