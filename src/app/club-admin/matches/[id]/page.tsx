import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
import { EmptyState } from '@/components/admin/ui';
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

  // Run the access check in parallel with the heavy match fetch. Most of
  // these requests succeed, so overlapping the auth + the data load shaves
  // ~one round-trip off the time-to-first-byte. If access is denied we
  // discard the match data and render the EmptyState as before.
  const accessPromise = checkClubMatchAccess(matchId, clubIdFromQuery || null);
  const readClientPromise = getReadClient();

  type MatchReadResult = Awaited<ReturnType<typeof fetchMatchCenterMatch>>;
  const matchPromise: Promise<MatchReadResult | { data: null; error: Error }> =
    readClientPromise
      .then((client) => fetchMatchCenterMatch(client, matchId))
      .catch((err: unknown) => ({
        data: null,
        error: err instanceof Error ? err : new Error('Failed to load match.'),
      }));

  const access = await accessPromise;

  if (!access.allowed) {
    return (
      <EmptyState
        kicker="Acceso"
        title="Acceso restringido"
        description={`No tenés permisos para ver este partido desde el panel de club. Club esperado: ${clubIdFromQuery || 'no especificado'}. Si creaste el partido recientemente, espera unos segundos y recarga.`}
        icon={<Lock className="h-8 w-8" />}
        actions={[{ label: 'Volver al panel de club', href: '/club-admin' }]}
      />
    );
  }

  const { data: match, error } = await matchPromise;

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
