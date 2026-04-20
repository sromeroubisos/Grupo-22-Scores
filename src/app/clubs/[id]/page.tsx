import TeamDetailClientPage from './TeamDetailClientPage';

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    return <TeamDetailClientPage id={id} />;
}
