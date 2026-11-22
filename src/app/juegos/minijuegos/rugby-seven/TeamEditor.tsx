'use client';

import { useState } from 'react';
import SpritePreview from './SpritePreview';
import { HAIR_COLORS, HAIR_STYLES, HAIR_STYLE_LABEL, randomLook, SKIN_TONES, type Look, type Pattern } from './sprites';
import { SHIRT_COLORS, SHORT_COLORS, type SevenTeam } from './teams';
import styles from './seven.module.css';

const PATTERNS: { id: Pattern; label: string }[] = [
    { id: 'liso', label: 'Lisa' },
    { id: 'aros', label: 'A rayas' },
    { id: 'banda', label: 'Con banda' },
];

function Swatches({ id, label, colors, value, onChange }: { id: string; label: string; colors: readonly string[]; value: string; onChange: (index: number) => void }) {
    return (
        <div className={styles.field}>
            <span className={styles.fieldLabel} id={id}>{label}</span>
            <div className={styles.swatches} role="radiogroup" aria-labelledby={id}>
                {colors.map((c, i) => (
                    <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={value === c}
                        aria-label={`${label}: color ${i + 1}`}
                        className={styles.swatch}
                        style={{ background: c }}
                        onClick={() => onChange(i)}
                    />
                ))}
            </div>
        </div>
    );
}

