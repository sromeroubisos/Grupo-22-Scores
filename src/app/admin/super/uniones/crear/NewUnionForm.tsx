'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUnion } from '@/lib/services/unionService';
import { useSuperConsole } from '../../SuperConsoleContext';
import { Save, ArrowLeft, Building2 } from 'lucide-react';
import { unionSchema } from '@/lib/validation/unionValidation';
import styles from '../../clubes/crear/styles.module.css';

export default function NewUnionForm() {
    const router = useRouter();
    const { unions, refresh } = useSuperConsole();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [form, setForm] = useState({
        name: '',
        country: 'ARG',
        sport: 'rugby',
        union_level: 'regional',
        parent_union_id: ''
    });

    const updateField = (field: keyof typeof form, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        try {
            setError(null);

            // Unify casing automatically before Zod
            const parsedForm = unionSchema.parse({
                name: form.name.trim(), // Nombre exacto
                country: form.country,  // Zod capitalises it
                sport: form.sport,      // Zod lowercases it
                union_level: form.union_level, // Zod lowercases it
                parent_union_id: form.parent_union_id || undefined
            });

            setSaving(true);
            const result = await createUnion({
                name: parsedForm.name,
                country: parsedForm.country,
                sport: parsedForm.sport,
                union_level: parsedForm.union_level,
                parent_union_id: parsedForm.parent_union_id
            });

            if (!result.success) {
                throw new Error(result.error);
            }

            await refresh('unions');
            router.push('/admin/super/uniones');
        } catch (err: any) {
            if (err.errors && err.errors.length > 0) {
                // Return first Zod error message
                setError(err.errors[0].message);
            } else {
                setError(err instanceof Error ? err.message : 'Error al crear la unión');
            }
        } finally {
            setSaving(false);
        }
    };

    // Filtramos uniones que no sean la actual (para "Ligada a uniones")
    // Para simplificar, ordenamos alfabéticamente
    const sortedUnions = [...(unions || [])].sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className={styles.container}>
            <div className={styles.mainColumn}>
                {/* Header estancado */}
                <div className={styles.header}>
                    <div className={styles.headerTitleArea}>
                        <button
                            className={styles.btnBack}
                            onClick={() => router.back()}
                            title="Volver"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <div className={styles.titleWrapper}>
                            <h1 className={styles.title}>Nueva Unión / Liga</h1>
                            <p className={styles.subtitle}>
                                Crear una nueva unión, federación o liga deportiva
                            </p>
                        </div>
                    </div>

                    <div className={styles.headerActions}>
                        {error && (
                            <div className="text-red-500 text-sm font-medium mr-4">
                                {error}
                            </div>
                        )}
                        <div className={styles.actionButtons}>
                            <button
                                className={styles.btnSecondary}
                                onClick={() => router.back()}
                                disabled={saving}
                            >
                                Cancelar
                            </button>
                            <button
                                className={styles.btnPrimary}
                                onClick={handleSave}
                                disabled={!form.name.trim() || saving}
                            >
                                <Save size={16} />
                                {saving ? 'Guardando...' : 'Guardar Unión'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Form Content */}
                <div className={styles.formContent}>
                    <div className={styles.cardsGrid}>
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h2 className={styles.cardTitle}>
                                    <Building2 size={20} />
                                    Información principal
                                    <span className={styles.requiredBadge}>Obligatorio</span>
                                </h2>
                                <p className={styles.cardDescription}>
                                    Datos básicos de la unión o liga. La identificación no discrimina entre mayúsculas y minúsculas (Zod las unifica).
                                </p>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={`${styles.formLabel} ${styles.formLabelRequired}`}>
                                    Nombre de la Unión / Liga
                                </label>
                                <input
                                    type="text"
                                    className={styles.formInput}
                                    value={form.name}
                                    onChange={(e) => updateField('name', e.target.value)}
                                    placeholder="Ej: Unión Cordobesa de Rugby"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Deporte</label>
                                <input
                                    type="text"
                                    className={styles.formInput}
                                    value={form.sport}
                                    onChange={(e) => updateField('sport', e.target.value)}
                                    placeholder="Ej: Rugby o rugby, Fútbol..."
                                />
                                <span className={styles.formHint}>No importa si es mayúscula o minúscula.</span>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>País</label>
                                <input
                                    type="text"
                                    className={styles.formInput}
                                    value={form.country}
                                    onChange={(e) => updateField('country', e.target.value)}
                                    placeholder="Ej: ARG, arg, Arg..."
                                />
                                <span className={styles.formHint}>Se guardará automáticamente en mayúsculas (Ej: ARG).</span>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Nivel de la Unión</label>
                                <select
                                    className={styles.formSelect}
                                    value={form.union_level}
                                    onChange={(e) => updateField('union_level', e.target.value)}
                                >
                                    <option value="regional">Regional / Provincial</option>
                                    <option value="national">Nacional</option>
                                    <option value="international">Internacional / Multinacional</option>
                                </select>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.formLabel}>Ligada a Unión (Unión Superior) - Opcional</label>
                                <select
                                    className={styles.formSelect}
                                    value={form.parent_union_id}
                                    onChange={(e) => updateField('parent_union_id', e.target.value)}
                                >
                                    <option value="">-- No depende de ninguna --</option>
                                    {sortedUnions.map(u => (
                                        <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                </select>
                                <span className={styles.formHint}>Si esta unión pertenece a otra (Ej: URBA pertenece a UAR), selecciónela.</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
