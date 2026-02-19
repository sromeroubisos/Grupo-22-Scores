'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft } from 'lucide-react';
import { getActiveSports } from '@/lib/data/sports';

const activeSports = getActiveSports();

export default function EditClubSuper() {
    const router = useRouter();
    const params = useParams();
    const id = params?.id as string;
    const supabase = createClient();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        short_name: '',
        country_id: 'ARG',
        city: '',
        union_id: 'uar',
        logo_url: '',
        sport: 'rugby',
    });

    useEffect(() => {
        if (!id) return;
        const fetchClub = async () => {
            const { data, error } = await supabase
                .from('clubs')
                .select('*')
                .eq('id', id)
                .single();
            if (error) {
                alert('Club not found');
                router.push('/admin/super/clubes');
            } else {
                setFormData({
                    name: data.name,
                    short_name: data.short_name || '',
                    country_id: data.country_id || 'ARG',
                    city: data.city || '',
                    union_id: data.union_id || 'uar',
                    logo_url: data.logo_url || '',
                    sport: data.sport || 'rugby',
                });
            }
            setLoading(false);
        };
        fetchClub();
    }, [id]);

    const handleChange = (e: any) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: any) => {
        e.preventDefault();
        setSaving(true);
        try {
            const { error } = await supabase.from('clubs').update(formData).eq('id', id);
            if (error) throw error;
            router.push('/admin/super/clubes');
        } catch (error: any) {
            alert('Error updating club: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: 40, color: 'white' }}>Cargando club...</div>;

    return (
        <div style={{ maxWidth: '800px', margin: '40px auto', padding: '24px', background: '#111', borderRadius: '12px', border: '1px solid #333' }}>
            <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#888', marginBottom: '24px', background: 'none', border: 'none', cursor: 'pointer' }}>
                <ArrowLeft size={16} /> Volver
            </button>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Editar Club: {formData.name}</h1>
            <p style={{ color: '#666', marginBottom: '32px' }}>ID: {id}</p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontSize: '14px' }}>Nombre del Club</label>
                    <input
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#222', border: '1px solid #444', color: 'white' }}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontSize: '14px' }}>Nombre Corto / Sigla</label>
                        <input
                            name="short_name"
                            value={formData.short_name}
                            onChange={handleChange}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#222', border: '1px solid #444', color: 'white' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontSize: '14px' }}>Unión ID</label>
                        <input
                            name="union_id"
                            value={formData.union_id}
                            onChange={handleChange}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#222', border: '1px solid #444', color: 'white' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontSize: '14px' }}>País ID</label>
                        <select
                            name="country_id"
                            value={formData.country_id}
                            onChange={handleChange}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#222', border: '1px solid #444', color: 'white' }}
                        >
                            <option value="ARG">Argentina (ARG)</option>
                            <option value="URY">Uruguay (URY)</option>
                            <option value="CHL">Chile (CHL)</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontSize: '14px' }}>Ciudad</label>
                        <input
                            name="city"
                            value={formData.city}
                            onChange={handleChange}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#222', border: '1px solid #444', color: 'white' }}
                        />
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontSize: '14px' }}>Deporte</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                        {activeSports.map(sport => (
                            <button
                                key={sport.id}
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, sport: sport.id }))}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '10px 12px', borderRadius: '8px', fontSize: '13px',
                                    border: formData.sport === sport.id ? '1px solid #10b981' : '1px solid #444',
                                    background: formData.sport === sport.id ? 'rgba(16,185,129,0.1)' : '#222',
                                    color: formData.sport === sport.id ? '#10b981' : '#aaa',
                                    cursor: 'pointer',
                                }}
                            >
                                <span>{sport.icon}</span><span>{sport.nameEs}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontSize: '14px' }}>Logo URL</label>
                    <input
                        name="logo_url"
                        value={formData.logo_url}
                        onChange={handleChange}
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#222', border: '1px solid #444', color: 'white' }}
                    />
                </div>

                <button
                    type="submit"
                    disabled={saving}
                    style={{
                        padding: '14px',
                        background: saving ? '#444' : '#10b981',
                        color: saving ? '#888' : 'black',
                        fontWeight: 'bold',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        marginTop: '16px'
                    }}
                >
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </form>
        </div>
    );
}
