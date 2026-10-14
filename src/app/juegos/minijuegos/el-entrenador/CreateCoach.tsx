'use client';

import { useMemo, useState } from 'react';
import {
    CLUBS,
    COACH_PROFILES,
    PROFILE_POINTS,
    TUNE_RANGE,
    clubsIn,
    competitionName,
    getClub,
    getCompetition,
    initialFinances,
    objectiveFor,
    regionName,
    type ClubDef,
    type ClubOffer,
    type CoachAttributes,
    type WorldState,
} from '../../../../features/coach/index.ts';
import ClubCrest from './ClubCrest.tsx';
import OfferCards, { placeOf } from './OfferCards.tsx';
import styles from './entrenador.module.css';

/** Los cinco ejes, con lo que mueven, en el orden en que se muestran. */
const ATTR_META: readonly { key: keyof CoachAttributes; label: string; hint: string }[] = [
    { key: 'conduccion', label: 'Conducción', hint: 'Los cambios, la salida, cuándo ir a los palos.' },
    { key: 'arenga', label: 'Arenga', hint: 'Lo que le sacás al plantel cuando el partido se pone cuesta arriba.' },
    { key: 'formacion', label: 'Formación', hint: 'Lo que crecen los pibes del M19 y los que recién suben.' },
    { key: 'gestion', label: 'Gestión', hint: 'El sponsor, la unión y la subcomisión: lo que entra a la caja.' },
    { key: 'disciplina', label: 'Orden', hint: 'Las tarjetas que no te sacan y los penales que no regalás.' },
];

function sumAttrs(a: CoachAttributes): number {
    return ATTR_META.reduce((s, m) => s + a[m.key], 0);
}

/**
 * El ajuste fino del perfil: el reparto de puntos de El Interino. Lo que le sacás
 * a un eje queda "por repartir" hasta que se lo ponés a otro; la suma no cambia y
 * ningún eje se aleja más de TUNE_RANGE del perfil.
 */
function ProfileTuner({
    base,
    attrs,
    onChange,
}: {
    base: CoachAttributes;
    attrs: CoachAttributes;
    onChange: (next: CoachAttributes) => void;
}) {
    const pool = PROFILE_POINTS - sumAttrs(attrs);
    const changed = ATTR_META.some((m) => attrs[m.key] !== base[m.key]);
    return (
        <div className={styles.tuner}>
            <div className={styles.tunerHead}>
                <span className={styles.tunerTitle}>Ajustá el perfil</span>
                <span className={`${styles.tunerPool} ${pool > 0 ? styles.tunerPoolOpen : ''}`} aria-live="polite">
                    Puntos por repartir: {pool}
                </span>
            </div>
            <p className={styles.objectiveNote}>
                Sacale a un eje para ponérselo a otro, hasta {TUNE_RANGE} por eje. No hay un entrenador mejor que
                otro: hay uno que resuelve otras cosas.
            </p>
            <ul className={styles.tunerRows}>
                {ATTR_META.map((m) => {
                    const v = attrs[m.key];
                    const canDown = v > Math.max(1, base[m.key] - TUNE_RANGE);
                    const canUp = pool > 0 && v < Math.min(10, base[m.key] + TUNE_RANGE);
                    const delta = v - base[m.key];
                    return (
                        <li key={m.key} className={styles.tunerRow}>
                            <span className={styles.tunerLabel}>
                                <span className={styles.tunerName}>{m.label}</span>
                                <span className={styles.tunerHint}>{m.hint}</span>
                            </span>
                            <button
                                type="button"
                                className={styles.tunerBtn}
                                aria-label={`Bajar ${m.label}`}
                                disabled={!canDown}
                                onClick={() => onChange({ ...attrs, [m.key]: v - 1 })}
                            >
                                −
                            </button>
                            <span className={styles.attrBarTrack} aria-hidden="true">
                                <span className={styles.attrBarFill} style={{ width: `${v * 10}%` }} />
                            </span>
                            <span className={styles.tunerValue}>
                                {v}
                                {delta !== 0 && (
                                    <span className={delta > 0 ? styles.tunerUp : styles.tunerDown}>
                                        {delta > 0 ? `+${delta}` : `−${-delta}`}
                                    </span>
                                )}
                            </span>
                            <button
                                type="button"
                                className={styles.tunerBtn}
                                aria-label={`Subir ${m.label}`}
                                disabled={!canUp}
                                onClick={() => onChange({ ...attrs, [m.key]: v + 1 })}
                            >
                                +
                            </button>
                        </li>
                    );
                })}
            </ul>
            {changed && (
                <button type="button" className={styles.linkButton} onClick={() => onChange({ ...base })}>
                    Volver al perfil original
                </button>
            )}
        </div>
    );
}

