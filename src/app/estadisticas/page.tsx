import Link from 'next/link';

export default function EstadisticasPage() {
    return (
        <div className="container" style={{ paddingTop: '48px', paddingBottom: '64px' }}>
            <div className="card">
                <h1 style={{ marginBottom: '8px' }}>Estadísticas</h1>
                <p style={{ marginBottom: '24px' }}>
                    Este módulo está en preparación. Aquí vas a encontrar métricas, líderes y análisis avanzados.
                </p>
                <Link href="/" className="btn btn-secondary">Volver al inicio</Link>
            </div>
        </div>
    );
}
