import { notFound } from 'next/navigation';
import ClubMatchWorkspace from './ClubMatchWorkspace';
import { checkClubMatchAccess } from '@/lib/club-admin/matchAccess';
import { fetchMatchCenterMatch } from '@/lib/services/matchCenterService';
import { getReadClient } from '@/lib/supabase/read';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string; club?: string }>;
}

function mapClubSectionToWorkspaceTab(section?: string | null) {
  switch (section) {
    case 'resumen':
    case 'overview':
    case 'notas':
    case 'prepartido':
      return 'resumen';
    case 'convocatoria':
    case 'lineup':
    case 'alineacion':
      return 'alineacion';
    case 'stats':
    case 'estadisticas':
      return 'estadisticas';
    case 'live':
    case 'vivo':
      return 'vivo';
    case 'postpartido':
      return 'postpartido';
    case 'pizarron':
    case 'contenido':
    case 'prensa':
      return 'contenido';
    default:
      return 'resumen';
  }
}

export default async function ClubMatchPage({ params, searchParams }: PageProps) {
  const { id: matchId } = await params;
  const { section, club: clubIdFromQuery } = await searchParams;

  // Use club from query param if provided (from club admin panel), otherwise let checkClubMatchAccess resolve it
  const access = await checkClubMatchAccess(matchId, clubIdFromQuery || null);

  if (!access.allowed) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="text-red-400 text-4xl mb-4">Acceso</div>
          <h1 className="text-xl font-bold mb-2">Acceso restringido</h1>
          <p className="text-white/60 text-sm mb-2">
            No tenés permisos para ver este partido desde el panel de club.
          </p>
          <p className="text-white/40 text-xs mb-2">
            Club esperado: {clubIdFromQuery || 'no especificado'}
          </p>
          <p className="text-white/40 text-xs mb-6">
            Si creaste el partido recientemente, espera unos segundos y recarga.
          </p>
          <a
            href="/club-admin"
            className="inline-block px-4 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20"
          >
            Volver al panel de club
          </a>
        </div>
      </div>
    );
  }

  const readClient = await getReadClient();

  const { data: match, error } = await fetchMatchCenterMatch(readClient, matchId);

  if (error || !match) {
    notFound();
  }

  const resolvedClubId = access.clubId!;
  return (
    <ClubMatchWorkspace
      match={match}
      clubId={resolvedClubId}
      divisions={[]}
      initialSection={mapClubSectionToWorkspaceTab(section)}
      isHome={access.isHome}
      isAway={access.isAway}
    />
  );
}
