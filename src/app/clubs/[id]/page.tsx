import ClubesPage from '@/app/clubes/[id]/page';

export default function CanonicalClubPage({ params }: { params: Promise<{ id: string }> }) {
    return <ClubesPage params={params} />;
}
