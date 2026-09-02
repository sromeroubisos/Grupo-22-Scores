'use client';

// Banco de pruebas de las familias de export. No toca datos reales: arma tres
// piezas con escudos locales para poder comparar familias sin entrar al gestor.
// Si molesta en produccion, esta carpeta se borra sola sin dejar imports sueltos.

import { useEffect, useState } from 'react';
import { ExportImagePreview, type DailyMatchesData, type LineupsData, type MatchStatsData, type SquadData, type StandingsData } from '@/components/ExportImage';
import type { ExportVisualFamily } from '@/lib/exports/activeDesign';

const FAMILIES: Array<{ value: ExportVisualFamily; label: string }> = [
    { value: 'fanV5', label: 'Fan V5' },
    { value: 'impactoV4', label: 'Impacto V4' },
    { value: 'g22Base', label: 'G22 Base' },
    { value: 'momentumV2', label: 'Momentum V2' },
    { value: 'posterV3', label: 'Poster V3' },
];

// El torneo va rotulado con el pais adelante a proposito: asi llegan los del
// feed externo, y la pieza tiene que mostrarlo SIN el pais.
const MATCH: MatchStatsData = {
    mainTitle: 'Final',
    status: 'final',
    homeTeam: 'Canterbury',
    awayTeam: 'Northland',
    homeScore: 27,
    awayScore: 29,
    homeLogo: '/clubs/canterbury.png',
    awayLogo: '/clubs/northland.png',
    tournament: 'Nueva Zelanda: Bunnings NPC',
    tournamentLogo: '/competiciones/ar-litoral-top10.png',
    sport: 'rugby',
    date: '17/08/2026',
    time: '05:54',
    venue: 'Apollo Projects Stadium',
    stats: [],
};

const STANDINGS: StandingsData = {
    title: 'Anual Tucumano',
    subtitle: 'Fecha 1',
    tournamentLogo: '/competiciones/ar-noa-a.png',
    rows: [
        { pos: 1, team: 'Tucuman Lawn Tennis', teamLogo: '/clubs/sb-tucuman-lawn-tennis.png', labelName: 'SF', zoneColor: '#16a34a', played: 1, won: 1, lost: 0, diff: '+18', points: 5 },
        { pos: 2, team: 'Tucuman Rugby', teamLogo: '/clubs/sb-tucuman-rugby-club.png', labelName: 'SF', zoneColor: '#16a34a', played: 1, won: 1, lost: 0, diff: '+12', points: 5 },
        { pos: 3, team: 'Universitario de Tucuman', teamLogo: '/clubs/sb-universitario-de-tucuman.png', labelName: 'SF', zoneColor: '#16a34a', played: 1, won: 1, lost: 0, diff: '+9', points: 4 },
        { pos: 4, team: 'Natacion y Gimnasia', teamLogo: '/clubs/sb-natacion-y-gimnasia.png', labelName: 'SF', zoneColor: '#16a34a', played: 1, won: 1, lost: 0, diff: '+6', points: 4 },
        { pos: 5, team: 'Los Tarcos', teamLogo: '/clubs/sb-los-tarcos.png', labelName: 'REG A', zoneColor: '#2563eb', played: 1, won: 0, lost: 1, diff: '-6', points: 1 },
        { pos: 6, team: 'Lince Rugby Club', teamLogo: '/clubs/sb-lince-rugby-club.png', labelName: 'REG A', zoneColor: '#2563eb', played: 1, won: 0, lost: 1, diff: '-9', points: 1 },
        { pos: 7, team: 'Cardenales Rugby Club', teamLogo: '/clubs/sb-cardenales-r-c.png', labelName: 'REG A', zoneColor: '#2563eb', played: 1, won: 0, lost: 1, diff: '-12', points: 0 },
        { pos: 8, team: 'Jockey Club Tucuman', teamLogo: '/clubs/sb-jockey-club-de-tucuman.png', labelName: 'REG A', zoneColor: '#2563eb', played: 1, won: 0, lost: 1, diff: '-18', points: 0 },
        { pos: 9, team: 'Huirapuca', teamLogo: '/clubs/sb-huirapuca.png', played: 0, won: 0, lost: 0, diff: '0', points: 0 },
    ],
};

