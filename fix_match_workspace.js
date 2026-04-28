const fs = require('fs');

const inputPath = 'src/app/club-admin/matches/[id]/ClubMatchWorkspace.tsx';
const originalPath = 'tmp_match_original.tsx';

// Read original (complete) file
let lines = fs.readFileSync(originalPath, 'utf-8').split('\n');

function findBlock(startPattern, endPattern, startOffset = 0) {
  let start = -1;
  let end = -1;
  for (let i = startOffset; i < lines.length; i++) {
    if (start === -1 && startPattern.test(lines[i])) {
      start = i;
    }
    if (start !== -1 && end === -1 && endPattern.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

// Collect ranges to remove (in reverse order to preserve indices)
const ranges = [];

// 1. Remove inline types block: from 'interface ClubInfo {' to just before 'const TABS:'
const r1 = findBlock(/^interface ClubInfo \{$/, /^const TABS:/, 0);
if (r1.start !== -1 && r1.end !== -1) {
  ranges.push({ start: r1.start, end: r1.end - 1 }); // keep the 'const TABS:' line
}

// 2. Remove MatchStats interface
const r2 = findBlock(/^interface MatchStats \{$/, /^\}$/, 0);
if (r2.start !== -1 && r2.end !== -1) {
  ranges.push(r2);
}

// 3. Remove PlayerEventStats interface
const r3 = findBlock(/^interface PlayerEventStats \{$/, /^\}$/, 0);
if (r3.start !== -1 && r3.end !== -1) {
  ranges.push(r3);
}

// 4. Remove ComparisonBarChart function
const r4 = findBlock(/^function ComparisonBarChart\(/, /^\}$/, 0);
if (r4.start !== -1 && r4.end !== -1) {
  ranges.push(r4);
}

// 5. Remove buildPostMatchStatGroups function
const r5 = findBlock(/^function buildPostMatchStatGroups\(/, /^\}$/, 0);
if (r5.start !== -1 && r5.end !== -1) {
  ranges.push(r5);
}

// 6. Remove MiniBarChart function
const r6 = findBlock(/^function MiniBarChart\(/, /^\}$/, 0);
if (r6.start !== -1 && r6.end !== -1) {
  ranges.push(r6);
}

// 7. Remove RadarChart function
const r7 = findBlock(/^function RadarChart\(/, /^\}$/, 0);
if (r7.start !== -1 && r7.end !== -1) {
  ranges.push(r7);
}

// Sort ranges by start descending so we can remove without shifting indices
ranges.sort((a, b) => b.start - a.start);

// Validate no overlaps
for (let i = 0; i < ranges.length - 1; i++) {
  if (ranges[i].end < ranges[i+1].start) {
    // ok
  } else {
    console.error('Overlap detected!', ranges[i], ranges[i+1]);
    process.exit(1);
  }
}

for (const r of ranges) {
  lines.splice(r.start, r.end - r.start + 1);
}

// Add imports after the existing imports block
const importBlock = `
import type {
  ClubInfo,
  TournamentInfo,
  MatchData,
  Division,
  SectionTab,
  AvailabilityStatus,
  MatchStatus,
  MatchEventTeam,
  LiveSubview,
  LivePhase,
  LiveActionType,
  ClubCallup,
  MatchLineupPlayer,
  ClubPostMatch,
  ClubMediaPlan,
  ClubStatsSummary,
  ClubWorkflow,
  ClubLiveControl,
  ClubLineupsState,
  ClubLiveEvent,
  MatchClockState,
  MatchDraftState,
  SaveFeedback,
  SaveUiState,
  LiveComposerState,
  MatchStats,
  PlayerEventStats,
} from './ClubMatchWorkspace.types';
import {
  ComparisonBarChart,
  MiniBarChart,
  RadarChart,
} from './ClubMatchWorkspace.charts';
import { buildPostMatchStatGroups } from './ClubMatchWorkspace.utils';
`;

// Find the last import line
let lastImportIndex = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('import ')) {
    lastImportIndex = i;
  }
}
lines.splice(lastImportIndex + 1, 0, importBlock.trim());

fs.writeFileSync(inputPath, lines.join('\n'), 'utf-8');
console.log('Done. Total lines:', lines.length);
