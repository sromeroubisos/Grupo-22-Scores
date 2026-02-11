import Link from 'next/link';

export default function ContactoPage() {
    return (
        <div className="container" style={{ paddingTop: '48px', paddingBottom: '64px' }}>
            <div className="card">
                <h1 style={{ marginBottom: '8px' }}>Contacto</h1>
                <p style={{ marginBottom: '24px' }}>
                    Vamos a habilitar este canal de soporte pronto. Mientras tanto, usá el panel de ayuda.
                </p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Link href="/ayuda" className="btn btn-primary">Ir a ayuda</Link>
                    <Link href="/" className="btn btn-secondary">Volver al inicio</Link>
                </div>
            </div>
        </div>
    );
}