const FIXTURE: DailyMatchesData = {
    date: 'Dia 1 - Viernes',
    tournament: 'Seven de MDQ',
    tournamentLogo: '/competiciones/ar-nacional-de-clubes.png',
    matches: [
        { homeTeam: 'Duendes', awayTeam: 'Jockey Rosario', homeLogo: '/clubs/sb-duendes-r-c.png', awayLogo: '/clubs/sb-jockey-club-de-rosario.png', time: '17:40', status: 'scheduled' },
        { homeTeam: 'Los Tarcos', awayTeam: 'Lince Rugby Club', homeLogo: '/clubs/sb-los-tarcos.png', awayLogo: '/clubs/sb-lince-rugby-club.png', time: '18:00', status: 'scheduled' },
        { homeTeam: 'Tucuman Rugby', awayTeam: 'Huirapuca', homeLogo: '/clubs/sb-tucuman-rugby-club.png', awayLogo: '/clubs/sb-huirapuca.png', time: '18:20', status: 'scheduled' },
        { homeTeam: 'Cardenales', awayTeam: 'Natacion y Gimnasia', homeLogo: '/clubs/sb-cardenales-r-c.png', awayLogo: '/clubs/sb-natacion-y-gimnasia.png', time: '19:10', status: 'scheduled' },
        { homeTeam: 'Tucuman Lawn Tennis', awayTeam: 'Atletico del Rosario', homeLogo: '/clubs/sb-tucuman-lawn-tennis.png', awayLogo: '/clubs/sb-atletico-del-rosario.png', time: '19:30', status: 'scheduled' },
        { homeTeam: 'Jockey Tucuman', awayTeam: 'Duendes', homeLogo: '/clubs/sb-jockey-club-de-tucuman.png', awayLogo: '/clubs/sb-duendes-r-c.png', time: '19:50', status: 'scheduled' },
        { homeTeam: 'Huirapuca', awayTeam: 'Los Tarcos', homeLogo: '/clubs/sb-huirapuca.png', awayLogo: '/clubs/sb-los-tarcos.png', time: '20:40', status: 'scheduled' },
        { homeTeam: 'Lince Rugby Club', awayTeam: 'Tucuman Lawn Tennis', homeLogo: '/clubs/sb-lince-rugby-club.png', awayLogo: '/clubs/sb-tucuman-lawn-tennis.png', time: '21:00', status: 'scheduled' },
    ],
};

// La vitrina: mismas filas que una tabla, pero `points` son titulos.
const PALMARES: StandingsData = {
    title: 'Torneo del Interior A',
    subtitle: 'Campeones',
    variant: 'palmares',
    columnLabels: { points: 'Titulos' },
    rows: [
        { pos: 1, team: 'Duendes', teamLogo: '/clubs/sb-duendes-r-c.png', played: 0, won: 0, lost: 0, diff: '', points: 9 },
        { pos: 2, team: 'Jockey Club de Rosario', teamLogo: '/clubs/sb-jockey-club-de-rosario.png', played: 0, won: 0, lost: 0, diff: '', points: 6 },
        { pos: 3, team: 'Tucuman Lawn Tennis', teamLogo: '/clubs/sb-tucuman-lawn-tennis.png', played: 0, won: 0, lost: 0, diff: '', points: 5 },
        { pos: 4, team: 'Universitario de Tucuman', teamLogo: '/clubs/sb-universitario-de-tucuman.png', played: 0, won: 0, lost: 0, diff: '', points: 3 },
        { pos: 5, team: 'Los Tarcos', teamLogo: '/clubs/sb-los-tarcos.png', played: 0, won: 0, lost: 0, diff: '', points: 2 },
        { pos: 6, team: 'Cardenales Rugby Club', teamLogo: '/clubs/sb-cardenales-r-c.png', played: 0, won: 0, lost: 0, diff: '', points: 1 },
    ],
};

