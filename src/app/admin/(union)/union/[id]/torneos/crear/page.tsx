'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import PhaseCreator from '@/app/admin/components/PhaseCreator';
import { db } from '@/lib/mock-db';

export default function CreateTournament() {
    const params = useParams();
    const router = useRouter();
    const unionId = params?.id as string;
    const searchParams = useSearchParams();
    const tournamentId = searchParams?.get('tournamentId');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [currentStep, setCurrentStep] = useState(1);
    const [isEdit, setIsEdit] = useState(false);
    // TODO: Obtener el deporte predeterminado de la federación desde la API
    // const unionDefaultSport = await getUnionDefaultSport(unionId);

    const [formData, setFormData] = useState({
        name: '',
        sport: 'Football', // Este valor debería ser unionDefaultSport || 'Football'
        visibility: 'public',
        season: '',
        location: '',
        startDate: '',
        endDate: '',
        format: 'league',
        pointsWin: 3,
        pointsDraw: 1,
        pointsLoss: 0,
        matchDuration: 80,
        rulePreset: 'standard',
        gender: 'Masculino',
        category: 'Profesional',
        country: '',
    });

    useEffect(() => {
        if (!tournamentId || !unionId) return;
        const tournament = db.tournaments.find(t => t.id === tournamentId && t.unionId === unionId);
        if (!tournament) return;

        setIsEdit(true);

        const mappedSport = tournament.sport === 'rugby'
            ? 'Rugby Union'
            : tournament.sport === 'football'
                ? 'Football'
                : tournament.sport === 'hockey'
                    ? 'Hockey'
                    : tournament.sport;

        setFormData(prev => ({
            ...prev,
            name: tournament.name,
            sport: mappedSport,
            season: tournament.seasonId,
            category: tournament.category || prev.category,
            format: tournament.format?.toLowerCase().includes('league') ? 'league' : prev.format,
            location: db.unions.find(u => u.id === unionId)?.name || prev.location,
        }));
    }, [tournamentId, unionId]);

    // All available tiebreaker criteria
    const allTiebreakers = [
        'Puntos', 'Victorias', 'Empates', 'Pérdidas', 'Partidos jugados',
        'Victorias en prórroga', 'Empates en prórroga', 'Pérdidas en prórroga',
        'Partidos con prórroga', 'Clasificación', 'Porcentaje', 'Enfrentamiento directo',
        'Diferencia de puntos', 'Puntos a favor', 'Puntaje en contra', 'Try',
        'Conversión', 'Gol de penal', 'Drop goals', 'Tackle', 'Carrera'
    ];

    const [selectedTiebreakers, setSelectedTiebreakers] = useState<string[]>(['Puntos', 'Diferencia de puntos', 'Puntos a favor']);
    const [positionLabels, setPositionLabels] = useState<Array<{ from: number; to: number; label: string; color: string }>>([
        { from: 1, to: 4, label: 'Clasifican a Playoffs', color: '#22c55e' },
        { from: 5, to: 8, label: 'Repechaje', color: '#eab308' },
    ]);

    // Logo states
    const [logoMethod, setLogoMethod] = useState<'url' | 'file'>('url');
    const [logoUrl, setLogoUrl] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    // Team management states
    const [showAddTeamModal, setShowAddTeamModal] = useState(false);
    const [showCreateTeamForm, setShowCreateTeamForm] = useState(false);
    const [showImportTeamList, setShowImportTeamList] = useState(false);
    const [newTeamData, setNewTeamData] = useState({
        name: '',
        shortName: '',
        city: '',
    });

    // Mock data for existing teams (this should come from API)
    const [availableTeams] = useState([
        { id: 1, name: 'Club Atlético San Isidro', shortName: 'CASI', city: 'San Isidro' },
        { id: 2, name: 'Belgrano Athletic Club', shortName: 'BAC', city: 'CABA' },
        { id: 3, name: 'San Luis Rugby Club', shortName: 'San Luis', city: 'San Luis' },
        { id: 4, name: 'Jockey Club Rosario', shortName: 'Jockey', city: 'Rosario' },
    ]);


    // Sports and their statistics
    const sportsData = {
        'Football': {
            stats: ['Gol', 'Asistencia', 'Tarjeta Amarilla', 'Tarjeta Roja', 'Penal', 'Autogol'],
            defaultDuration: 90,
            defaultPoints: { win: 3, draw: 1, loss: 0 }
        },
        'Tennis': {
            stats: ['Aces', 'Doble Falta', 'Winners', 'Errores No Forzados', 'Break Points'],
            defaultDuration: 120,
            defaultPoints: { win: 2, draw: 0, loss: 0 }
        },
        'Basketball': {
            stats: ['Puntos', 'Rebotes', 'Asistencias', 'Falta Personal', 'Falta Técnica', 'Falta Antideportiva'],
            defaultDuration: 40,
            defaultPoints: { win: 2, draw: 0, loss: 1 }
        },
        'Hockey': {
            stats: ['Gol', 'Asistencia', 'Tarjeta Amarilla', 'Tarjeta Roja', 'Tiros a Portería'],
            defaultDuration: 60,
            defaultPoints: { win: 3, draw: 1, loss: 0 }
        },
        'Golf': {
            stats: ['Strokes', 'Birdies', 'Eagles', 'Pars', 'Bogeys'],
            defaultDuration: 240,
            defaultPoints: { win: 0, draw: 0, loss: 0 }
        },
        'Snooker': {
            stats: ['Frames', 'Century Breaks', 'Highest Break', 'Fouls'],
            defaultDuration: 180,
            defaultPoints: { win: 2, draw: 0, loss: 0 }
        },
        'Am. football': {
            stats: ['Touchdown', 'Field Goal', 'Safety', 'Interception', 'Fumble'],
            defaultDuration: 60,
            defaultPoints: { win: 2, draw: 0, loss: 0 }
        },
        'Volleyball': {
            stats: ['Puntos', 'Aces', 'Bloqueos', 'Ataque', 'Recepción'],
            defaultDuration: 90,
            defaultPoints: { win: 3, draw: 0, loss: 1 }
        },
        'Aussie rules': {
            stats: ['Goal (6pts)', 'Behind (1pt)', 'Marks', 'Tackles', 'Disposals'],
            defaultDuration: 80,
            defaultPoints: { win: 4, draw: 2, loss: 0 }
        },
        'Badminton': {
            stats: ['Puntos', 'Smashes', 'Drop Shots', 'Net Shots', 'Errores'],
            defaultDuration: 60,
            defaultPoints: { win: 2, draw: 0, loss: 0 }
        },
        'Bandy': {
            stats: ['Gol', 'Asistencia', 'Tarjeta Amarilla', 'Tarjeta Roja', 'Tiros a Portería'],
            defaultDuration: 90,
            defaultPoints: { win: 3, draw: 1, loss: 0 }
        },
        'Baseball': {
            stats: ['Carreras', 'Hits', 'Home Runs', 'Strikeouts', 'RBIs', 'Errores'],
            defaultDuration: 180,
            defaultPoints: { win: 2, draw: 0, loss: 0 }
        },
        'Beach soccer': {
            stats: ['Gol', 'Asistencia', 'Tarjeta Amarilla', 'Tarjeta Roja'],
            defaultDuration: 36,
            defaultPoints: { win: 3, draw: 1, loss: 0 }
        },
        'Beach volleyball': {
            stats: ['Puntos', 'Aces', 'Bloqueos', 'Ataque'],
            defaultDuration: 45,
            defaultPoints: { win: 2, draw: 0, loss: 0 }
        },
        'Boxing': {
            stats: ['Rounds Ganados', 'Knockdowns', 'Punches Landed', 'Punches Thrown'],
            defaultDuration: 36,
            defaultPoints: { win: 0, draw: 0, loss: 0 }
        },
        'Cricket': {
            stats: ['Runs', 'Wickets', 'Overs', 'Catches', 'Run Outs', 'Boundaries'],
            defaultDuration: 300,
            defaultPoints: { win: 2, draw: 1, loss: 0 }
        },
        'Cycling': {
            stats: ['Posición', 'Tiempo', 'Sprint Points', 'Mountain Points'],
            defaultDuration: 240,
            defaultPoints: { win: 0, draw: 0, loss: 0 }
        },
        'Darts': {
            stats: ['180s', 'Checkout', 'Average', 'Legs Won'],
            defaultDuration: 120,
            defaultPoints: { win: 2, draw: 0, loss: 0 }
        },
        'eSports': {
            stats: ['Kills', 'Deaths', 'Assists', 'Objetivos'],
            defaultDuration: 45,
            defaultPoints: { win: 3, draw: 0, loss: 0 }
        },
        'Field hockey': {
            stats: ['Gol', 'Asistencia', 'Tarjeta Verde', 'Tarjeta Amarilla', 'Tarjeta Roja'],
            defaultDuration: 70,
            defaultPoints: { win: 3, draw: 1, loss: 0 }
        },
        'Floorball': {
            stats: ['Gol', 'Asistencia', 'Tarjeta Amarilla', 'Tarjeta Roja'],
            defaultDuration: 60,
            defaultPoints: { win: 3, draw: 1, loss: 0 }
        },
        'Futsal': {
            stats: ['Gol', 'Asistencia', 'Tarjeta Amarilla', 'Tarjeta Roja', 'Penal'],
            defaultDuration: 40,
            defaultPoints: { win: 3, draw: 1, loss: 0 }
        },
        'Handball': {
            stats: ['Gol', 'Asistencia', 'Tarjeta Amarilla', 'Tarjeta Roja', 'Suspensión 2min'],
            defaultDuration: 60,
            defaultPoints: { win: 2, draw: 1, loss: 0 }
        },
        'Horse racing': {
            stats: ['Posición', 'Tiempo', 'Longitudes'],
            defaultDuration: 10,
            defaultPoints: { win: 0, draw: 0, loss: 0 }
        },
        'Kabaddi': {
            stats: ['Raid Points', 'Tackle Points', 'Bonus Points', 'All Outs'],
            defaultDuration: 40,
            defaultPoints: { win: 5, draw: 0, loss: 0 }
        },
        'MMA': {
            stats: ['Rounds Ganados', 'Knockdowns', 'Strikes Landed', 'Takedowns'],
            defaultDuration: 15,
            defaultPoints: { win: 0, draw: 0, loss: 0 }
        },
        'Motorsport': {
            stats: ['Posición Final', 'Vueltas Rápidas', 'Pole Position', 'DNF', 'Penalizaciones'],
            defaultDuration: 120,
            defaultPoints: { win: 25, draw: 0, loss: 0 }
        },
        'Netball': {
            stats: ['Goles', 'Asistencias', 'Intercepts', 'Rebounds', 'Penalties'],
            defaultDuration: 60,
            defaultPoints: { win: 3, draw: 1, loss: 0 }
        },
        'Pesäpallo': {
            stats: ['Carreras', 'Hits', 'Outs', 'Bases Robadas', 'Errores'],
            defaultDuration: 120,
            defaultPoints: { win: 3, draw: 1, loss: 0 }
        },
        'Rugby League': {
            stats: ['Try (4pts)', 'Conversión (2pts)', 'Penal (2pts)', 'Drop Goal (1pt)', 'Tarjeta Amarilla', 'Tarjeta Roja'],
            defaultDuration: 80,
            defaultPoints: { win: 2, draw: 1, loss: 0 }
        },
        'Rugby Union': {
            stats: ['Try (5pts)', 'Conversión (2pts)', 'Penal (3pts)', 'Drop Goal (3pts)', 'Tarjeta Amarilla', 'Tarjeta Roja'],
            defaultDuration: 80,
            defaultPoints: { win: 4, draw: 2, loss: 0 }
        },
        'Table tennis': {
            stats: ['Puntos', 'Aces', 'Errores No Forzados', 'Winners'],
            defaultDuration: 60,
            defaultPoints: { win: 2, draw: 0, loss: 0 }
        },
        'Water polo': {
            stats: ['Gol', 'Asistencia', 'Exclusión', 'Penalty Shot'],
            defaultDuration: 32,
            defaultPoints: { win: 3, draw: 1, loss: 0 }
        },
        'Winter Sports': {
            stats: ['Posición', 'Tiempo', 'Puntos', 'Penalizaciones'],
            defaultDuration: 120,
            defaultPoints: { win: 0, draw: 0, loss: 0 }
        }
    };

    const [enabledStats, setEnabledStats] = useState<string[]>(
        sportsData['Football'].stats
    );

    const updateFormData = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSportChange = (sport: string) => {
        const sportData = sportsData[sport as keyof typeof sportsData];
        if (sportData) {
            setFormData(prev => ({
                ...prev,
                sport,
                matchDuration: sportData.defaultDuration,
                pointsWin: sportData.defaultPoints.win,
                pointsDraw: sportData.defaultPoints.draw,
                pointsLoss: sportData.defaultPoints.loss,
            }));
            setEnabledStats(sportData.stats);
        }
    };

    const toggleStat = (stat: string) => {
        setEnabledStats(prev =>
            prev.includes(stat)
                ? prev.filter(s => s !== stat)
                : [...prev, stat]
        );
    };

    const addTiebreaker = (criterion: string) => {
        if (!selectedTiebreakers.includes(criterion)) {
            setSelectedTiebreakers([...selectedTiebreakers, criterion]);
        }
    };

    const removeTiebreaker = (criterion: string) => {
        setSelectedTiebreakers(selectedTiebreakers.filter(t => t !== criterion));
    };

    const moveTiebreakerUp = (index: number) => {
        if (index > 0) {
            const newList = [...selectedTiebreakers];
            [newList[index - 1], newList[index]] = [newList[index], newList[index - 1]];
            setSelectedTiebreakers(newList);
        }
    };

    const moveTiebreakerDown = (index: number) => {
        if (index < selectedTiebreakers.length - 1) {
            const newList = [...selectedTiebreakers];
            [newList[index], newList[index + 1]] = [newList[index + 1], newList[index]];
            setSelectedTiebreakers(newList);
        }
    };

    const addPositionLabel = () => {
        setPositionLabels([...positionLabels, { from: 1, to: 1, label: 'Nueva etiqueta', color: '#6366f1' }]);
    };

    // Team management functions
    const resetTeamModals = () => {
        setShowAddTeamModal(false);
        setShowCreateTeamForm(false);
        setShowImportTeamList(false);
        setNewTeamData({ name: '', shortName: '', city: '' });
    };

    const handleCreateTeam = () => {
        console.log('Creating team:', newTeamData);
        resetTeamModals();
    };

    const handleImportTeam = (teamId: number) => {
        console.log('Importing team:', teamId);
        resetTeamModals();
    };


    const updatePositionLabel = (index: number, field: string, value: any) => {
        const updated = [...positionLabels];
        updated[index] = { ...updated[index], [field]: value };
        setPositionLabels(updated);
    };

    const removePositionLabel = (index: number) => {
        setPositionLabels(positionLabels.filter((_, i) => i !== index));
    };

    // Logo handlers
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogoPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleUrlChange = (url: string) => {
        setLogoUrl(url);
        setLogoPreview(url);
    };

    const clearLogo = () => {
        setLogoFile(null);
        setLogoUrl('');
        setLogoPreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleNext = () => {
        if (currentStep < 5) {
            setCurrentStep(prev => prev + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            if (isEdit) {
                alert('Torneo actualizado.');
            } else {
                alert('Torneo publicado.');
            }
            router.push(`/admin/union/${unionId}/torneos`);
        }
    };

    const handlePrev = () => {
        if (currentStep > 1) {
            setCurrentStep(prev => prev - 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    if (!unionId) {
        return null;
    }

    if (currentStep === 2) {
        return (
            <PhaseCreator
                phaseIndex={1}
                totalPhases={3}
                onPrev={() => setCurrentStep(1)}
                onNext={() => setCurrentStep(3)}
            />
        );
    }

    return (
        <>
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

                :root {
                    --bg-deep: #07090c;
                    --bg-surface: #0b1016;
                    --glass: rgba(255, 255, 255, 0.03);
                    --glass-border: rgba(255, 255, 255, 0.08);
                    --accent-green: #22c55e;
                    --text-primary: rgba(255, 255, 255, 0.92);
                    --text-secondary: rgba(255, 255, 255, 0.62);
                    --text-muted: rgba(255, 255, 255, 0.35);
                    --radius-lg: 12px;
                    --radius-md: 8px;
                    --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .create-tournament-page {
                    background-color: var(--bg-deep);
                    background-image: 
                        radial-gradient(circle at 50% -20%, #151d29 0%, transparent 50%),
                        radial-gradient(circle at 0% 0%, #0b0f14 0%, transparent 40%);
                    background-attachment: fixed;
                    min-height: 100vh;
                    font-family: 'Inter', sans-serif;
                }

                .app-container {
                    max-width: 1100px;
                    margin: 0 auto;
                    padding: clamp(16px, 3vw, 32px);
                }

                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 32px;
                    padding-bottom: 16px;
                    border-bottom: 1px solid var(--glass-border);
                }

                .breadcrumb {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-muted);
                    margin-bottom: 4px;
                }

                .breadcrumb span { color: var(--text-secondary); }

                .title-area h1 {
                    font-size: 28px;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                    color: var(--text-primary);
                }

                .title-area p {
                    font-size: 14px;
                    color: var(--text-secondary);
                }

                .header-actions {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .status-chip {
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 11px;
                    font-weight: 600;
                    background: rgba(255, 255, 255, 0.05);
                    color: var(--text-secondary);
                    border: 1px solid var(--glass-border);
                    text-transform: uppercase;
                }

                .wizard-nav {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    margin-bottom: 40px;
                }

                .steps-container {
                    display: flex;
                    gap: 40px;
                    position: relative;
                }

                .step-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    cursor: pointer;
                    position: relative;
                    padding-bottom: 12px;
                    opacity: 0.4;
                    transition: var(--transition);
                }

                .step-item.active {
                    opacity: 1;
                }

                .step-item.active::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 100%;
                    height: 2px;
                    background: var(--accent-green);
                    box-shadow: 0 0 10px var(--accent-green);
                }

                .step-label {
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .progress-text {
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 11px;
                    color: var(--text-muted);
                    margin-bottom: 8px;
                }

                .glass-card {
                    background: var(--glass);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid var(--glass-border);
                    border-radius: var(--radius-lg);
                    padding: 32px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                    display: none;
                    animation: fadeIn 0.4s ease-out;
                }

                .glass-card.active {
                    display: block;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .step-grid {
                    display: grid;
                    grid-template-columns: 1.2fr 1fr;
                    gap: 48px;
                }

                .section-title {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    color: var(--accent-green);
                    margin-bottom: 24px;
                    font-weight: 700;
                }

                .form-group {
                    margin-bottom: 20px;
                }

                label {
                    display: block;
                    font-size: 12px;
                    color: var(--text-secondary);
                    margin-bottom: 8px;
                    font-weight: 500;
                }

                input[type="text"], input[type="number"], select, textarea {
                    width: 100%;
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid var(--glass-border);
                    border-radius: var(--radius-md);
                    padding: 12px 16px;
                    color: white;
                    font-family: inherit;
                    font-size: 14px;
                    transition: var(--transition);
                }

                input:focus, select:focus {
                    outline: none;
                    border-color: var(--accent-green);
                    background: rgba(255, 255, 255, 0.06);
                }

                select option {
                    background: #1a1d24;
                    color: white;
                    padding: 12px 16px;
                    font-size: 14px;
                    font-family: inherit;
                }

                select option:hover {
                    background: var(--accent-green);
                    color: #07090c;
                }

                .dropzone {
                    width: 120px;
                    height: 120px;
                    border: 2px dashed var(--glass-border);
                    border-radius: 50%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    font-size: 11px;
                    color: var(--text-muted);
                    cursor: pointer;
                    transition: var(--transition);
                    margin-bottom: 12px;
                }

                .dropzone:hover {
                    border-color: var(--accent-green);
                    background: rgba(34, 197, 94, 0.05);
                }

                .chip-group {
                    display: flex;
                    gap: 8px;
                }

                .chip-select {
                    padding: 8px 16px;
                    border-radius: 6px;
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid var(--glass-border);
                    cursor: pointer;
                    font-size: 13px;
                    transition: var(--transition);
                    color: var(--text-secondary);
                }

                .chip-select:hover {
                    background: rgba(255, 255, 255, 0.06);
                }

                .chip-select.active {
                    background: var(--accent-green);
                    color: #000;
                    border-color: var(--accent-green);
                    font-weight: 600;
                }

                .format-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                }

                .format-card {
                    background: rgba(255, 255, 255, 0.02);
                    border: 1px solid var(--glass-border);
                    padding: 20px;
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    transition: var(--transition);
                    text-align: center;
                }

                .format-card:hover {
                    background: rgba(255, 255, 255, 0.05);
                    border-color: var(--text-muted);
                }

                .format-card.active {
                    border-color: var(--accent-green);
                    box-shadow: inset 0 0 10px rgba(34, 197, 94, 0.1);
                }

                .format-card h4 { 
                    font-size: 14px; 
                    margin-bottom: 4px; 
                    color: var(--text-primary);
                }
                
                .format-card p { 
                    font-size: 11px; 
                    color: var(--text-secondary); 
                }

                .compact-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .compact-table th {
                    text-align: left;
                    font-size: 11px;
                    text-transform: uppercase;
                    color: var(--text-muted);
                    padding: 12px;
                    border-bottom: 1px solid var(--glass-border);
                }

                .compact-table td {
                    padding: 12px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.02);
                    font-size: 14px;
                    color: var(--text-primary);
                }

                .wizard-footer {
                    margin-top: 32px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .btn {
                    padding: 12px 24px;
                    border-radius: var(--radius-md);
                    font-family: inherit;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: var(--transition);
                    border: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                }

                .btn-ghost {
                    background: transparent;
                    color: var(--text-secondary);
                }

                .btn-ghost:hover {
                    color: white;
                    background: rgba(255, 255, 255, 0.05);
                }

                .btn-secondary {
                    background: rgba(255, 255, 255, 0.05);
                    color: white;
                    border: 1px solid var(--glass-border);
                }

                .btn-primary {
                    background: var(--accent-green);
                    color: #07090c;
                }

                .btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 15px rgba(34, 197, 94, 0.4);
                }

                .btn:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                    transform: none !important;
                }

                .checklist-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 16px;
                    padding: 12px;
                    border-radius: 8px;
                    background: rgba(255, 255, 255, 0.02);
                }

                .check-circle {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: var(--accent-green);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #000;
                    font-size: 10px;
                    font-weight: bold;
                    flex-shrink: 0;
                }

                .back-button {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid var(--glass-border);
                    border-radius: var(--radius-md);
                    color: var(--text-secondary);
                    font-size: 14px;
                    cursor: pointer;
                    transition: var(--transition);
                    margin-bottom: 24px;
                }

                .back-button:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: var(--text-primary);
                }

                @media (max-width: 768px) {
                    .step-grid { grid-template-columns: 1fr; gap: 32px; }
                    .header-actions .btn-secondary { display: none; }
                    .steps-container { gap: 15px; }
                    .step-label { display: none; }
                }
            `}</style>

            <div className="create-tournament-page">
                <div className="app-container">
                    <button onClick={() => router.push(`/admin/union/${unionId}/torneos`)} className="back-button">
                        <ArrowLeft size={16} />
                        Volver a Torneos
                    </button>

                    <header className="page-header">
                        <div className="title-area">
                            <div className="breadcrumb">Panel / Torneos / <span>{isEdit ? 'Editar torneo' : 'Crear torneo'}</span></div>
                            <h1>{isEdit ? 'Editar torneo' : 'Crear torneo'}</h1>
                            <p>Configura lo basico y publica cuando quieras.</p>
                        </div>
                        <div className="header-actions">
                            <div className="status-chip">{isEdit ? 'Edicion' : 'Borrador'}</div>
                            <button className="btn btn-secondary">{isEdit ? 'Guardar cambios' : 'Guardar borrador'}</button>
                        </div>
                    </header>

                    <nav className="wizard-nav">
                        <div className="progress-text">Paso {currentStep} de 5</div>
                        <div className="steps-container">
                            {['Básico', 'Formato', 'Reglas', 'Competidores', 'Revisión'].map((label, idx) => (
                                <div
                                    key={idx}
                                    className={`step-item ${currentStep === idx + 1 ? 'active' : ''}`}
                                    onClick={() => setCurrentStep(idx + 1)}
                                >
                                    <span className="step-label">{label}</span>
                                </div>
                            ))}
                        </div>
                    </nav>

                    <main className="wizard-content">
                        {/* Step 1: Básico */}
                        <section className={`glass-card ${currentStep === 1 ? 'active' : ''}`}>
                            <div className="step-grid">
                                <div className="col">
                                    <h3 className="section-title">Identidad del Torneo</h3>

                                    <div className="form-group">
                                        <label>LOGO / IMAGEN</label>

                                        {/* Method selector */}
                                        <div className="chip-group" style={{ marginBottom: '12px' }}>
                                            <div
                                                onClick={() => {
                                                    setLogoMethod('url');
                                                    clearLogo();
                                                }}
                                                className={`chip-select ${logoMethod === 'url' ? 'active' : ''}`}
                                            >
                                                URL
                                            </div>
                                            <div
                                                onClick={() => {
                                                    setLogoMethod('file');
                                                    clearLogo();
                                                }}
                                                className={`chip-select ${logoMethod === 'file' ? 'active' : ''}`}
                                            >
                                                Subir archivo
                                            </div>
                                        </div>

                                        {/* URL input */}
                                        {logoMethod === 'url' && (
                                            <div>
                                                <input
                                                    type="text"
                                                    placeholder="https://ejemplo.com/logo.png"
                                                    value={logoUrl}
                                                    onChange={(e) => handleUrlChange(e.target.value)}
                                                    style={{ marginBottom: '8px' }}
                                                />
                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                    Ingresá la URL completa de la imagen
                                                </div>
                                            </div>
                                        )}

                                        {/* File upload */}
                                        {logoMethod === 'file' && (
                                            <div>
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleFileSelect}
                                                    style={{ display: 'none' }}
                                                />
                                                <div
                                                    className="dropzone"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    style={{ width: '100%', height: 'auto', padding: '24px', borderRadius: '8px' }}
                                                >
                                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                        <circle cx="8.5" cy="8.5" r="1.5" />
                                                        <polyline points="21 15 16 10 5 21" />
                                                    </svg>
                                                    <span style={{ marginTop: '12px' }}>
                                                        {logoFile ? logoFile.name : 'Click para seleccionar archivo'}
                                                    </span>
                                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                        PNG, JPG, GIF hasta 5MB
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Logo Preview */}
                                        {logoPreview && (
                                            <div style={{
                                                marginTop: '16px',
                                                padding: '16px',
                                                background: 'rgba(255,255,255,0.02)',
                                                borderRadius: '8px',
                                                border: '1px solid var(--glass-border)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px'
                                            }}>
                                                <img
                                                    src={logoPreview}
                                                    alt="Preview"
                                                    style={{
                                                        width: '64px',
                                                        height: '64px',
                                                        objectFit: 'cover',
                                                        borderRadius: '8px',
                                                        border: '1px solid var(--glass-border)'
                                                    }}
                                                />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>
                                                        Vista previa del logo
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                        {logoMethod === 'file' ? logoFile?.name : 'Desde URL'}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={clearLogo}
                                                    style={{
                                                        background: 'rgba(239,68,68,0.1)',
                                                        border: '1px solid rgba(239,68,68,0.2)',
                                                        borderRadius: '6px',
                                                        padding: '6px 12px',
                                                        color: '#ef4444',
                                                        cursor: 'pointer',
                                                        fontSize: '12px'
                                                    }}
                                                >
                                                    Eliminar
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="form-group">
                                        <label>NOMBRE DEL TORNEO *</label>
                                        <input
                                            type="text"
                                            placeholder="Ej. Copa de Verano 2026"
                                            value={formData.name}
                                            onChange={(e) => updateFormData('name', e.target.value)}
                                        />
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            matchcenter.com/torneo/<span>{formData.name.toLowerCase().replace(/\s+/g, '-') || 'nombre-del-torneo'}</span>
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label>DEPORTE</label>
                                        <select value={formData.sport} onChange={(e) => handleSportChange(e.target.value)}>
                                            {Object.keys(sportsData).sort().map((sport) => (
                                                <option key={sport} value={sport}>
                                                    {sport}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>VISIBILIDAD</label>
                                        <div className="chip-group">
                                            {['public', 'private', 'unlisted'].map((vis) => (
                                                <div
                                                    key={vis}
                                                    onClick={() => updateFormData('visibility', vis)}
                                                    className={`chip-select ${formData.visibility === vis ? 'active' : ''}`}
                                                >
                                                    {vis === 'public' ? 'Público' : vis === 'private' ? 'Privado' : 'No listado'}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label>SEXO</label>
                                        <div className="chip-group">
                                            {['Masculino', 'Femenino', 'Mixto'].map((gender) => (
                                                <div
                                                    key={gender}
                                                    onClick={() => updateFormData('gender', gender)}
                                                    className={`chip-select ${formData.gender === gender ? 'active' : ''}`}
                                                >
                                                    {gender}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label>CATEGORÍA</label>
                                        <select value={formData.category} onChange={(e) => updateFormData('category', e.target.value)}>
                                            <option>Profesional</option>
                                            <option>Semi Profesional</option>
                                            <option>Amateur</option>
                                            <option>Juvenil</option>
                                            <option>Amistoso Recreativo</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="col">
                                    <h3 className="section-title">Contexto y Fechas</h3>
                                    <div className="form-group">
                                        <label>TEMPORADA</label>
                                        <input
                                            type="text"
                                            placeholder="2026"
                                            value={formData.season}
                                            onChange={(e) => updateFormData('season', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>UBICACIÓN (CIUDAD/PROVINCIA)</label>
                                        <input
                                            type="text"
                                            placeholder="Buenos Aires, ARG"
                                            value={formData.location}
                                            onChange={(e) => updateFormData('location', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>PAÍS</label>
                                        <input
                                            type="text"
                                            placeholder="Argentina"
                                            value={formData.country}
                                            onChange={(e) => updateFormData('country', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label>INICIO</label>
                                            <input
                                                type="text"
                                                placeholder="DD/MM/AAAA"
                                                value={formData.startDate}
                                                onChange={(e) => updateFormData('startDate', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label>FIN</label>
                                            <input
                                                type="text"
                                                placeholder="DD/MM/AAAA"
                                                value={formData.endDate}
                                                onChange={(e) => updateFormData('endDate', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.1)', marginTop: '32px' }}>
                                        <p style={{ fontSize: '12px', color: 'var(--accent-green)' }}>
                                            TIP: Podés dejar las fechas vacías y se mostrará como <strong>"SIN FECHA"</strong> hasta que el fixture esté listo.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Step 2: Formato */}
                        <section className={`glass-card ${currentStep === 2 ? 'active' : ''}`}>
                            <h3 className="section-title">Tipo de Competencia</h3>
                            <div className="format-grid">
                                {[
                                    { id: 'league', name: 'Liga', desc: 'Todos contra todos' },
                                    { id: 'knockout', name: 'Eliminación', desc: 'Playoffs directos' },
                                    { id: 'group-playoff', name: 'Grupos + Playoffs', desc: 'Mundial / Champions' },
                                    { id: 'swiss', name: 'Suizo', desc: 'Chess / Esports style' }
                                ].map((fmt) => (
                                    <div
                                        key={fmt.id}
                                        onClick={() => updateFormData('format', fmt.id)}
                                        className={`format-card ${formData.format === fmt.id ? 'active' : ''}`}
                                    >
                                        <h4>{fmt.name}</h4>
                                        <p>Configura lo basico y publica cuando quieras.</p>
                                    </div>
                                ))}
                            </div>

                            <div style={{ marginTop: '40px' }}>
                                <h3 className="section-title">Configuración de Puntos</h3>
                                <div className="step-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                                    <div className="form-group">
                                        <label>VICTORIA</label>
                                        <input
                                            type="number"
                                            value={formData.pointsWin}
                                            onChange={(e) => updateFormData('pointsWin', parseInt(e.target.value))}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>EMPATE</label>
                                        <input
                                            type="number"
                                            value={formData.pointsDraw}
                                            onChange={(e) => updateFormData('pointsDraw', parseInt(e.target.value))}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>DERROTA</label>
                                        <input
                                            type="number"
                                            value={formData.pointsLoss}
                                            onChange={(e) => updateFormData('pointsLoss', parseInt(e.target.value))}
                                        />
                                    </div>
                                </div>

                                {/* Tiebreakers Section */}
                                <div className="form-group" style={{ marginTop: '40px' }}>
                                    <label>CRITERIOS DE DESEMPATE (SELECCIONÁ Y ORDENÁLOS)</label>

                                    {/* Selected Tiebreakers - Reorderable */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                                            Criterios Seleccionados ({selectedTiebreakers.length})
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {selectedTiebreakers.map((criterion, idx) => (
                                                <div
                                                    key={idx}
                                                    style={{
                                                        padding: '10px 12px',
                                                        background: 'rgba(255,255,255,0.05)',
                                                        borderRadius: '6px',
                                                        fontSize: '13px',
                                                        borderLeft: idx === 0 ? '3px solid var(--accent-green)' : '3px solid var(--text-muted)',
                                                        color: 'var(--text-primary)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        transition: 'var(--transition)'
                                                    }}
                                                >
                                                    <span style={{ fontWeight: idx === 0 ? 600 : 400 }}>
                                                        {idx + 1}. {criterion}
                                                    </span>
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        <button
                                                            onClick={() => moveTiebreakerUp(idx)}
                                                            disabled={idx === 0}
                                                            style={{
                                                                background: 'rgba(255,255,255,0.05)',
                                                                border: '1px solid var(--glass-border)',
                                                                borderRadius: '4px',
                                                                padding: '4px 8px',
                                                                color: 'var(--text-secondary)',
                                                                cursor: idx === 0 ? 'not-allowed' : 'pointer',
                                                                fontSize: '11px',
                                                                opacity: idx === 0 ? 0.3 : 1
                                                            }}
                                                        >
                                                            ↑
                                                        </button>
                                                        <button
                                                            onClick={() => moveTiebreakerDown(idx)}
                                                            disabled={idx === selectedTiebreakers.length - 1}
                                                            style={{
                                                                background: 'rgba(255,255,255,0.05)',
                                                                border: '1px solid var(--glass-border)',
                                                                borderRadius: '4px',
                                                                padding: '4px 8px',
                                                                color: 'var(--text-secondary)',
                                                                cursor: idx === selectedTiebreakers.length - 1 ? 'not-allowed' : 'pointer',
                                                                fontSize: '11px',
                                                                opacity: idx === selectedTiebreakers.length - 1 ? 0.3 : 1
                                                            }}
                                                        >
                                                            ↓
                                                        </button>
                                                        <button
                                                            onClick={() => removeTiebreaker(criterion)}
                                                            style={{
                                                                background: 'rgba(239,68,68,0.1)',
                                                                border: '1px solid rgba(239,68,68,0.2)',
                                                                borderRadius: '4px',
                                                                padding: '4px 8px',
                                                                color: '#ef4444',
                                                                cursor: 'pointer',
                                                                fontSize: '11px'
                                                            }}
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Available Tiebreakers */}
                                    <div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                                            Criterios Disponibles
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: '6px',
                                            maxHeight: '200px',
                                            overflowY: 'auto',
                                            padding: '12px',
                                            background: 'rgba(255,255,255,0.02)',
                                            borderRadius: '8px',
                                            border: '1px solid var(--glass-border)'
                                        }}>
                                            {allTiebreakers
                                                .filter(t => !selectedTiebreakers.includes(t))
                                                .map((criterion) => (
                                                    <div
                                                        key={criterion}
                                                        onClick={() => addTiebreaker(criterion)}
                                                        style={{
                                                            padding: '6px 12px',
                                                            background: 'rgba(255,255,255,0.05)',
                                                            border: '1px solid var(--glass-border)',
                                                            borderRadius: '6px',
                                                            fontSize: '12px',
                                                            color: 'var(--text-secondary)',
                                                            cursor: 'pointer',
                                                            transition: 'var(--transition)',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.background = 'rgba(34,197,94,0.1)';
                                                            e.currentTarget.style.borderColor = 'var(--accent-green)';
                                                            e.currentTarget.style.color = 'var(--accent-green)';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                                            e.currentTarget.style.borderColor = 'var(--glass-border)';
                                                            e.currentTarget.style.color = 'var(--text-secondary)';
                                                        }}
                                                    >
                                                        + {criterion}
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Position Labels Section */}
                                <div style={{ marginTop: '48px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <div>
                                            <h3 className="section-title" style={{ marginBottom: '4px' }}>Etiquetas de Posición</h3>
                                            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                Definí qué significa cada rango de posiciones (ej: 1-4 = Clasifican a Playoffs)
                                            </p>
                                        </div>
                                        <button
                                            onClick={addPositionLabel}
                                            className="btn btn-secondary"
                                            style={{ padding: '6px 12px', fontSize: '12px' }}
                                        >
                                            + Agregar Etiqueta
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {positionLabels.map((label, idx) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    padding: '16px',
                                                    background: 'rgba(255,255,255,0.02)',
                                                    border: '1px solid var(--glass-border)',
                                                    borderRadius: '8px',
                                                    display: 'grid',
                                                    gridTemplateColumns: '80px 80px 1fr 100px 40px',
                                                    gap: '12px',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                <div>
                                                    <label style={{ fontSize: '10px', marginBottom: '4px' }}>DESDE</label>
                                                    <input
                                                        type="number"
                                                        value={label.from}
                                                        onChange={(e) => updatePositionLabel(idx, 'from', parseInt(e.target.value))}
                                                        style={{ padding: '6px 8px', fontSize: '13px' }}
                                                        min={1}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '10px', marginBottom: '4px' }}>HASTA</label>
                                                    <input
                                                        type="number"
                                                        value={label.to}
                                                        onChange={(e) => updatePositionLabel(idx, 'to', parseInt(e.target.value))}
                                                        style={{ padding: '6px 8px', fontSize: '13px' }}
                                                        min={label.from}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '10px', marginBottom: '4px' }}>ETIQUETA</label>
                                                    <input
                                                        type="text"
                                                        value={label.label}
                                                        onChange={(e) => updatePositionLabel(idx, 'label', e.target.value)}
                                                        placeholder="Ej: Clasifican a Playoffs"
                                                        style={{ padding: '6px 8px', fontSize: '13px' }}
                                                    />
                                                </div>
                                                <div>
                                                    <label style={{ fontSize: '10px', marginBottom: '4px' }}>COLOR</label>
                                                    <input
                                                        type="color"
                                                        value={label.color}
                                                        onChange={(e) => updatePositionLabel(idx, 'color', e.target.value)}
                                                        style={{
                                                            padding: '2px',
                                                            height: '32px',
                                                            cursor: 'pointer',
                                                            border: '1px solid var(--glass-border)',
                                                            borderRadius: '6px'
                                                        }}
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => removePositionLabel(idx)}
                                                    style={{
                                                        background: 'rgba(239,68,68,0.1)',
                                                        border: '1px solid rgba(239,68,68,0.2)',
                                                        borderRadius: '6px',
                                                        padding: '8px',
                                                        color: '#ef4444',
                                                        cursor: 'pointer',
                                                        fontSize: '14px',
                                                        marginTop: '14px'
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}

                                        {positionLabels.length === 0 && (
                                            <div style={{
                                                padding: '32px',
                                                textAlign: 'center',
                                                color: 'var(--text-muted)',
                                                fontSize: '13px',
                                                background: 'rgba(255,255,255,0.02)',
                                                borderRadius: '8px',
                                                border: '1px dashed var(--glass-border)'
                                            }}>
                                                No hay etiquetas de posición. Click en "+ Agregar Etiqueta" para crear una.
                                            </div>
                                        )}

                                        {/* Preview de etiquetas */}
                                        {positionLabels.length > 0 && (
                                            <div style={{
                                                marginTop: '16px',
                                                padding: '16px',
                                                background: 'rgba(255,255,255,0.02)',
                                                borderRadius: '8px',
                                                border: '1px solid var(--glass-border)'
                                            }}>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase' }}>
                                                    Vista Previa
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    {positionLabels.map((label, idx) => (
                                                        <div
                                                            key={idx}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '12px',
                                                                padding: '8px 12px',
                                                                background: 'rgba(255,255,255,0.03)',
                                                                borderRadius: '6px',
                                                                borderLeft: `3px solid ${label.color}`
                                                            }}
                                                        >
                                                            <span style={{
                                                                fontSize: '12px',
                                                                fontWeight: 600,
                                                                color: label.color,
                                                                minWidth: '60px'
                                                            }}>
                                                                #{label.from}-{label.to}
                                                            </span>
                                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                                                                {label.label}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Step 3: Reglas */}
                        <section className={`glass-card ${currentStep === 3 ? 'active' : ''}`}>
                            <h3 className="section-title">Reglamentación del Encuentro</h3>
                            <div className="step-grid">
                                <div className="col">
                                    <div className="form-group">
                                        <label>DURACIÓN REGLAMENTARIA</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <input
                                                type="number"
                                                value={formData.matchDuration}
                                                onChange={(e) => updateFormData('matchDuration', parseInt(e.target.value))}
                                                style={{ width: '80px' }}
                                            />
                                            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>minutos</span>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>ESTADÍSTICAS HABILITADAS ({formData.sport.toUpperCase()})</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                            {sportsData[formData.sport as keyof typeof sportsData]?.stats.map((stat) => (
                                                <label key={stat} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={enabledStats.includes(stat)}
                                                        onChange={() => toggleStat(stat)}
                                                    />
                                                    {stat}
                                                </label>
                                            ))}
                                        </div>
                                        <div style={{
                                            marginTop: '12px',
                                            padding: '12px',
                                            background: 'rgba(34,197,94,0.05)',
                                            border: '1px solid rgba(34,197,94,0.1)',
                                            borderRadius: '6px',
                                            fontSize: '11px',
                                            color: 'var(--accent-green)'
                                        }}>
                                            ✓ {enabledStats.length} estadísticas seleccionadas
                                        </div>
                                    </div>
                                </div>
                                <div className="col">
                                    <label>PRESET DE REGLAS</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {[
                                            { id: 'standard', name: 'Estándar Oficial' },
                                            { id: 'professional', name: 'Profesional' },
                                            { id: 'amateur', name: 'Amateur / Recreativo' },
                                            { id: 'youth', name: 'Juvenil / Infantil' },
                                            { id: 'custom', name: 'Personalizado' }
                                        ].map((preset) => (
                                            <div
                                                key={preset.id}
                                                onClick={() => updateFormData('rulePreset', preset.id)}
                                                className={`chip-select ${formData.rulePreset === preset.id ? 'active' : ''}`}
                                            >
                                                {preset.name}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Step 4: Competidores */}
                        <section className={`glass-card ${currentStep === 4 ? 'active' : ''}`}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
                                <h3 className="section-title" style={{ marginBottom: 0 }}>Competidores</h3>
                                <button
                                    className="btn btn-secondary"
                                    style={{ padding: '6px 12px', fontSize: '12px' }}
                                    onClick={() => setShowAddTeamModal(true)}
                                >
                                    + Agregar Equipo
                                </button>
                            </div>

                            <table className="compact-table">
                                <thead>
                                    <tr>
                                        <th>EQUIPO</th>
                                        <th>SIGLA</th>
                                        <th>CIUDAD</th>
                                        <th>ACCIONES</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                            No hay equipos agregados
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            <div style={{ marginTop: '32px', border: '1px dashed var(--glass-border)', padding: '20px', textAlign: 'center', borderRadius: '8px' }}>
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    ¿Tenés muchos equipos? <a href="#" style={{ color: 'var(--accent-green)' }}>Importá desde un CSV</a> o desde otro torneo.
                                </p>
                            </div>
                        </section>

                        {/* Step 5: Revisión */}
                        <section className={`glass-card ${currentStep === 5 ? 'active' : ''}`}>
                            <h3 className="section-title">Revisión Final</h3>

                            <div className="step-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                <div>
                                    <div className="checklist-item">
                                        <div className="check-circle">✓</div>
                                        <div>
                                            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Nombre y Deporte</p>
                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {formData.name || 'Sin nombre'} • {formData.sport}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="checklist-item">
                                        <div className="check-circle">✓</div>
                                        <div>
                                            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Formato Definido</p>
                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {formData.format === 'league' ? 'Liga' : formData.format} • Victoria: {formData.pointsWin}pts
                                            </p>
                                        </div>
                                    </div>
                                    <div className="checklist-item">
                                        <div className="check-circle">✓</div>
                                        <div>
                                            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Reglas de Juego</p>
                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                Duración: {formData.matchDuration} minutos
                                            </p>
                                        </div>
                                    </div>
                                    <div className="checklist-item">
                                        <div className="check-circle">✓</div>
                                        <div>
                                            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Categoría y Contexto</p>
                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                {formData.gender} • {formData.category} • {formData.country || 'País no especificado'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="checklist-item" style={{ opacity: 0.5 }}>
                                        <div className="check-circle" style={{ background: 'var(--text-muted)' }}>!</div>
                                        <div>
                                            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Fixture pendiente</p>
                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                Podés generarlo después de publicar.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ background: 'linear-gradient(135deg, #111827 0%, #07090c 100%)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: 0, right: 0, padding: '10px', fontSize: '10px', color: 'var(--accent-green)', fontWeight: 'bold', background: 'rgba(34,197,94,0.1)' }}>
                                        PREVIEW
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '20px' }}>
                                        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--text-muted)' }}>
                                            LOGO
                                        </div>
                                        <div>
                                            <h2 style={{ fontSize: '18px', color: 'var(--text-primary)' }}>
                                                {formData.name || 'Nombre del Torneo'}
                                            </h2>
                                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                {formData.sport} • {formData.location || 'Sin ubicación'}
                                            </p>
                                            <span className="status-chip" style={{ fontSize: '9px', marginTop: '8px', display: 'inline-block' }}>
                                                SIN FECHA
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '20px' }}>
                                        <div>
                                            <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>EQUIPOS</p>
                                            <p style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>0</p>
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>FORMATO</p>
                                            <p style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                                {formData.format === 'league' ? 'Liga' : formData.format}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <footer className="wizard-footer">
                            <button
                                className="btn btn-ghost"
                                disabled={currentStep === 1}
                                onClick={handlePrev}
                            >
                                Atrás
                            </button>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button className="btn btn-secondary">{isEdit ? 'Guardar cambios' : 'Guardar borrador'}</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleNext}
                                    disabled={currentStep === 1 && formData.name.length < 3}
                                >
                                    {currentStep === 5 ? (isEdit ? 'Guardar cambios' : 'Publicar Torneo') : 'Siguiente'}
                                </button>
                            </div>
                        </footer>
                    </main>
                </div>
            </div>

            {/* Modal: Opciones de Agregar Equipo */}
            {showAddTeamModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '24px'
                }} onClick={resetTeamModals}>
                    <div className="glass-card" style={{
                        maxWidth: '550px',
                        width: '100%',
                        padding: '32px',
                        animation: 'fadeIn 0.3s ease-out'
                    }} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Agregar Equipo al Torneo</h3>
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '32px' }}>
                            Selecciona cómo deseas agregar el equipo
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <button
                                onClick={() => {
                                    setShowAddTeamModal(false);
                                    setShowImportTeamList(true);
                                }}
                                style={{
                                    padding: '24px',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    border: '1px solid var(--glass-border)',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '12px',
                                    color: 'white'
                                }}
                                className="hover-lift"
                            >
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="9" cy="7" r="4"></circle>
                                    <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                </svg>
                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>Importar Equipo</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Seleccionar de clubes existentes</div>
                                </div>
                            </button>

                            <button
                                onClick={() => {
                                    setShowAddTeamModal(false);
                                    setShowCreateTeamForm(true);
                                }}
                                style={{
                                    padding: '24px',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    border: '1px solid var(--glass-border)',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '12px',
                                    color: 'white'
                                }}
                                className="hover-lift"
                            >
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="8" x2="12" y2="16"></line>
                                    <line x1="8" y1="12" x2="16" y2="12"></line>
                                </svg>
                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>Crear Equipo</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Creación rápida de equipo</div>
                                </div>
                            </button>
                        </div>

                        <button
                            onClick={resetTeamModals}
                            style={{
                                marginTop: '24px',
                                width: '100%',
                                padding: '12px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 500
                            }}
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Modal: Crear Equipo Rápido */}
            {showCreateTeamForm && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '24px'
                }} onClick={resetTeamModals}>
                    <div className="glass-card" style={{
                        maxWidth: '550px',
                        width: '100%',
                        padding: '32px',
                        animation: 'fadeIn 0.3s ease-out'
                    }} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Creación Rápida de Equipo</h3>
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px' }}>
                            Completa los datos básicos del equipo
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div className="form-group">
                                <label>NOMBRE DEL EQUIPO *</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Club Atlético San Isidro"
                                    value={newTeamData.name}
                                    onChange={(e) => setNewTeamData({ ...newTeamData, name: e.target.value })}
                                    autoFocus
                                />
                            </div>

                            <div className="form-group">
                                <label>SIGLA / NOMBRE CORTO</label>
                                <input
                                    type="text"
                                    placeholder="Ej: CASI"
                                    value={newTeamData.shortName}
                                    onChange={(e) => setNewTeamData({ ...newTeamData, shortName: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label>CIUDAD</label>
                                <input
                                    type="text"
                                    placeholder="Ej: San Isidro"
                                    value={newTeamData.city}
                                    onChange={(e) => setNewTeamData({ ...newTeamData, city: e.target.value })}
                                />
                            </div>

                            <div style={{
                                padding: '12px 16px',
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.2)',
                                borderRadius: 'var(--radius-md)',
                                fontSize: '12px',
                                color: 'var(--accent-green)'
                            }}>
                                💡 Podrás agregar más detalles (logo, colores, estadio) después de crear el equipo
                            </div>
                        </div>

                        <div style={{ marginTop: '32px', display: 'flex', gap: '12px' }}>
                            <button
                                onClick={resetTeamModals}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid var(--glass-border)',
                                    borderRadius: 'var(--radius-md)',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateTeam}
                                disabled={!newTeamData.name.trim()}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: newTeamData.name.trim() ? 'var(--accent-green)' : 'rgba(255, 255, 255, 0.1)',
                                    border: 'none',
                                    borderRadius: 'var(--radius-md)',
                                    color: newTeamData.name.trim() ? '#000' : 'var(--text-muted)',
                                    cursor: newTeamData.name.trim() ? 'pointer' : 'not-allowed',
                                    fontSize: '14px',
                                    fontWeight: 700,
                                    opacity: newTeamData.name.trim() ? 1 : 0.5
                                }}
                            >
                                Crear y Agregar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Importar Equipo Existente */}
            {showImportTeamList && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '24px'
                }} onClick={resetTeamModals}>
                    <div className="glass-card" style={{
                        maxWidth: '650px',
                        width: '100%',
                        padding: '32px',
                        animation: 'fadeIn 0.3s ease-out',
                        maxHeight: '80vh',
                        overflowY: 'auto'
                    }} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Importar Equipo Existente</h3>
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px' }}>
                            Selecciona un club de los registrados en la federación
                        </p>

                        <div className="form-group" style={{ marginBottom: '20px' }}>
                            <input
                                type="text"
                                placeholder="Buscar por nombre o ciudad..."
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                            {availableTeams.map(team => (
                                <div
                                    key={team.id}
                                    onClick={() => handleImportTeam(team.id)}
                                    style={{
                                        padding: '16px',
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        border: '1px solid var(--glass-border)',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                    className="hover-lift"
                                >
                                    <div>
                                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>{team.name}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                            {team.shortName} • {team.city}
                                        </div>
                                    </div>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 18 15 12 9 6"></polyline>
                                    </svg>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={resetTeamModals}
                            style={{
                                width: '100%',
                                padding: '12px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 500
                            }}
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
