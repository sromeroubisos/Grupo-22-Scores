import Link from 'next/link';

interface PlayerPageProps {
    params: { id: string };
}

export default function PlayerPage({ params }: PlayerPageProps) {
    return (
        <div className="container" style={{ paddingTop: '48px', paddingBottom: '64px' }}>
            <div className="card">
                <h1 style={{ marginBottom: '8px' }}>Perfil de jugador</h1>
                <p style={{ marginBottom: '24px' }}>
                    Perfil del jugador en preparación. ID o slug: <strong>{params.id}</strong>.
                </p>
                <Link href="/jugadores" className="btn btn-secondary">Volver a jugadores</Link>
            </div>
        </div>
    );
}
