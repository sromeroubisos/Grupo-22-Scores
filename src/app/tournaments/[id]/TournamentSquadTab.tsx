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

/**
 * La placa: una fila por club con su total y, debajo del nombre, lo que aporta
 * cada categoría en la que juega (la que no juega no figura).
 */
function buildSquadExportData(
    data: SquadTableData,
    { tournamentName, tournamentLogo }: { tournamentName?: string; tournamentLogo?: string },
): StandingsData {
    const categories = data.categories ?? [];
    const group = (data.groupName || '').split('·').map((part) => part.trim()).filter(Boolean).pop();
    return {
        variant: 'ladder',
        title: 'TABLA DE PLANTELES',
        subtitle: [group, tournamentName?.trim()].filter(Boolean).filter((part, i, all) => all.indexOf(part) === i).join(' · ') || 'Planteles',
        tournamentLogo,
        columnLabels: { points: 'PTS', diff: '' },
        rows: (data.rows ?? []).map((row) => ({
            pos: row.position,
            team: row.club.name,
            teamFull: row.club.name,
            teamLogo: row.club.logo || undefined,
            caption: categories
                .filter((category) => row.categories[category.id] !== undefined)
                .map((category) => `${category.label} ${fmt(row.categories[category.id])}`)
                .join(' · '),
            played: 0,
            won: 0,
            lost: 0,
            diff: '',
            points: fmt(row.points),
            pointsDeltaTone: 'neutral' as const,
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
                                <div key={category.id} className={optional} title={category.label}>
                                    {category.label.length > 6 ? `${category.label.slice(0, 5)}…` : category.label}
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
