import Link from 'next/link';

export default function AyudaPage() {
    return (
        <div className="container" style={{ paddingTop: '48px', paddingBottom: '64px' }}>
            <div className="card">
                <h1 style={{ marginBottom: '8px' }}>Centro de ayuda</h1>
                <p style={{ marginBottom: '24px' }}>
                    Estamos preparando guías y documentación para administradores y usuarios.
                </p>
                <Link href="/" className="btn btn-secondary">Volver al inicio</Link>
            </div>
        </div>
    );
}
