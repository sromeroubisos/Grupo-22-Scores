'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './page.module.css';
import { CATEGORY_LEVELS, resolveCategoryLevel } from '@/lib/clubs/categoryLevel';

/**
 * Alta de partido desde el Panel del Día.
 *
 * El rival no es un club: es una CATEGORÍA de otro club. Por eso el buscador
 * devuelve el club y sus derivados, y hasta que no se elige una categoría el
 * botón no se habilita — y dice por qué.
 *
 * La competencia es opcional a propósito: el caso normal es el partido suelto,
 * que vive solo en el panel del club. Agruparlo en una competencia propia es
 * para quien la necesita, no un paso obligatorio.
 */

export type PanelFamilyClub = { id: string; name: string; isBase: boolean };

type RivalCategory = { id: string; name: string; isBase: boolean };
type RivalClub = { id: string; name: string; categories: RivalCategory[] };
type Competition = { id: string; name: string };

interface PanelMatchFormProps {
    clubId: string;
    familyClubs: PanelFamilyClub[];
    defaultDate: string;
    onCreated: () => void;
    onCancel: () => void;
}

export default function PanelMatchForm({
    clubId,
    familyClubs,
    defaultDate,
    onCreated,
    onCancel,
}: PanelMatchFormProps) {
    // La familia se guarda en estado y no se lee del prop: cuando se crea una
    // categoría propia tiene que aparecer en el desplegable sin recargar nada.
    const [ourClubs, setOurClubs] = useState<PanelFamilyClub[]>(familyClubs);
    useEffect(() => { setOurClubs(familyClubs); }, [familyClubs]);

    const [ourClubId, setOurClubId] = useState(() => familyClubs[0]?.id ?? clubId);

    // Alta de categoría, compartida por las dos puntas: la propia y la del rival.
    const [creatingFor, setCreatingFor] = useState<'ours' | 'rival' | null>(null);
    const [categoryLabel, setCategoryLabel] = useState('');
    // '' = que el rango salga del nombre. Es el caso normal: "M15" o "Intermedia"
    // se leen solos, y el selector está para el nombre libre que no se lee.
    const [categoryLevel, setCategoryLevel] = useState('');
    const [categoryVariant, setCategoryVariant] = useState('');
    const [categoryBusy, setCategoryBusy] = useState(false);
    const [categoryError, setCategoryError] = useState<string | null>(null);
    const [categorySimilar, setCategorySimilar] = useState<Array<{ id: string; name: string }>>([]);
    const [isHome, setIsHome] = useState(true);
    const [date, setDate] = useState(defaultDate);
    const [time, setTime] = useState('16:00');
    const [venue, setVenue] = useState('');

    const [rivalQuery, setRivalQuery] = useState('');
    const [rivalResults, setRivalResults] = useState<RivalClub[]>([]);
    const [rivalSearching, setRivalSearching] = useState(false);
    const [rivalClub, setRivalClub] = useState<RivalClub | null>(null);
    const [rivalCategoryId, setRivalCategoryId] = useState('');

    const [competitions, setCompetitions] = useState<Competition[]>([]);
    const [competitionId, setCompetitionId] = useState('');
    const [newCompetitionName, setNewCompetitionName] = useState('');
    const [creatingCompetition, setCreatingCompetition] = useState(false);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Las competencias propias del club, para el desplegable. Si la ruta no
    // contesta, el alta sigue: la competencia es opcional.
    useEffect(() => {
        let cancelled = false;
        fetch(`/api/club-admin/tournaments?club=${encodeURIComponent(clubId)}`, { cache: 'no-store' })
            .then(response => (response.ok ? response.json() : null))
            .then(payload => {
                if (cancelled || !payload?.ok) return;
                const pending = Array.isArray(payload.data?.pending) ? payload.data.pending : [];
                setCompetitions(pending.map((row: { id: string; name: string }) => ({ id: row.id, name: row.name })));
            })
            .catch(() => { /* la competencia es opcional: sin listado el alta sigue */ });
        return () => { cancelled = true; };
    }, [clubId]);

    // Buscador con espera: sin esto son cinco consultas mientras se escribe
    // "Jockey", y la última en volver puede no ser la del texto actual.
    const searchSeq = useRef(0);
    useEffect(() => {
        const term = rivalQuery.trim();
        if (term.length < 2) {
            setRivalResults([]);
            setRivalSearching(false);
            return;
        }

        setRivalSearching(true);
        const seq = ++searchSeq.current;
        const timer = setTimeout(() => {
            fetch(`/api/clubs/${encodeURIComponent(clubId)}/rival-search?q=${encodeURIComponent(term)}`, { cache: 'no-store' })
                .then(response => (response.ok ? response.json() : null))
                .then(payload => {
                    // Respuesta vieja que llegó tarde: se descarta.
                    if (seq !== searchSeq.current) return;
                    setRivalResults(payload?.ok && Array.isArray(payload.clubs) ? payload.clubs : []);
                })
                .catch(() => { if (seq === searchSeq.current) setRivalResults([]); })
                .finally(() => { if (seq === searchSeq.current) setRivalSearching(false); });
        }, 300);

        return () => clearTimeout(timer);
    }, [rivalQuery, clubId]);

    const missing = useMemo(() => {
        if (!ourClubId) return 'Elegí qué categoría de tu club juega';
        if (!rivalCategoryId) return 'Elegí el rival y su categoría';
        if (!date) return 'Poné la fecha';
        if (!time) return 'Poné la hora';
        return null;
    }, [ourClubId, rivalCategoryId, date, time]);

    const openCategoryCreator = (which: 'ours' | 'rival') => {
        setCreatingFor(which);
        setCategoryLabel('');
        setCategoryLevel('');
        setCategoryVariant('');
        setCategoryError(null);
        setCategorySimilar([]);
    };

    /**
     * Crea la categoría como club derivado real. `force` solo se manda después
     * de que la persona vio las parecidas y decidió igual: el 409 con `similar`
     * no es un error, es la oportunidad de elegir la que ya existe.
     */
    const createCategory = async (force = false) => {
        const label = categoryLabel.trim();
        if (!label || !creatingFor) return;

        const ourBase = ourClubs.find(club => club.isBase)?.id ?? clubId;
        const baseClubId = creatingFor === 'ours' ? ourBase : rivalClub?.id;
        if (!baseClubId) return;

        setCategoryBusy(true);
        setCategoryError(null);
        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    baseClubId,
                    label,
                    force,
                    level: categoryLevel || null,
                    variant: categoryVariant || null,
                }),
            });
            const payload = await response.json().catch(() => null);

            if (response.status === 409 && Array.isArray(payload?.similar) && payload.similar.length > 0) {
                setCategorySimilar(payload.similar);
                setCategoryError('Ya existe algo muy parecido. Elegila, o creala igual si de verdad es otra.');
                return;
            }

            if (!response.ok || !payload?.ok) {
                setCategoryError(payload?.error || 'No se pudo crear la categoría');
                return;
            }

            const created = payload.category as { id: string; name: string };
            if (creatingFor === 'ours') {
                setOurClubs(current => [...current, { id: created.id, name: created.name, isBase: false }]);
                setOurClubId(created.id);
            } else if (rivalClub) {
                setRivalClub({
                    ...rivalClub,
                    categories: [...rivalClub.categories, { id: created.id, name: created.name, isBase: false }],
                });
                setRivalCategoryId(created.id);
            }
            setCreatingFor(null);
            setCategoryLabel('');
            setCategoryLevel('');
            setCategoryVariant('');
            setCategorySimilar([]);
        } catch {
            setCategoryError('No se pudo crear la categoría. Revisá la conexión.');
        } finally {
            setCategoryBusy(false);
        }
    };

    const pickSimilarCategory = (id: string, name: string) => {
        if (creatingFor === 'ours') {
            setOurClubs(current => (current.some(club => club.id === id)
                ? current
                : [...current, { id, name, isBase: false }]));
            setOurClubId(id);
        } else if (rivalClub) {
            setRivalClub({
                ...rivalClub,
                categories: rivalClub.categories.some(category => category.id === id)
                    ? rivalClub.categories
                    : [...rivalClub.categories, { id, name, isBase: false }],
            });
            setRivalCategoryId(id);
        }
        setCreatingFor(null);
        setCategoryLabel('');
        setCategorySimilar([]);
        setCategoryError(null);
    };

    // Lo que el sistema leería del nombre tal como está escrito ahora mismo.
    // Sirve para que la opción "del nombre" no sea una caja negra.
    const inferredLevel = resolveCategoryLevel({ name: categoryLabel });
    const inferredLevelLabel = categoryLabel.trim() ? inferredLevel.label : '';
    const inferredVariant = categoryLabel.trim() ? inferredLevel.variant : '';

    const categoryCreator = (which: 'ours' | 'rival', baseName: string) => (
        creatingFor === which ? (
            <div className={styles.categoryCreator}>
                <div className={styles.panelFormInline}>
                    <input
                        type="text"
                        className={styles.panelFormInput}
                        placeholder={'Categoría de ' + baseName + ' — por ejemplo M15'}
                        value={categoryLabel}
                        onChange={event => { setCategoryLabel(event.target.value); setCategorySimilar([]); setCategoryError(null); }}
                    />
                    <button
                        type="button"
                        className={styles.panelFormSecondary}
                        onClick={() => createCategory(categorySimilar.length > 0)}
                        disabled={categoryBusy || !categoryLabel.trim()}
                    >
                        {categoryBusy
                            ? 'Creando…'
                            : !categoryLabel.trim()
                                ? 'Poné un nombre'
                                : categorySimilar.length > 0 ? 'Crear igual' : 'Crear'}
                    </button>
                    <button type="button" className={styles.linkButton} onClick={() => setCreatingFor(null)}>
                        Cancelar
                    </button>
                </div>

                {/* El rango del escalafón. El nombre lo elige el club; el orden en
                    la jornada lo da esto. Por omisión se lee del nombre y el
                    renglón de abajo dice qué se leyó, así no hay que adivinar. */}
                <div className={styles.panelFormInline}>
                    <select
                        className={styles.panelFormInput}
                        aria-label="Rango de la categoría en el escalafón"
                        value={categoryLevel}
                        onChange={event => setCategoryLevel(event.target.value)}
                    >
                        <option value="">Rango: del nombre{inferredLevelLabel ? ` (${inferredLevelLabel})` : ''}</option>
                        {CATEGORY_LEVELS.map(level => (
                            <option key={level.key} value={level.key}>{level.label}</option>
                        ))}
                    </select>
                    <select
                        className={styles.panelFormInput}
                        aria-label="Letra de la categoría"
                        value={categoryVariant}
                        onChange={event => setCategoryVariant(event.target.value)}
                    >
                        <option value="">Sin letra{inferredVariant ? ` (${inferredVariant})` : ''}</option>
                        {['A', 'B', 'C', 'D', 'E'].map(letter => (
                            <option key={letter} value={letter}>{letter}</option>
                        ))}
                    </select>
                </div>

                {categorySimilar.length > 0 ? (
                    <div className={styles.rivalResults}>
                        {categorySimilar.map(candidate => (
                            <button
                                key={candidate.id}
                                type="button"
                                className={styles.rivalResult}
                                onClick={() => pickSimilarCategory(candidate.id, candidate.name)}
                            >
                                <span>{candidate.name}</span>
                                <span className={styles.rivalResultMeta}>usar esta</span>
                            </button>
                        ))}
                    </div>
                ) : null}

                {categoryError ? <p className={styles.panelFormError}>{categoryError}</p> : null}
                <p className={styles.panelFormHint}>
                    Queda cargada en el catálogo y disponible para todos los clubes de ahí en adelante.
                </p>
            </div>
        ) : (
            <button type="button" className={styles.linkButton} onClick={() => openCategoryCreator(which)}>
                + Crear categoría
            </button>
        )
    );

    const createCompetition = async () => {
        const name = newCompetitionName.trim();
        if (!name) return;

        setCreatingCompetition(true);
        setError(null);
        try {
            const response = await fetch('/api/club-admin/tournaments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clubId, name }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) {
                setError(payload?.error || 'No se pudo crear la competencia');
                return;
            }
            const created: Competition = { id: payload.data.id, name: payload.data.name };
            setCompetitions(current => (current.some(c => c.id === created.id) ? current : [created, ...current]));
            setCompetitionId(created.id);
            setNewCompetitionName('');
        } finally {
            setCreatingCompetition(false);
        }
    };

    const submit = async () => {
        if (missing) return;
        setSubmitting(true);
        setError(null);
        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/panel-matches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ourClubId,
                    rivalClubId: rivalCategoryId,
                    isHome,
                    date,
                    time,
                    venue,
                    competitionId: competitionId || undefined,
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) {
                setError(payload?.error || 'No se pudo cargar el partido');
                return;
            }
            onCreated();
        } catch {
            setError('No se pudo cargar el partido. Revisá la conexión y probá de nuevo.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={styles.panelForm}>
            <div className={styles.panelFormHead}>
                <h3 className={styles.panelFormTitle}>Cargar partido</h3>
                <button type="button" className={styles.linkButton} onClick={onCancel}>Cancelar</button>
            </div>

            <div className={styles.panelFormGrid}>
                <label className={styles.panelFormField}>
                    <span>Nuestra categoría</span>
                    <select
                        className={styles.panelFormInput}
                        value={ourClubId}
                        onChange={event => setOurClubId(event.target.value)}
                    >
                        {ourClubs.map(club => (
                            <option key={club.id} value={club.id}>{club.name}</option>
                        ))}
                    </select>
                    {categoryCreator('ours', ourClubs.find(club => club.isBase)?.name ?? 'tu club')}
                </label>

                <div className={styles.panelFormField}>
                    <span>Localía</span>
                    <div className={styles.rangePicker} role="radiogroup" aria-label="Localía">
                        <button
                            type="button"
                            role="radio"
                            aria-checked={isHome}
                            className={styles.rangeBtn + (isHome ? ' ' + styles.rangeBtnActive : '')}
                            onClick={() => setIsHome(true)}
                        >
                            De local
                        </button>
                        <button
                            type="button"
                            role="radio"
                            aria-checked={!isHome}
                            className={styles.rangeBtn + (!isHome ? ' ' + styles.rangeBtnActive : '')}
                            onClick={() => setIsHome(false)}
                        >
                            De visitante
                        </button>
                    </div>
                </div>

                <label className={styles.panelFormField}>
                    <span>Fecha</span>
                    <input
                        type="date"
                        className={styles.panelFormInput}
                        value={date}
                        onChange={event => setDate(event.target.value)}
                    />
                </label>

                <label className={styles.panelFormField}>
                    <span>Hora</span>
                    <input
                        type="time"
                        className={styles.panelFormInput}
                        value={time}
                        onChange={event => setTime(event.target.value)}
                    />
                </label>

                <label className={styles.panelFormFieldWide}>
                    <span>Cancha o sede</span>
                    <input
                        type="text"
                        className={styles.panelFormInput}
                        placeholder="Opcional"
                        value={venue}
                        onChange={event => setVenue(event.target.value)}
                    />
                </label>
            </div>

            <div className={styles.panelFormBlock}>
                <label className={styles.panelFormFieldWide}>
                    <span>Rival</span>
                    <input
                        type="text"
                        className={styles.panelFormInput}
                        placeholder="Buscá el club rival"
                        value={rivalClub ? rivalClub.name : rivalQuery}
                        onChange={event => {
                            setRivalClub(null);
                            setRivalCategoryId('');
                            setRivalQuery(event.target.value);
                        }}
                    />
                </label>

                {!rivalClub && rivalQuery.trim().length >= 2 ? (
                    <div className={styles.rivalResults}>
                        {rivalSearching ? (
                            <p className={styles.panelFormHint}>Buscando…</p>
                        ) : rivalResults.length === 0 ? (
                            <p className={styles.panelFormHint}>Ningún club de tu deporte con ese nombre.</p>
                        ) : (
                            rivalResults.map(club => (
                                <button
                                    key={club.id}
                                    type="button"
                                    className={styles.rivalResult}
                                    onClick={() => {
                                        setRivalClub(club);
                                        setRivalCategoryId(club.categories.length === 1 ? club.categories[0].id : '');
                                    }}
                                >
                                    <span>{club.name}</span>
                                    <span className={styles.rivalResultMeta}>
                                        {club.categories.length === 1
                                            ? 'sin categorías cargadas'
                                            : `${club.categories.length} categorías`}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                ) : null}

                {rivalClub ? (
                    <div className={styles.panelFormField}>
                        <span>Categoría del rival</span>
                        <select
                            className={styles.panelFormInput}
                            value={rivalCategoryId}
                            onChange={event => setRivalCategoryId(event.target.value)}
                        >
                            <option value="">Elegí una…</option>
                            {rivalClub.categories.map(category => (
                                <option key={category.id} value={category.id}>
                                    {category.name}{category.isBase ? ' (primera)' : ''}
                                </option>
                            ))}
                        </select>
                        {rivalClub.categories.length === 1 ? (
                            <p className={styles.panelFormHint}>
                                {rivalClub.name} todavía no tiene categorías cargadas en G22. Podés crearla acá.
                            </p>
                        ) : null}
                        {categoryCreator('rival', rivalClub.name)}
                    </div>
                ) : null}
            </div>

            <div className={styles.panelFormBlock}>
                <label className={styles.panelFormField}>
                    <span>Competencia</span>
                    <select
                        className={styles.panelFormInput}
                        value={competitionId}
                        onChange={event => setCompetitionId(event.target.value)}
                    >
                        <option value="">Ninguna — partido suelto</option>
                        {competitions.map(competition => (
                            <option key={competition.id} value={competition.id}>{competition.name}</option>
                        ))}
                    </select>
                </label>

                <div className={styles.panelFormInline}>
                    <input
                        type="text"
                        className={styles.panelFormInput}
                        placeholder="Crear una competencia del club"
                        value={newCompetitionName}
                        onChange={event => setNewCompetitionName(event.target.value)}
                    />
                    <button
                        type="button"
                        className={styles.panelFormSecondary}
                        onClick={createCompetition}
                        disabled={creatingCompetition || !newCompetitionName.trim()}
                    >
                        {creatingCompetition
                            ? 'Creando…'
                            : !newCompetitionName.trim()
                                ? 'Poné un nombre'
                                : 'Crear'}
                    </button>
                </div>
                <p className={styles.panelFormHint}>
                    Una competencia del club agrupa sus partidos y no sale de acá: no compite con los torneos oficiales.
                </p>
            </div>

            {error ? <p className={styles.panelFormError}>{error}</p> : null}

            <div className={styles.panelFormActions}>
                <button
                    type="button"
                    className={styles.panelFormPrimary}
                    onClick={submit}
                    disabled={Boolean(missing) || submitting}
                >
                    {submitting ? 'Cargando…' : missing ?? 'Cargar partido'}
                </button>
            </div>
        </div>
    );
}
