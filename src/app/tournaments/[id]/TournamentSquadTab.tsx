'use client';

/**
 * Tab "Tabla de Planteles": la clasificación general de los clubes de una
 * agrupación de categorías. La arma el servidor (/api/db/tournaments/[id]/squad-table)
 * con las tablas que ya existen; acá solo se muestra, con las mismas clases que
 * la histórica. El desglose por categoría vive en columnas que el celular oculta.
 */

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { type StandingsData } from '@/components/ExportImage';
import styles from './page.module.css';

// Solo hace falta si alguien abre el modal: entra en diferido, como en la histórica.
const ExportImage = dynamic(() => import('@/components/ExportImage'), { ssr: false });

export type SquadTableData = {
    available: boolean;
    groupName?: string;
    categories?: Array<{ id: string; label: string; tournamentId: string }>;
    rows?: Array<{
        position: number;
        points: number;
        played: number;
        categories: Record<string, number>;
        club: { id: string; name: string; logo: string | null };
    }>;
};

const fmt = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

// Las columnas son angostas: "Top 10" pasa a "Top10" (sin el espacio entra en cinco
// letras) y lo que siga largo se corta con un punto. El nombre completo va en el title.
const shortCategoryLabel = (label: string) => {
    const text = label.trim();
    if (text.length <= 5) return text;
    const compact = text.replace(/\s+/g, '');
    return compact.length <= 5 ? compact : `${compact.slice(0, 4)}.`;
};

/**
 * La placa de tabla normal (la misma de las posiciones): sus cuatro columnas
 * numéricas llevan lo que aporta cada categoría (hasta cuatro) y la última, el
 * total. Si sobra lugar, la primera columna libre es el total de partidos
 * jugados. El guion es una categoría en la que el club no compite.
 */
function buildSquadExportData(
    data: SquadTableData,
    { tournamentName, tournamentLogo }: { tournamentName?: string; tournamentLogo?: string },
): StandingsData {
    const categories = (data.categories ?? []).slice(0, 4);
    const group = (data.groupName || '').split('·').map((part) => part.trim()).filter(Boolean).pop();
    // Una entrada por columna: la categoría, el total de PJ o una columna vacía.
    type Slot = { label: string; value: (row: NonNullable<SquadTableData['rows']>[number]) => string };
    const slots: Slot[] = categories.map((category) => ({
        label: shortCategoryLabel(category.label),
        value: (row) => (row.categories[category.id] === undefined ? '–' : fmt(row.categories[category.id])),
    }));
    if (slots.length < 4) slots.push({ label: 'PJ', value: (row) => String(row.played) });
    while (slots.length < 4) slots.push({ label: '–', value: () => '' });
    const [first, second, third, fourth] = slots;

    return {
        title: tournamentName?.trim() || group || 'Tabla de planteles',
        subtitle: group && group !== tournamentName?.trim() ? group : 'Planteles',
        kicker: 'Tabla de planteles',
        entityLabel: 'Club',
        tournamentLogo,
        columnLabels: { played: first.label, won: second.label, lost: third.label, diff: fourth.label, points: 'PTS' },
        rows: (data.rows ?? []).map((row) => ({
            pos: row.position,
            team: row.club.name,
            teamFull: row.club.name,
            teamLogo: row.club.logo || undefined,
            played: first.value(row),
            won: second.value(row),
            lost: third.value(row),
            diff: fourth.value(row),
            points: fmt(row.points),
        })),
        showPositionDelta: false,
    };
}

export default function TournamentSquadTab({
    data,
    tournamentName,
    tournamentLogo,
    onExportData,
}: {
    data: SquadTableData;
    tournamentName?: string;
    tournamentLogo?: string;
    onExportData?: (data: StandingsData | null) => void;
}) {
    const rows = data.rows ?? [];
    const categories = data.categories ?? [];

    const exportData = useMemo(
        () => (rows.length > 0 ? buildSquadExportData(data, { tournamentName, tournamentLogo }) : null),
        [data, rows.length, tournamentLogo, tournamentName],
    );
    useEffect(() => {
        onExportData?.(exportData);
    }, [exportData, onExportData]);
    // Al salir de la pestaña, la cabecera del celular deja de ofrecer esta placa.
    useEffect(() => () => onExportData?.(null), [onExportData]);

    if (rows.length === 0) {
        return <p className={styles.emptyState}>Todavía no hay clubes con puntos para sumar.</p>;
    }
    const optional = `${styles.colVal} ${styles.historicalOptional}`;

    return (
        <>
            <div className={styles.standingsToolbar}>
                <span className={styles.historicalToolbarTitle}>{data.groupName || 'Tabla de Planteles'}</span>
                {exportData && (
                    <ExportImage
                        template="standings"
                        filename={`tabla-de-planteles-${tournamentName || 'torneo'}`}
                        data={exportData}
                    />
                )}
            </div>
            <div className={styles.standingsContainer}>
                <div className={styles.sectionCard}>
                    <div className={styles.tableCard}>
                        <div className={styles.tableHeader}>
                            <div className={styles.colPos}>#</div>
                            <div className={styles.colTeam}>Club</div>
                            {categories.map((category) => (
                                <div key={category.id} className={optional} title={category.label} style={{ whiteSpace: 'nowrap', letterSpacing: 0 }}>
                                    {shortCategoryLabel(category.label)}
                                </div>
                            ))}
                            <div className={`${styles.colPts} ${styles.historicalPts}`}>PTS</div>
                        </div>
                        {rows.map((row) => (
                            <div key={row.club.id} className={styles.tableRow}>
                                <div className={styles.colPos}>{row.position}</div>
                                <div className={styles.colTeam}>
                                    {row.club.logo
                                        ? (
                                            <img
                                                src={row.club.logo}
                                                alt=""
                                                className={styles.teamLogo}
                                                loading="lazy"
                                                onError={(event) => { (event.target as HTMLImageElement).style.visibility = 'hidden'; }}
                                            />
                                        )
                                        : <div className={styles.teamLogoPlaceholder} />}
                                    <div className={styles.colTeamMeta}>
                                        <Link href={`/clubs/${encodeURIComponent(row.club.id)}`} className={styles.colTeamName}>
                                            {row.club.name}
                                        </Link>
                                    </div>
                                </div>
                                {categories.map((category) => (
                                    <div key={category.id} className={optional}>
                                        {row.categories[category.id] === undefined ? '–' : fmt(row.categories[category.id])}
                                    </div>
                                ))}
                                <div className={`${styles.colPts} ${styles.historicalPts}`}>{fmt(row.points)}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <p className={styles.historicalIntro}>
                    Suma los puntos de cada categoría en la que el club participa en la temporada vigente.
                    Un guion indica que el club no compite en esa categoría.
                </p>
            </div>
        </>
    );
}
