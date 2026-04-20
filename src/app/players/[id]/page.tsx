import PlayerDetailClientPage from './PlayerDetailClientPage';

export default async function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    return <PlayerDetailClientPage id={id} />;
}
