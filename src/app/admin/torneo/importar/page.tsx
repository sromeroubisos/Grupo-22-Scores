'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from '../tournament-admin.module.css';

type Confidence = 'high' | 'medium' | 'low';
type Sheet = { name: string; rows: string[][] };

interface Interpreted {
  name: string;
  nameConfidence: Confidence;
  categories: string[];
  zones: string[];
  teams: { name: string; zone: string | null; category: string | null }[];
  matches: { round: string | null; home: string; away: string; date: string | null; time: string | null; venue: string | null; zone: string | null }[];
  players: { team: string; fullName: string; jersey: number | null }[];
  playoffHints: string[];
  hasGroups: boolean;
  warnings: string[];
  confidence: { teams: Confidence; zones: Confidence; matches: Confidence; players: Confidence };
  stats: { sheets: number; teamCount: number; zoneCount: number; matchCount: number; playerCount: number; duplicateTeams: string[]; duplicateMatches: number };
}

const CONF_COLOR: Record<Confidence, string> = {
  high: 'var(--status-active, #16a34a)',
  medium: '#d97706',
  low: 'var(--status-error, #dc2626)',
};
const CONF_LABEL: Record<Confidence, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };

function Badge({ c }: { c: Confidence }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: CONF_COLOR[c] }}>
      Confianza: {CONF_LABEL[c]}
    </span>
  );
}

