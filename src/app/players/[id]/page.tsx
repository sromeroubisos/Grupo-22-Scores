import JugadoresPage from '@/app/jugadores/[id]/page';

export default function CanonicalPlayerPage({ params }: { params: Promise<{ id: string }> }) {
    return <JugadoresPage params={params} />;
}
