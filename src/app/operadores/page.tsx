import Link from 'next/link';

export default function OperadoresPage() {
    return (
        <div className="container" style={{ paddingTop: '48px', paddingBottom: '64px' }}>
            <div className="card">
                <h1 style={{ marginBottom: '8px' }}>Gestión de operadores</h1>
                <p style={{ marginBottom: '24px' }}>
                    Esta sección conecta con el panel de administración para gestionar operadores.
                </p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Link href="/admin/super/operadores" className="btn btn-primary">Ir al panel</Link>
                    <Link href="/" className="btn btn-secondary">Volver al inicio</Link>
                </div>
            </div>
        </div>
    );
}