/** Normaliza para buscar sin acentos: "tucuman" tiene que encontrar Tucumán. */
function normalize(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
}

/** Las regiones del canon, en el orden en que se muestran. */
const REGIONS: readonly ClubDef['regionId'][] = ['urba', 'centro', 'litoral', 'oeste', 'noa', 'nea', 'pampeana', 'patagonia'];

type Step = 'perfil' | 'club';

/** La ficha del club elegido: en qué te estás metiendo, antes de firmar. */
function ClubPreview({ club, world }: { club: ClubDef; world: WorldState }) {
    const compId = world.divisions[club.id];
    const comp = getCompetition(compId);
    const ids = clubsIn(world, compId);
    const rank = ids.indexOf(club.id) + 1;
    const objective = objectiveFor(compId, Math.max(1, rank));
    const fin = initialFinances(club);
    const tone = rank <= 2 ? 'un grande' : rank <= Math.ceil(ids.length * 0.4) ? 'de la mitad de arriba' : rank <= Math.ceil(ids.length * 0.7) ? 'del medio' : 'de los chicos';

    return (
        <div className={styles.preview}>
            <div className={styles.previewHead}>
                <ClubCrest club={club} />
                <div className={styles.headerMain}>
                    <p className={styles.clubName}>{club.name}</p>
                    <p className={styles.clubMeta}>
                        {competitionName(compId)} · {placeOf(club)}
                    </p>
                </div>
            </div>
            <p className={styles.previewLine}>
                Es <strong>{tone}</strong> de su torneo: {rank}° de {ids.length} por fuerza del plantel.
                {comp && comp.tdiSlots > 0 ? ` Los ${comp.tdiSlots} primeros van al Torneo del Interior.` : ''}
            </p>
            <p className={styles.previewLine}>
                Lo que te van a pedir: <strong>{objective.text}</strong>
            </p>
            <div className={styles.previewStats}>
                <span>
                    <span className={styles.statLabel}>Socios</span>
                    <span className={styles.statValue}>{fin.socios}</span>
                </span>
                <span>
                    <span className={styles.statLabel}>Estructura</span>
                    <span className={styles.statValue}>{fin.estructura}</span>
                </span>
                <span>
                    <span className={styles.statLabel}>Gente</span>
                    <span className={styles.statValue}>{fin.hinchada}</span>
                </span>
                <span>
                    <span className={styles.statLabel}>Fuerza</span>
                    <span className={styles.statValue}>{world.ratings[club.id].toFixed(1)}</span>
                </span>
            </div>
        </div>
    );
}

