import { redirect } from 'next/navigation';

/**
 * Redirect canónico al gestor unificado.
 *
 * Acá vivía un SEGUNDO editor de club (Identidad / Sedes / Divisiones / Config /
 * Publicar) que pisaba al de `/admin/entities/[id]/manage?type=club` y lo hacía
 * peor: la unión se escribía como ID crudo, no había deporte ni región ni país,
 * y el escudo era un textarea sin uploader — con los clubes que tienen el logo
 * en base64, ese campo mostraba 867.634 caracteres y no había forma de subir uno
 * nuevo. Sedes y Publicar se mudaron al gestor como pestañas propias; las
 * divisiones viven dentro de Jugadores.
 *
 * La página vieja está guardada en `proyecto-club-suite/`.
 */
export default async function SuperClubManageRedirect({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ tab?: string }>;
}) {
    const { id } = await params;
    const { tab } = await searchParams;

    const query = new URLSearchParams({ type: 'club' });
    // Los nombres viejos (identidad, divisiones, config...) los traduce
    // normalizeClubManagerTab en destino: acá se pasan tal cual.
    if (tab) query.set('tab', tab);

    redirect(`/admin/entities/${encodeURIComponent(id)}/manage?${query.toString()}`);
}
