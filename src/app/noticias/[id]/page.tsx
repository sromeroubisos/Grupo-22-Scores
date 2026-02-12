import Link from 'next/link';

interface NewsPageProps {
    params: { id: string };
}

export default function NewsPage({ params }: NewsPageProps) {
    return (
        <div className="container" style={{ paddingTop: '48px', paddingBottom: '64px' }}>
            <div className="card">
                <h1 style={{ marginBottom: '8px' }}>Noticia</h1>
                <p style={{ marginBottom: '24px' }}>
                    Detalle de noticia en preparación. ID: <strong>{params.id}</strong>.
                </p>
                <Link href="/" className="btn btn-secondary">Volver al inicio</Link>
            </div>
        </div>
    );
}
