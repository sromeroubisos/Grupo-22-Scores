'use client';

import { useState, useMemo } from 'react';
import { ChevronRight, X, Save, Trash2, Star } from 'lucide-react';
import type { RugbyPreset, SavedPreset } from '@/lib/club-pizarra/types';
import { RUGBY_PRESETS } from '@/lib/club-pizarra/constants';

interface PresetsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (preset: RugbyPreset | SavedPreset) => void;
    onSavePreset: (name: string) => void;
    onDeletePreset: (presetId: string) => void;
    savedPresets: SavedPreset[];
    storageMode: 'club' | 'local';
    statusMessage?: string;
    disabled?: boolean;
}

export function PresetsDrawer({
    isOpen,
    onClose,
    onSelect,
    onSavePreset,
    onDeletePreset,
    savedPresets,
    storageMode,
    statusMessage,
    disabled,
}: PresetsDrawerProps) {
    const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);
    const [presetName, setPresetName] = useState('');

    const categories = useMemo(() => {
        const cats = new Set<string>();
        RUGBY_PRESETS.forEach((p) => cats.add(p.category));
        return Array.from(cats);
    }, []);

    const toggleCat = (cat: string) => {
        setExpandedCats((prev) => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    const handleSave = () => {
        const name = presetName.trim();
        if (!name) return;
        onSavePreset(name);
        setPresetName('');
        setIsSaving(false);
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="pizarra-drawer-backdrop" onClick={onClose} />
            <div className="pizarra-drawer">
                <div className="pizarra-drawer-header">
                    <strong>Presets</strong>
                    <button type="button" className="pizarra-drawer-close" onClick={onClose}>
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="pizarra-drawer-body">
                    {/* Guardar preset */}
                    <div className="pizarra-drawer-save-section">
                        <p className="pizarra-drawer-save-note">
                            Guarda tablero, animacion y ajustes.
                            {storageMode === 'club'
                                ? ' Queda visible solo para este club.'
                                : ' Por ahora queda en este dispositivo.'}
                        </p>
                        {statusMessage ? <p className="pizarra-drawer-save-meta">{statusMessage}</p> : null}
                        {!isSaving ? (
                            <button
                                type="button"
                                className="btn btn-primary w-full"
                                onClick={() => setIsSaving(true)}
                                disabled={disabled}
                            >
                                <Save className="w-4 h-4" />
                                Guardar jugada actual
                            </button>
                        ) : (
                            <div className="pizarra-drawer-save-form">
                                <input
                                    type="text"
                                    placeholder="Nombre de la jugada o configuracion..."
                                    value={presetName}
                                    onChange={(e) => setPresetName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSave();
                                        if (e.key === 'Escape') setIsSaving(false);
                                    }}
                                    autoFocus
                                />
                                <div className="pizarra-drawer-save-actions">
                                    <button type="button" className="btn" onClick={() => setIsSaving(false)}>
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={handleSave}
                                        disabled={!presetName.trim()}
                                    >
                                        Guardar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Mis jugadas */}
                    {savedPresets.length > 0 && (
                        <div className="pizarra-drawer-cat">
                            <div className="pizarra-drawer-cat-header" style={{ cursor: 'default' }}>
                                <Star className="w-3 h-3" />
                                <span>Mis jugadas ({savedPresets.length})</span>
                            </div>
                            <div className="pizarra-drawer-cat-list">
                                {savedPresets.map((preset) => (
                                    <div key={preset.id} className="pizarra-drawer-item-row">
                                        <button
                                            type="button"
                                            className="pizarra-drawer-item"
                                            onClick={() => {
                                                onSelect(preset);
                                                onClose();
                                            }}
                                            disabled={disabled}
                                        >
                                            {preset.name}
                                        </button>
                                        <button
                                            type="button"
                                            className="pizarra-drawer-item-delete"
                                            onClick={() => onDeletePreset(preset.id)}
                                            title="Borrar"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Presets tácticos */}
                    {categories.map((cat) => (
                        <div key={cat} className="pizarra-drawer-cat">
                            <button type="button" className="pizarra-drawer-cat-header" onClick={() => toggleCat(cat)}>
                                <ChevronRight className={`w-3 h-3 ${expandedCats.has(cat) ? 'rotated' : ''}`} />
                                <span>{cat}</span>
                            </button>
                            {expandedCats.has(cat) && (
                                <div className="pizarra-drawer-cat-list">
                                    {RUGBY_PRESETS.filter((p) => p.category === cat).map((preset) => (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            className="pizarra-drawer-item"
                                            onClick={() => {
                                                onSelect(preset);
                                                onClose();
                                            }}
                                            disabled={disabled}
                                        >
                                            {preset.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}
