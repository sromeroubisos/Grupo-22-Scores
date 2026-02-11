import Link from 'next/link';

interface ClubPageProps {
    params: { id: string };
}

export default function ClubPage({ params }: ClubPageProps) {
    return (
        <div className="container" style={{ paddingTop: '48px', paddingBottom: '64px' }}>
            <div className="card">
                <h1 style={{ marginBottom: '8px' }}>Perfil de club</h1>
                <p style={{ marginBottom: '24px' }}>
                    Perfil del club en preparación. ID o slug: <strong>{params.id}</strong>.
                </p>
                <Link href="/clubes" className="btn btn-secondary">Volver a clubes</Link>
            </div>
        </div>
    );
}
