import Link from 'next/link';

export default function ExportarPage() {
    return (
        <div className="container" style={{ paddingTop: '48px', paddingBottom: '64px' }}>
            <div className="card">
                <h1 style={{ marginBottom: '8px' }}>Exportar contenido</h1>
                <p style={{ marginBottom: '24px' }}>
                    En breve podrás exportar tablas, resultados y reportes desde esta sección.
                </p>
                <Link href="/" className="btn btn-secondary">Volver al inicio</Link>
            </div>
        </div>
    );
}