export default function TournamentImportPage() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interpreted, setInterpreted] = useState<Interpreted | null>(null);
  const [sel, setSel] = useState({ teams: true, zones: true, matches: true, players: false });
  const [done, setDone] = useState<{ tournamentId: string; created: any; warnings: string[] } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDone(null);
    setInterpreted(null);
    setFileName(file.name);
    setParsing(true);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheets: Sheet[] = wb.SheetNames.map((sn) => {
        const ws = wb.Sheets[sn];
        const rows = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          blankrows: false,
          raw: false,
          defval: '',
        }) as unknown[][];
        return { name: sn, rows: rows.map((r) => (r ?? []).map((c) => String(c ?? ''))) };
      });
      const res = await fetch('/api/admin/torneo/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'interpret', fileName: file.name, sheets }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'No se pudo interpretar el archivo.');
      setInterpreted(json.interpreted as Interpreted);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al leer el archivo.');
    } finally {
      setParsing(false);
    }
  }

  function patch(p: Partial<Interpreted>) {
    setInterpreted((cur) => (cur ? { ...cur, ...p } : cur));
  }

  async function commit() {
    if (!interpreted) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/torneo/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'commit', fileName, interpreted, selection: sel }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'No se pudo crear el torneo.');
      setDone({ tournamentId: json.tournamentId, created: json.created, warnings: json.warnings ?? [] });
      setInterpreted(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el torneo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Importación</p>
          <h1 className={styles.pageTitle}>Importar torneo desde Excel</h1>
          <p className={styles.pageSubtitle}>
            Subí un Excel/CSV con equipos, zonas y fixture. El sistema interpreta la estructura y te
            muestra una previsualización editable. Nada se crea hasta que confirmes.
          </p>
        </div>
      </div>

      {error && (
        <div className={styles.card} style={{ borderColor: 'var(--status-error)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {done && (
        <div className={styles.card} style={{ marginBottom: 16 }}>
          <strong>Torneo creado.</strong>
          <div className="text-[13px]" style={{ margin: '8px 0' }}>
            {done.created.clubs} clubes · {done.created.participants} participantes ·{' '}
            {done.created.zones} zonas · {done.created.phases} fase(s) ·{' '}
            {done.created.matches} partidos · {done.created.players} jugadores
          </div>
          {done.warnings.length > 0 && (
            <ul className="text-[12px]" style={{ opacity: 0.8, marginBottom: 8 }}>
              {done.warnings.slice(0, 10).map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
          )}
          <Link
            className={styles.btnPrimary}
            href={`/admin/entities/${done.tournamentId}/manage?type=tournament&tab=estructura`}
          >
            Abrir torneo en el gestor
          </Link>
        </div>
      )}

      {!interpreted && !done && (
        <div className={styles.card}>
          <label className="text-[13px] font-semibold block mb-2">Archivo (.xlsx, .xls, .csv)</label>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={parsing} />
          {parsing && <p style={{ marginTop: 10 }}>Interpretando archivo…</p>}
          <p className="text-[12px]" style={{ opacity: 0.7, marginTop: 12 }}>
            Sugerido: columnas como <b>Zona/Grupo</b>, <b>Equipo</b> (listado) y, para el fixture,{' '}
            <b>Local</b>, <b>Visitante</b>, <b>Fecha</b>, <b>Hora</b>, <b>Cancha</b>, <b>Jornada</b>.
          </p>
        </div>
      )}

      {interpreted && (
        <>
          <div className={styles.card} style={{ marginBottom: 16 }}>
            <label className="text-[12px] font-semibold block mb-1">
              Nombre del torneo <Badge c={interpreted.nameConfidence} />
            </label>
            <input
              className={styles.input}
              value={interpreted.name}
              onChange={(e) => patch({ name: e.target.value })}
              style={{ width: '100%', minWidth: 0 }}
            />
            <div className="text-[12px]" style={{ opacity: 0.75, marginTop: 8 }}>
              {interpreted.stats.sheets} hoja(s) · {interpreted.stats.teamCount} equipos ·{' '}
              {interpreted.stats.zoneCount} zonas · {interpreted.stats.matchCount} partidos ·{' '}
              {interpreted.stats.playerCount} jugadores
            </div>
          </div>

          {interpreted.warnings.length > 0 && (
            <div className={styles.card} style={{ marginBottom: 16, borderColor: '#d97706' }}>
              <strong className="text-[13px]">Avisos</strong>
              <ul className="text-[12px]" style={{ marginTop: 6 }}>
                {interpreted.warnings.map((w, i) => <li key={i}>• {w}</li>)}
              </ul>
            </div>
          )}

          <div className={styles.card} style={{ marginBottom: 16 }}>
            <strong className="text-[13px]">¿Qué importar?</strong>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10 }}>
              {([
                ['zones', `Zonas (${interpreted.zones.length})`, interpreted.confidence.zones],
                ['teams', `Equipos (${interpreted.teams.length})`, interpreted.confidence.teams],
                ['matches', `Fixture (${interpreted.matches.length})`, interpreted.confidence.matches],
                ['players', `Jugadores (${interpreted.players.length})`, interpreted.confidence.players],
              ] as const).map(([k, label, c]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={(sel as any)[k]}
                    onChange={(e) => setSel((s) => ({ ...s, [k]: e.target.checked }))}
                  />
                  <span className="text-[13px]">{label}</span>
                  <Badge c={c} />
                </label>
              ))}
            </div>
          </div>

          {interpreted.zones.length > 0 && (
            <div className={styles.card} style={{ marginBottom: 16 }}>
              <strong className="text-[13px]">Zonas detectadas</strong>
              <div className="text-[13px]" style={{ marginTop: 6 }}>
                {interpreted.zones.join(' · ')}
              </div>
            </div>
          )}

          <div className={styles.card} style={{ marginBottom: 16, maxHeight: 320, overflow: 'auto' }}>
            <strong className="text-[13px]">Equipos</strong>
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {interpreted.teams.map((t, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    className={styles.input}
                    value={t.name}
                    style={{ flex: '1 1 220px', minWidth: 0 }}
                    onChange={(e) => {
                      const teams = [...interpreted.teams];
                      teams[idx] = { ...teams[idx], name: e.target.value };
                      patch({ teams });
                    }}
                  />
                  {interpreted.zones.length > 0 && (
                    <select
                      className={styles.select}
                      value={t.zone ?? ''}
                      style={{ flex: '1 1 140px', minWidth: 0 }}
                      onChange={(e) => {
                        const teams = [...interpreted.teams];
                        teams[idx] = { ...teams[idx], zone: e.target.value || null };
                        patch({ teams });
                      }}
                    >
                      <option value="">Sin zona</option>
                      {interpreted.zones.map((z) => <option key={z} value={z}>{z}</option>)}
                    </select>
                  )}
                  <button
                    type="button"
                    className={styles.btnGhost}
                    style={{ flex: '0 0 auto' }}
                    onClick={() => patch({ teams: interpreted.teams.filter((_, i) => i !== idx) })}
                  >
                    Quitar
                  </button>
                </div>
              ))}
              {interpreted.teams.length === 0 && <span className="text-[12px]">Sin equipos detectados.</span>}
            </div>
          </div>

          {interpreted.matches.length > 0 && (
            <div className={styles.card} style={{ marginBottom: 16, maxHeight: 280, overflow: 'auto' }}>
              <strong className="text-[13px]">Fixture (muestra)</strong>

              <table className={`text-[12px] ${styles.fixtureTable}`} style={{ marginTop: 8 }}>
                <tbody>
                  {interpreted.matches.slice(0, 30).map((m, i) => (
                    <tr key={i}>
                      <td style={{ opacity: 0.7, paddingRight: 8 }}>{m.round || '-'}</td>
                      <td>{m.home}</td>
                      <td style={{ opacity: 0.6, padding: '0 6px' }}>vs</td>
                      <td>{m.away}</td>
                      <td style={{ opacity: 0.7, paddingLeft: 8 }}>{m.date || 's/fecha'} {m.zone || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className={styles.fixtureCards} style={{ marginTop: 8 }}>
                {interpreted.matches.slice(0, 30).map((m, i) => (
                  <div key={i} className={styles.fixtureMatch}>
                    {(m.round || m.zone) && (
                      <div className={styles.fixtureMatchHead}>
                        {[m.round, m.zone].filter(Boolean).join(' • ')}
                      </div>
                    )}
                    <div className={styles.fixtureMatchTeams}>
                      <span>{m.home}</span>
                      <span className={styles.fixtureVs}>vs</span>
                      <span>{m.away}</span>
                    </div>
                    <div className={styles.fixtureMatchMeta}>
                      {m.date || 's/fecha'}
                      {m.time ? ` · ${m.time}` : ''}
                      {m.venue ? ` · ${m.venue}` : ''}
                    </div>
                  </div>
                ))}
              </div>

              {interpreted.matches.length > 30 && (
                <span className="text-[12px]" style={{ opacity: 0.7, display: 'block', marginTop: 8 }}>
                  …y {interpreted.matches.length - 30} más
                </span>
              )}
            </div>
          )}

          {interpreted.playoffHints.length > 0 && (
            <div className={styles.card} style={{ marginBottom: 16 }}>
              <strong className="text-[13px]">Posibles cruces de playoff detectados</strong>
              <ul className="text-[12px]" style={{ marginTop: 6 }}>
                {interpreted.playoffHints.map((h, i) => <li key={i}>• {h}</li>)}
              </ul>
              <p className="text-[12px]" style={{ opacity: 0.7, marginTop: 6 }}>
                Configuralos luego en el Constructor de Playoff (Clasificación desde zonas).
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={styles.btnPrimary}
              style={{ flex: '2 1 220px', width: 'auto', marginTop: 0 }}
              onClick={commit}
              disabled={busy}
            >
              {busy ? 'Creando torneo…' : 'Confirmar y crear torneo'}
            </button>
            <button
              type="button"
              className={styles.btnGhost}
              style={{ flex: '1 1 160px' }}
              disabled={busy}
              onClick={() => { setInterpreted(null); setFileName(null); }}
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