export default function CreateCoach({
    world,
    onStart,
    /**
     * Cuando ya sos entrenador y solo estás eligiendo club nuevo: se esconde la
     * elección de perfil, porque sos el que sos y lo único que cambia es el club.
     * En ese modo `onStart` recibe cadena vacía como perfil y el llamador la
     * ignora — el perfil del entrenador ya vive en el estado.
     */
    clubOnly = false,
    offers = [],
    /**
     * Si además de las ofertas se puede buscar cualquier club. Al empezar, sí:
     * en G22 la gente quiere dirigir SU club. Después de un despido, no: te
     * llaman los que te llaman.
     */
    allowFreeChoice = true,
}: {
    world: WorldState;
    onStart: (clubId: string, profileId: string, attrs?: CoachAttributes) => void;
    clubOnly?: boolean;
    offers?: readonly ClubOffer[];
    allowFreeChoice?: boolean;
}) {
    // Dos pasos cortos en vez de una pantalla de tres metros: cada uno entra en
    // el celular con su botón a la vista.
    const [step, setStep] = useState<Step>(clubOnly ? 'club' : 'perfil');
    const [profileId, setProfileId] = useState<string | null>(null);
    const [attrs, setAttrs] = useState<CoachAttributes | null>(null);
    const [clubId, setClubId] = useState<string | null>(null);
    const [freeChoice, setFreeChoice] = useState(offers.length === 0);
    const [query, setQuery] = useState('');
    const [region, setRegion] = useState('');

    /** En modo "solo club" el perfil ya está decidido y no bloquea el botón. */
    const profileReady = clubOnly || !!profileId;
    const pool = !clubOnly && attrs ? PROFILE_POINTS - sumAttrs(attrs) : 0;
    const profileDone = profileReady && pool === 0;
    const ready = profileDone && !!clubId;

    // Los clubes del canon se muestran TODOS: los que juegan una división que el
    // juego puede jugar se pueden dirigir; los otros existen, se buscan y se ven,
    // pero dicen "todavía no" y por qué.
    const { playable, pending } = useMemo(() => {
        const q = normalize(query.trim());
        const matches = (c: ClubDef) =>
            (!region || c.regionId === region)
            && (q === ''
                || normalize(c.name).includes(q)
                || normalize(c.city).includes(q)
                || normalize(c.prov).includes(q));
        const byName = (a: ClubDef, b: ClubDef) => a.name.localeCompare(b.name, 'es');
        const all = CLUBS.filter(matches);
        return {
            playable: all.filter((c) => c.id in world.divisions).sort(byName),
            pending: all.filter((c) => !(c.id in world.divisions)).sort(byName),
        };
    }, [world, query, region]);

    const selectedClub = clubId ? getClub(clubId) : null;
    const selectedProfile = profileId ? COACH_PROFILES.find((p) => p.id === profileId) : null;
    const showFree = freeChoice || offers.length === 0;

    const switchMode = (free: boolean) => {
        setFreeChoice(free);
        setClubId(null);
    };

    const goTo = (next: Step) => {
        setStep(next);
        window.scrollTo({ top: 0 });
    };

    const reason = !profileReady
        ? 'Elegí qué clase de entrenador sos.'
        : pool > 0
          ? `Te ${pool === 1 ? 'queda 1 punto' : `quedan ${pool} puntos`} por repartir en el perfil.`
          : 'Elegí un club para empezar.';

    return (
        <>
            {!clubOnly && (
                <ol className={styles.stepper} aria-label="Pasos para empezar">
                    <li>
                        <button
                            type="button"
                            className={`${styles.stepItem} ${step === 'perfil' ? styles.stepItemOn : ''}`}
                            aria-current={step === 'perfil' ? 'step' : undefined}
                            onClick={() => goTo('perfil')}
                        >
                            <span className={styles.stepNum}>1</span> Tu perfil
                        </button>
                    </li>
                    <li>
                        <button
                            type="button"
                            className={`${styles.stepItem} ${step === 'club' ? styles.stepItemOn : ''}`}
                            aria-current={step === 'club' ? 'step' : undefined}
                            disabled={!profileDone}
                            onClick={() => goTo('club')}
                        >
                            <span className={styles.stepNum}>2</span> Tu club
                        </button>
                    </li>
                </ol>
            )}

            {step === 'perfil' && (
                <section className={styles.panel}>
                    <h2 className={styles.panelTitle}>Qué clase de entrenador sos</h2>
                    <p className={styles.objectiveNote}>
                        Agarrás un club argentino de rugby. No es un juego de pizarrón: es la subcomisión, el M19, la
                        caja y el micro. Cinco decisiones por temporada.
                    </p>
                    <div className={styles.profileList} role="radiogroup" aria-label="Perfil de entrenador">
                        {COACH_PROFILES.map((profile) => (
                            <button
                                key={profile.id}
                                type="button"
                                role="radio"
                                aria-checked={profileId === profile.id}
                                className={`${styles.profileOption} ${profileId === profile.id ? styles.profileSelected : ''}`}
                                onClick={() => {
                                    setProfileId(profile.id);
                                    setAttrs({ ...profile.attrs });
                                }}
                            >
                                <span className={styles.profileName}>{profile.name}</span>
                                <span className={styles.profileText}>{profile.text}</span>
                            </button>
                        ))}
                    </div>
                    {selectedProfile && attrs && (
                        <>
                            {/* En el celular las tarjetas muestran solo el nombre: la
                                descripción del elegido va una vez, acá. */}
                            <p className={styles.profileChosenText}>{selectedProfile.text}</p>
                            <ProfileTuner base={selectedProfile.attrs} attrs={attrs} onChange={setAttrs} />
                        </>
                    )}
                </section>
            )}

            {step === 'club' && (
                <section className={styles.panel}>
                    <h2 className={styles.panelTitle}>Qué club vas a dirigir</h2>

                    {!showFree && (
                        <>
                            <p className={styles.objectiveNote}>
                                {clubOnly
                                    ? 'Con lo que hiciste hasta acá, estos son los que te llamaron. Cuanto más nombre tenés en el ambiente, más arriba te llaman.'
                                    : 'Ningún club grande le da el plantel a un entrenador sin recorrido. Del ascenso, tres te llamaron.'}
                            </p>
                            <OfferCards
                                offers={offers}
                                world={world}
                                selectedId={clubId}
                                onSelect={setClubId}
                                label="Ofertas de trabajo"
                            />
                            {allowFreeChoice && (
                                <button type="button" className={styles.linkButton} onClick={() => switchMode(true)}>
                                    Prefiero elegir otro club
                                </button>
                            )}
                        </>
                    )}

                    {showFree && (
                        <>
                            {offers.length > 0 && (
                                <button type="button" className={styles.linkButton} onClick={() => switchMode(false)}>
                                    Volver a las ofertas
                                </button>
                            )}
                            <div className={styles.searchRow}>
                                <input
                                    type="search"
                                    className={styles.search}
                                    placeholder="Buscar por club, ciudad o provincia"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    aria-label="Buscar club"
                                />
                                <select
                                    className={styles.select}
                                    value={region}
                                    onChange={(e) => setRegion(e.target.value)}
                                    aria-label="Filtrar por región"
                                >
                                    <option value="">Todas las regiones</option>
                                    {REGIONS.map((r) => (
                                        <option key={r} value={r}>
                                            {regionName(r)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {playable.length === 0 && pending.length === 0 ? (
                                <p className={styles.objectiveNote}>
                                    Ningún club coincide con esa búsqueda. Probá con el nombre de la ciudad.
                                </p>
                            ) : (
                                <>
                                    {playable.length > 0 && (
                                        <div className={styles.clubGrid} role="radiogroup" aria-label="Club">
                                            {playable.map((club) => (
                                                <button
                                                    key={club.id}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={clubId === club.id}
                                                    className={`${styles.clubOption} ${clubId === club.id ? styles.clubOptionSelected : ''}`}
                                                    onClick={() => setClubId(club.id)}
                                                >
                                                    <ClubCrest club={club} small />
                                                    <span className={styles.clubOptionText}>
                                                        <span className={styles.clubOptionName}>{club.name}</span>
                                                        <span className={styles.clubOptionMeta}>
                                                            {getCompetition(world.divisions[club.id])?.short ?? competitionName(world.divisions[club.id])}
                                                            {club.city ? ` · ${club.city}` : ''}
                                                        </span>
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {pending.length > 0 && (
                                        <>
                                            <p className={styles.pendingTitle}>
                                                Todavía no se pueden dirigir ({pending.length})
                                            </p>
                                            <p className={styles.objectiveNote}>
                                                Juegan una división cuya nómina completa no está publicada: el
                                                juego no la completa con clubes inventados.
                                            </p>
                                            <div
                                                className={styles.clubGrid}
                                                role="group"
                                                aria-label="Clubes que todavía no se pueden dirigir"
                                            >
                                                {pending.map((club) => (
                                                    <button
                                                        key={club.id}
                                                        type="button"
                                                        disabled
                                                        aria-disabled="true"
                                                        className={`${styles.clubOption} ${styles.clubOptionPending}`}
                                                    >
                                                        <ClubCrest club={club} small />
                                                        <span className={styles.clubOptionText}>
                                                            <span className={styles.clubOptionName}>{club.name}</span>
                                                            <span className={styles.clubOptionMeta}>
                                                                {competitionName(club.homeCompetitionId)} · todavía no
                                                            </span>
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </>
                            )}

                            {selectedClub && <ClubPreview club={selectedClub} world={world} />}
                        </>
                    )}
                </section>
            )}

            <div className={styles.actionBar}>
                {step === 'perfil' ? (
                    <button type="button" className={styles.primary} disabled={!profileDone} onClick={() => goTo('club')}>
                        Siguiente: elegir club
                        {selectedProfile && (
                            <span className={styles.primaryHint}>como {selectedProfile.name.toLowerCase()}</span>
                        )}
                    </button>
                ) : (
                    <button
                        type="button"
                        className={styles.primary}
                        disabled={!ready}
                        onClick={() => ready && clubId && onStart(clubId, profileId ?? '', attrs ?? undefined)}
                    >
                        {selectedClub ? `Dirigir a ${selectedClub.short}` : 'Empezar la carrera'}
                        {selectedClub && selectedProfile && (
                            <span className={styles.primaryHint}>como {selectedProfile.name.toLowerCase()}</span>
                        )}
                    </button>
                )}
                {!(step === 'perfil' ? profileDone : ready) && <p className={styles.disabledNote}>{reason}</p>}
            </div>
        </>
    );
}