export default function TeamEditor({
    initial,
    onSave,
    onCancel,
    saveLabel = 'Guardar equipo',
    onReset,
}: {
    initial: SevenTeam;
    onSave: (t: SevenTeam) => void;
    onCancel: () => void;
    /** Texto del botón de guardar (al editar un club del catálogo, "Guardar club"). */
    saveLabel?: string;
    /** Si está, aparece "Restaurar de fábrica" (clubes del catálogo ya editados). */
    onReset?: () => void;
}) {
    const [team, setTeam] = useState<SevenTeam>(initial);
    const [sel, setSel] = useState(0);
    const kit = team.kit;
    const look = team.players[sel];

    const setKit = (patch: Partial<SevenTeam['kit']>) => setTeam((t) => ({ ...t, kit: { ...t.kit, ...patch } }));
    const setLook = (patch: Partial<Look>) =>
        setTeam((t) => ({ ...t, players: t.players.map((p, i) => (i === sel ? { ...p, ...patch } : p)) }));

    const name = team.name.trim();
    const short = team.short.trim();
    const missing = !name ? 'Ponele un nombre al equipo para guardarlo.' : short.length !== 3 ? 'La sigla del marcador lleva tres letras.' : null;

    return (
        <div className={styles.editor}>
            <div className={styles.editorTop}>
                <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="seven-name">Nombre</label>
                    <input
                        id="seven-name"
                        className={styles.input}
                        value={team.name}
                        maxLength={18}
                        onChange={(e) => setTeam((t) => ({ ...t, name: e.target.value }))}
                        placeholder="Los del barrio"
                    />
                </div>
                <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="seven-short">Sigla</label>
                    <input
                        id="seven-short"
                        className={`${styles.input} ${styles.inputShort}`}
                        value={team.short}
                        maxLength={3}
                        onChange={(e) => setTeam((t) => ({ ...t, short: e.target.value.toUpperCase().replace(/[^A-ZÑ]/g, '') }))}
                        placeholder="BAR"
                    />
                </div>
            </div>

            <div className={styles.editorKit}>
                <div className={styles.kitPreview}>
                    <SpritePreview look={look} kit={kit} scale={7} running />
                </div>
                <div className={styles.kitFields}>
                    <Swatches id="sw-shirt" label="Camiseta" colors={SHIRT_COLORS} value={kit.shirt} onChange={(i) => setKit({ shirt: SHIRT_COLORS[i] })} />
                    <div className={styles.field}>
                        <span className={styles.fieldLabel} id="seven-pattern">Diseño</span>
                        <div className={styles.chips} role="radiogroup" aria-labelledby="seven-pattern">
                            {PATTERNS.map((p) => (
                                <button key={p.id} type="button" role="radio" aria-checked={kit.pattern === p.id} className={styles.chip} onClick={() => setKit({ pattern: p.id })}>
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {kit.pattern !== 'liso' && (
                        <Swatches id="sw-shirt2" label="Segundo color" colors={SHIRT_COLORS} value={kit.shirt2} onChange={(i) => setKit({ shirt2: SHIRT_COLORS[i] })} />
                    )}
                    <Swatches id="sw-shorts" label="Short" colors={SHORT_COLORS} value={kit.shorts} onChange={(i) => setKit({ shorts: SHORT_COLORS[i] })} />
                    <Swatches id="sw-socks" label="Medias" colors={SHIRT_COLORS} value={kit.socks} onChange={(i) => setKit({ socks: SHIRT_COLORS[i] })} />
                </div>
            </div>

            <div className={styles.field}>
                <span className={styles.fieldLabel} id="seven-squad">Plantel · tocá un jugador para editarlo</span>
                <div className={styles.squad} role="radiogroup" aria-labelledby="seven-squad">
                    {team.players.map((p, i) => (
                        <button
                            key={i}
                            type="button"
                            role="radio"
                            aria-checked={sel === i}
                            aria-label={`Jugador ${i + 1}`}
                            className={styles.squadSlot}
                            onClick={() => setSel(i)}
                        >
                            <SpritePreview look={p} kit={kit} scale={3} />
                            <span aria-hidden="true">{i + 1}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.playerEdit}>
                <Swatches id="sw-skin" label="Piel" colors={SKIN_TONES} value={SKIN_TONES[look.skin]} onChange={(i) => setLook({ skin: i })} />
                <Swatches id="sw-hair" label="Pelo" colors={HAIR_COLORS} value={HAIR_COLORS[look.hair]} onChange={(i) => setLook({ hair: i })} />
                <div className={styles.field}>
                    <span className={styles.fieldLabel} id="seven-style">Peinado</span>
                    <div className={styles.chips} role="radiogroup" aria-labelledby="seven-style">
                        {HAIR_STYLES.map((s, i) => (
                            <button key={s} type="button" role="radio" aria-checked={look.style === i} className={styles.chip} onClick={() => setLook({ style: i })}>
                                {HAIR_STYLE_LABEL[s]}
                            </button>
                        ))}
                    </div>
                </div>
                <div className={styles.field}>
                    <span className={styles.fieldLabel} id="seven-beard">Barba</span>
                    <div className={styles.chips} role="radiogroup" aria-labelledby="seven-beard">
                        <button type="button" role="radio" aria-checked={!look.beard} className={styles.chip} onClick={() => setLook({ beard: false })}>
                            Sin barba
                        </button>
                        <button type="button" role="radio" aria-checked={!!look.beard} className={styles.chip} onClick={() => setLook({ beard: true })}>
                            Con barba
                        </button>
                    </div>
                </div>
                <div className={styles.rowBtns}>
                    <button type="button" className={styles.btnGhost} onClick={() => setLook(randomLook())}>
                        Este jugador al azar
                    </button>
                    <button type="button" className={styles.btnGhost} onClick={() => setTeam((t) => ({ ...t, players: t.players.map(() => randomLook()) }))}>
                        Plantel al azar
                    </button>
                </div>
            </div>

            <div className={styles.footerBtns}>
                <button type="button" className={styles.btnGhost} onClick={onCancel}>
                    Volver sin guardar
                </button>
                {onReset && (
                    <button type="button" className={styles.btnGhost} onClick={onReset}>
                        Restaurar de fábrica
                    </button>
                )}
                <button type="button" className={styles.btnPrimary} disabled={!!missing} onClick={() => onSave({ ...team, name, short, custom: true })}>
                    {saveLabel}
                </button>
            </div>
            {missing && <p className={styles.missing}>{missing}</p>}
        </div>
    );
}
