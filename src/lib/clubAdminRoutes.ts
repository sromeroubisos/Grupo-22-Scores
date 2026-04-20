export type ClubConsoleMode = 'admin' | 'club-admin';

function withQuery(pathname: string, searchParams: URLSearchParams) {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
}

export function buildClubManageHref(
    clubId: string,
    tab = 'general',
    mode: ClubConsoleMode = 'admin'
) {
    if (mode === 'club-admin') {
        const searchParams = new URLSearchParams({
            club: clubId,
            tab,
            type: 'club',
        });

        return withQuery('/club-admin', searchParams);
    }

    const searchParams = new URLSearchParams({
        type: 'club',
        tab,
    });

    return withQuery(`/admin/entities/${encodeURIComponent(clubId)}/manage`, searchParams);
}

export function buildClubRosterHref(
    clubId: string,
    squadId: string,
    mode: ClubConsoleMode = 'admin'
) {
    if (mode === 'club-admin') {
        return `/club-admin/clubes/${encodeURIComponent(clubId)}/planteles/${encodeURIComponent(squadId)}`;
    }

    return `/admin/super/clubes/${encodeURIComponent(clubId)}/planteles/${encodeURIComponent(squadId)}`;
}

export function buildClubCreateHref(
    mode: ClubConsoleMode = 'admin',
    options?: {
        derivedFrom?: string | null;
        derivativeType?: string | null;
        derivedSport?: string | null;
    }
) {
    const pathname = mode === 'club-admin' ? '/club-admin/clubes/crear' : '/admin/super/clubes/crear';
    const searchParams = new URLSearchParams();

    if (options?.derivedFrom) searchParams.set('derivedFrom', options.derivedFrom);
    if (options?.derivativeType) searchParams.set('derivativeType', options.derivativeType);
    if (options?.derivedSport) searchParams.set('derivedSport', options.derivedSport);

    return withQuery(pathname, searchParams);
}