const SQUAD: SquadData = {
    tournament: 'Top 10 del Litoral',
    teamName: 'Duendes',
    teamLogo: '/clubs/sb-duendes-r-c.png',
    subtitle: 'Plantel 2026',
    sport: 'rugby',
    groups: [
        {
            label: 'Forwards',
            players: [
                { number: 1, name: 'Mateo Alvarez', position: 'Pilar', age: 24 },
                { number: 2, name: 'Bruno Ferrero', position: 'Hooker', age: 27 },
                { number: 3, name: 'Ignacio Sosa', position: 'Pilar', age: 29 },
                { number: 4, name: 'Julian Riquelme', position: 'Segunda linea', age: 22 },
                { number: 5, name: 'Tomas Bengoechea', position: 'Segunda linea', age: 25 },
                { number: 6, name: 'Facundo Miranda', position: 'Ala', age: 23 },
                { number: 7, name: 'Santiago Peralta', position: 'Ala', age: 26 },
                { number: 8, name: 'Lucas Arrieta', position: 'Octavo', age: 28 },
            ],
        },
        {
            label: 'Backs',
            players: [
                { number: 9, name: 'Nicolas Vera', position: 'Medio scrum', age: 21 },
                { number: 10, name: 'Joaquin Blanco', position: 'Apertura', age: 24 },
                { number: 11, name: 'Emiliano Diaz', position: 'Wing', age: 20 },
                { number: 12, name: 'Martin Ocampo', position: 'Centro', age: 26 },
                { number: 13, name: 'Franco Ledesma', position: 'Centro', age: 25 },
                { number: 14, name: 'Agustin Rios', position: 'Wing', age: 22 },
                { number: 15, name: 'Pedro Solano', position: 'Fullback', age: 27 },
            ],
        },
    ],
};

const LINEUPS: LineupsData = {
    tournament: 'Nueva Zelanda: Bunnings NPC',
    title: 'Formaciones',
    date: '17/08/2026',
    time: '20:30',
    venue: 'Apollo Projects Stadium',
    kickoffAt: '2026-08-17T23:30:00Z',
    sport: 'rugby',
    // Foto de muestra para la formacion editorial: vive en /public/local-dev, que
    // git ignora. Sin el archivo, la pieza cae al escudo grande.
    backgroundImage: '/local-dev/formacion-foto.jpg',
    homeTeam: {
        name: 'Canterbury',
        logo: '/clubs/canterbury.png',
        starters: [
            { number: 1, name: 'Nicolas Revol Pitt' },
            { number: 2, name: 'Juan Ignacio Greising Revol' },
            { number: 3, name: 'Ignacio Sosa' },
            { number: 4, name: 'Rodrigo Fernandez Criado' },
            { number: 5, name: 'Tomas Bengoechea' },
            { number: 6, name: 'Facundo Miranda' },
            { number: 7, name: 'Santiago Peralta' },
            { number: 8, name: 'Lucas Arrieta', isCaptain: true },
            { number: 9, name: 'Nicolas Vera' },
            { number: 10, name: 'Joaquin Blanco' },
            { number: 11, name: 'Emiliano Diaz' },
            { number: 12, name: 'Martin Ocampo' },
            { number: 13, name: 'Franco Ledesma' },
            { number: 14, name: 'Agustin Rios' },
            { number: 15, name: 'Pedro Solano' },
            { number: 16, name: 'Gonzalo Prieto' },
            { number: 17, name: 'Ramiro Cardozo' },
            { number: 18, name: 'Ivan Barrios' },
        ],
    },
    awayTeam: {
        name: 'Northland',
        logo: '/clubs/northland.png',
        starters: [
            { number: 1, name: 'Diego Ferreyra' },
            { number: 2, name: 'Hernan Quiroga' },
            { number: 3, name: 'Leandro Bustos' },
            { number: 4, name: 'Matias Correa' },
            { number: 5, name: 'Rodrigo Nunez' },
            { number: 6, name: 'Alejo Medina' },
            { number: 7, name: 'Damian Torres', isCaptain: true },
            { number: 8, name: 'Cristian Vidal' },
            { number: 9, name: 'Lautaro Gimenez' },
            { number: 10, name: 'Sebastian Roldan' },
            { number: 11, name: 'Manuel Aguirre' },
            { number: 12, name: 'Federico Zarate' },
            { number: 13, name: 'Valentin Godoy' },
            { number: 14, name: 'Thiago Ponce' },
            { number: 15, name: 'Bautista Cabral' },
            { number: 16, name: 'Ezequiel Maidana' },
            { number: 17, name: 'Marcos Ibarra' },
        ],
    },
};

// Los mismos cuatro controles que el modal expone para Impacto V4.
const IMPACTO_CONTROLS: Array<{ id: 'field' | 'ink' | 'bar' | 'row'; label: string; placeholder: string }> = [
    { id: 'field', label: 'Principal', placeholder: '#1d6d92' },
    { id: 'ink', label: 'Tinta', placeholder: '#ffffff' },
    { id: 'bar', label: 'Barras', placeholder: '#2a3342' },
    { id: 'row', label: 'Filas', placeholder: '#111827' },
];

