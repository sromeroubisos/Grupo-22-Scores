import FotmobLeagueClient from './FotmobLeagueClient';

// Prueba de diseño: la pantalla de liga de FotMob con los datos reales del torneo.
export default async function FotmobLeaguePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <FotmobLeagueClient id={id} />;
}
