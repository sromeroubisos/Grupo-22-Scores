import Link from 'next/link';

export default function TerminosPage() {
    return (
        <div className="container" style={{ paddingTop: '48px', paddingBottom: '64px' }}>
            <div className="card">
                <h1 style={{ marginBottom: '8px' }}>Términos de uso</h1>
                <p style={{ marginBottom: '24px' }}>
                    Esta página se publicará con los términos oficiales del servicio.
                </p>
                <Link href="/" className="btn btn-secondary">Volver al inicio</Link>
            </div>
        </div>
    );
}