const PALETTES = [
    { id: 'navy', label: 'Rugby Navy', bgColor: '#0f172a', accentColor: '#38bdf8' },
    { id: 'crimson', label: 'Crimson Night', bgColor: '#111827', accentColor: '#ef4444' },
    { id: 'g22', label: 'G22 Dark', bgColor: '#0a0a0b', accentColor: '#00a365' },
];

// El estado inicial se puede fijar por query (?family=g22Base&palette=crimson
// &format=story&mode=horario) para poder capturar variantes sin ir a los botones.
function readQuery(key: string): string {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get(key)?.trim() || '';
}

export default function ExportLabPage() {
    const [family, setFamily] = useState<ExportVisualFamily>('impactoV4');
    const [paletteId, setPaletteId] = useState(PALETTES[0].id);
    const [format, setFormat] = useState<'1080x1350' | '1080x1920'>('1080x1350');
    const [matchMode, setMatchMode] = useState<'result' | 'schedule'>('result');
    const [impacto, setImpacto] = useState({ field: '', ink: '', bar: '', row: '' });

    // La query se lee despues de montar: en el initializer el server y el cliente
    // arrancan distinto y React tira error de hidratacion.
    useEffect(() => {
        const requestedFamily = readQuery('family');
        if (FAMILIES.some((option) => option.value === requestedFamily)) setFamily(requestedFamily as ExportVisualFamily);
        const requestedPalette = readQuery('palette');
        if (PALETTES.some((option) => option.id === requestedPalette)) setPaletteId(requestedPalette);
        if (readQuery('format') === 'story') setFormat('1080x1920');
        if (readQuery('mode') === 'horario') setMatchMode('schedule');

        // Los cuatro colores tambien entran por query, en hexa sin numeral:
        // ?field=1d6d92&ink=ffe600&bar=222222&row=0a0a0a
        const fromQuery = IMPACTO_CONTROLS.reduce((accumulator, control) => {
            const raw = readQuery(control.id).replace('#', '');
            return /^[0-9a-fA-F]{6}$/.test(raw) ? { ...accumulator, [control.id]: `#${raw.toLowerCase()}` } : accumulator;
        }, {} as Partial<Record<'field' | 'ink' | 'bar' | 'row', string>>);
        if (Object.keys(fromQuery).length > 0) setImpacto((current) => ({ ...current, ...fromQuery }));
    }, []);
    const palette = PALETTES.find((item) => item.id === paletteId) || PALETTES[0];
    const previewColors = {
        accentColor: palette.accentColor,
        bgColor: palette.bgColor,
        impactoFieldColor: impacto.field,
        impactoInkColor: impacto.ink,
        impactoBarColor: impacto.bar,
        impactoRowColor: impacto.row,
    };

    // La placa de G22 Base tiene sus propios controles: los dos primeros colores
    // son las puntas del degradado y el tercero la tinta.
    const plateOptions = {
        field: impacto.field,
        fieldEnd: impacto.bar,
        ink: impacto.ink,
        brand: (readQuery('brand') || 'auto') as 'auto' | 'salida22' | 'cornerCorto' | 'g22tv' | 'g22scores' | 'none',
    };

    return (
        <div style={{ padding: '32px 24px 64px', maxWidth: 1400, margin: '0 auto' }}>
            <h1 style={{ marginBottom: 8 }}>Laboratorio de exports</h1>
            <p style={{ marginBottom: 20, opacity: 0.75 }}>
                Tres piezas de prueba con datos falsos para comparar familias visuales sin pasar por el gestor.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }} role="radiogroup" aria-label="Familia visual">
                {FAMILIES.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={family === option.value}
                        onClick={() => setFamily(option.value)}
                        style={{
                            padding: '8px 14px',
                            borderRadius: 999,
                            border: '1px solid rgba(127,127,127,0.4)',
                            background: family === option.value ? '#00a365' : 'transparent',
                            color: family === option.value ? '#fff' : 'inherit',
                            cursor: 'pointer',
                        }}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }} role="radiogroup" aria-label="Paleta">
                {PALETTES.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={paletteId === option.id}
                        onClick={() => setPaletteId(option.id)}
                        style={{
                            padding: '6px 12px',
                            borderRadius: 999,
                            border: '1px solid rgba(127,127,127,0.4)',
                            background: paletteId === option.id ? option.accentColor : 'transparent',
                            color: paletteId === option.id ? '#0b0b0c' : 'inherit',
                            cursor: 'pointer',
                        }}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
                <button type="button" onClick={() => setFormat(format === '1080x1350' ? '1080x1920' : '1080x1350')} style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(127,127,127,0.4)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
                    Formato: {format === '1080x1350' ? 'Post 4:5' : 'Story 9:16'}
                </button>
                <button type="button" onClick={() => setMatchMode(matchMode === 'result' ? 'schedule' : 'result')} style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid rgba(127,127,127,0.4)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
                    Partido: {matchMode === 'result' ? 'Resultado' : 'Horario'}
                </button>
                {IMPACTO_CONTROLS.map((control) => (
                    <label key={control.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        {control.label}
                        <input
                            type="color"
                            value={impacto[control.id] || control.placeholder}
                            onChange={(event) => setImpacto((current) => ({ ...current, [control.id]: event.target.value }))}
                        />
                        <button type="button" onClick={() => setImpacto((current) => ({ ...current, [control.id]: '' }))} style={{ border: 'none', background: 'transparent', color: 'inherit', opacity: impacto[control.id] ? 1 : 0.4, cursor: 'pointer' }}>
                            auto
                        </button>
                    </label>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                <figure style={{ margin: 0 }}>
                    <figcaption style={{ marginBottom: 8, fontWeight: 700 }}>Partido individual</figcaption>
                    <ExportImagePreview
                        template="matchStats"
                        data={MATCH}
                        visualFamily={family}
                        format={format}
                        matchExportMode={matchMode}
                        matchExportLayout="classic"
                        previewColors={previewColors}
                        plateOptions={plateOptions}
                        className="lab-preview"
                    />
                </figure>
                <figure style={{ margin: 0 }}>
                    <figcaption style={{ marginBottom: 8, fontWeight: 700 }}>Tabla de posiciones</figcaption>
                    <ExportImagePreview
                        template="standings"
                        data={STANDINGS}
                        visualFamily={family}
                        format={format}
                        standingsExportMode="table"
                        previewColors={previewColors}
                        className="lab-preview"
                    />
                </figure>
                <figure style={{ margin: 0 }}>
                    <figcaption style={{ marginBottom: 8, fontWeight: 700 }}>Partidos del torneo</figcaption>
                    <ExportImagePreview
                        template="dailyMatches"
                        data={FIXTURE}
                        visualFamily={family}
                        format={format}
                        dailyMatchesTimeMode="time"
                        previewColors={previewColors}
                        className="lab-preview"
                    />
                </figure>
                <figure style={{ margin: 0 }}>
                    <figcaption style={{ marginBottom: 8, fontWeight: 700 }}>Palmares</figcaption>
                    <ExportImagePreview
                        template="standings"
                        data={PALMARES}
                        visualFamily={family}
                        format={format}
                        standingsExportMode="table"
                        previewColors={previewColors}
                        className="lab-preview"
                    />
                </figure>
                <figure style={{ margin: 0 }}>
                    <figcaption style={{ marginBottom: 8, fontWeight: 700 }}>Plantel</figcaption>
                    <ExportImagePreview
                        template="squad"
                        data={SQUAD}
                        visualFamily={family}
                        format={format}
                        previewColors={previewColors}
                        className="lab-preview"
                    />
                </figure>
                <figure style={{ margin: 0 }}>
                    <figcaption style={{ marginBottom: 8, fontWeight: 700 }}>Formaciones</figcaption>
                    <ExportImagePreview
                        template="lineups"
                        data={LINEUPS}
                        visualFamily={family}
                        format={format}
                        lineupExportMode="both"
                        previewColors={previewColors}
                        className="lab-preview"
                    />
                </figure>
                <figure style={{ margin: 0 }}>
                    <figcaption style={{ marginBottom: 8, fontWeight: 700 }}>Formacion de un equipo (clasica)</figcaption>
                    <ExportImagePreview
                        template="lineups"
                        data={LINEUPS}
                        visualFamily={family}
                        format={format}
                        lineupExportMode="home"
                        previewColors={previewColors}
                        className="lab-preview"
                    />
                </figure>
                <figure style={{ margin: 0 }}>
                    <figcaption style={{ marginBottom: 8, fontWeight: 700 }}>Formacion editorial (con foto)</figcaption>
                    <ExportImagePreview
                        template="lineups"
                        data={LINEUPS}
                        visualFamily={family}
                        format={format}
                        lineupExportMode="home"
                        lineupExportLayout="editorial"
                        previewColors={previewColors}
                        className="lab-preview"
                    />
                </figure>
            </div>

            <style>{`.lab-preview { width: 100%; height: auto; border-radius: 12px; display: block; }`}</style>
        </div>
    );
}
