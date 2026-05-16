'use client';

import React from 'react';

interface BoardMatch {
  id: string;
  code: string | null;
  status: string;
  scoreHome: number;
  scoreAway: number;
  homeClubId: string | null;
  awayClubId: string | null;
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  winnerClubId: string | null;
}

interface BoardRound {
  roundId: string;
  name: string;
  orderIndex: number;
  matches: BoardMatch[];
}

interface BoardCup {
  groupId: string | null;
  name: string;
  orderIndex: number;
  rounds: BoardRound[];
}

export interface PlayoffBracketBoardData {
  hasBracket: boolean;
  cups: BoardCup[];
}

const CUP_ACCENTS: Record<number, string> = {
  0: '#f5c542', // oro
  1: '#c0c5ce', // plata
  2: '#c8803c', // bronce
  3: '#7fb3d5', // estímulo
};

function statusLabel(status: string): string {
  switch (status) {
    case 'final':
      return 'Final';
    case 'live':
      return 'En vivo';
    case 'postponed':
      return 'Pospuesto';
    case 'suspended':
      return 'Suspendido';
    case 'cancelled':
      return 'Cancelado';
    default:
      return 'Programado';
  }
}

function Slot({
  name,
  logo,
  score,
  isWinner,
  isPlaceholder,
  played,
}: {
  name: string;
  logo: string | null;
  score: number;
  isWinner: boolean;
  isPlaceholder: boolean;
  played: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 px-2.5 py-1.5"
      style={{
        background: isWinner ? 'var(--status-active, #2ecc71)11' : 'transparent',
        opacity: isPlaceholder ? 0.6 : 1,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
        ) : (
          <span
            className="w-5 h-5 rounded-full flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          />
        )}
        <span
          className={`truncate text-xs ${isWinner ? 'font-bold text-white' : 'text-white/80'} ${isPlaceholder ? 'italic' : ''}`}
          title={name}
        >
          {name}
        </span>
      </div>
      <span className={`text-xs tabular-nums ${isWinner ? 'font-bold text-white' : 'text-white/60'}`}>
        {played ? score : '–'}
      </span>
    </div>
  );
}

function MatchCard({ match }: { match: BoardMatch }) {
  const played = match.status === 'final' || match.status === 'live';
  const homePlaceholder = !match.homeClubId;
  const awayPlaceholder = !match.awayClubId;
  return (
    <div
      className="rounded-lg border border-[var(--border-basalt)] bg-[var(--surface-basalt)] overflow-hidden"
      style={{ minWidth: 220 }}
    >
      <div className="flex items-center justify-between px-2.5 py-1 text-[10px] uppercase tracking-wider text-dim border-b border-[var(--border-basalt)]">
        <span>{match.code || '—'}</span>
        <span>{statusLabel(match.status)}</span>
      </div>
      <Slot
        name={match.homeName}
        logo={match.homeLogo}
        score={match.scoreHome}
        isWinner={!!match.winnerClubId && match.winnerClubId === match.homeClubId}
        isPlaceholder={homePlaceholder}
        played={played}
      />
      <div className="border-t border-[var(--border-basalt)]/60" />
      <Slot
        name={match.awayName}
        logo={match.awayLogo}
        score={match.scoreAway}
        isWinner={!!match.winnerClubId && match.winnerClubId === match.awayClubId}
        isPlaceholder={awayPlaceholder}
        played={played}
      />
    </div>
  );
}

export default function PlayoffBracketBoard({ data }: { data: PlayoffBracketBoardData }) {
  if (!data || !data.hasBracket || data.cups.length === 0) {
    return (
      <div className="border border-white/10 bg-[#131922] py-6 text-center text-sm text-white/65">
        Todavía no se generó el cuadro. Configurá una plantilla y presioná “Generar bracket”.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {data.cups.map((cup) => {
        const accent =
          cup.groupId == null ? '#8e9aa7' : CUP_ACCENTS[cup.orderIndex] ?? '#8e9aa7';
        return (
          <div key={cup.groupId ?? 'qualifier'} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: accent }}
                aria-hidden
              />
              <h4 className="text-sm font-bold text-white tracking-tight">{cup.name}</h4>
            </div>
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-4 items-start">
                {cup.rounds.map((round) => (
                  <div key={round.roundId} className="flex flex-col gap-2 flex-shrink-0">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-dim">
                      {round.name}
                    </span>
                    <div className="flex flex-col gap-3">
                      {round.matches.map((m) => (
                        <MatchCard key={m.id} match={m} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
