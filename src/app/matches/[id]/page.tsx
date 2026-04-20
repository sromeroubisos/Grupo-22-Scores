import MatchDetailClientPage from './MatchDetailClientPage';

export default async function PartidoDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    return <MatchDetailClientPage id={id} />;
}
