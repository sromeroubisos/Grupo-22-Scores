import {
    getFlashScoreMatchDetails,
    getFlashScoreMatchesRaw,
    getTournamentDetails,
    getTournamentIds,
    getTournamentResults,
    getTournamentFixtures,
    getTournamentStandings,
    getTournamentTopScorers,
    getTournamentStandingsForm,
    getTournamentStandingsHtFt,
    getTournamentStandingsOverUnder,
    getTournamentDraw,
    getTournamentArchives
} from '@/lib/services/flashscore';
import { db } from '@/lib/mock-db';
import { persistFromTournamentPayload } from '@/lib/sync/catalog';
import { getTabSnapshot, hasMeaningfulPayload, upsertTabSnapshot } from '@/lib/sync/tabSnapshots';

function normalizeId(val: any): string | undefined {
    if (val === null || val === undefined) return undefined;
    const str = String(val).trim();
    return str ? str : undefined;
}

function stripFsPrefix(val?: string): string | undefined {
    if (!val) return val;
    return val.toLowerCase().startsWith('fs-') ? val.slice(3) : val;
}

function normalizeTournamentUrl(raw?: string): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            const parsed = new URL(trimmed);
            return parsed.pathname || trimmed;
        } catch {
            return trimmed;
        }
    }
    return trimmed;
}

function findFirstByKeys(obj: any, keys: string[], visited = new Set<any>()): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    if (visited.has(obj)) return undefined;
    visited.add(obj);
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const val = normalizeId((obj as any)[key]);
            if (val) return val;
        }
    }
    for (const value of Object.values(obj)) {
        const found = findFirstByKeys(value, keys, visited);
        if (found) return found;
    }
    return undefined;
}

function extractIds(data: any) {
    const d = data || {};
    return {
        tournamentId:
            normalizeId(d.tournament_id) ||
            normalizeId(d.tournamentId) ||
            normalizeId(d.tournament?.tournament_id) ||
            normalizeId(d.tournament?.id) ||
            findFirstByKeys(d, ['tournament_id', 'tournamentId', 'league_id', 'leagueId']),
        seasonId:
            normalizeId(d.season_id) ||
            normalizeId(d.seasonId) ||
            normalizeId(d.season?.id) ||
            normalizeId(d.season?.season_id) ||
            findFirstByKeys(d, ['season_id', 'seasonId']),
        templateId:
            normalizeId(d.tournament_template_id) ||
            normalizeId(d.template_id) ||
            normalizeId(d.templateId) ||
            normalizeId(d.tournament_template?.id) ||
            findFirstByKeys(d, ['tournament_template_id', 'template_id', 'templateId']),
        stageId:
            normalizeId(d.tournament_stage_id) ||
            normalizeId(d.stage_id) ||
            normalizeId(d.stageId) ||
            normalizeId(d.stage?.id) ||
            normalizeId(d.tournamentStageId) ||
            findFirstByKeys(d, ['tournament_stage_id', 'tournamentStageId', 'stage_id', 'stageId']),
        drawStageId:
            normalizeId(d.draw_stage_id) ||
            normalizeId(d.drawStageId) ||
            (Array.isArray(d.draw_stages) && d.draw_stages.length > 0 ? (
                typeof d.draw_stages[0] === 'object'
                    ? (normalizeId(d.draw_stages[0].draw_stage_id) || normalizeId(d.draw_stages[0].stage_id))
                    : normalizeId(d.draw_stages[0])
            ) : undefined) ||
            findFirstByKeys(d, ['draw_stage_id', 'drawStageId'])
    };
}

function extractUrl(data: any) {
    const raw =
        data?.url ||
        data?.tournament_url ||
        data?.tournament?.url ||
        data?.tournament?.tournament_url ||
        data?.tournament?.link;
    const cleaned = typeof raw === 'string' ? normalizeTournamentUrl(raw) : undefined;
    return cleaned && cleaned.trim().length > 0 ? cleaned : undefined;
}

type ResolvedIds = {
    tournamentId?: string;
    stageId?: string;
    templateId?: string;
    seasonId?: string;
    tournamentUrl?: string;
};

function mergeResolvedIds(base: ResolvedIds, next: ResolvedIds): ResolvedIds {
    return {
        tournamentId: base.tournamentId || next.tournamentId,
        stageId: base.stageId || next.stageId,
        templateId: base.templateId || next.templateId,
        seasonId: base.seasonId || next.seasonId,
        tournamentUrl: base.tournamentUrl || next.tournamentUrl
    };
}

function normalizeDetails(raw: any) {
    const data = raw?.DATA || raw;
    if (!data) return null;
    if (Array.isArray(data)) return data.length > 0 ? data : null;
    if (typeof data === 'object' && Object.keys(data).length === 0) return null;
    return data;
}

async function resolveIdsFromTournamentId(tournamentId: string, sportId: string = 'football'): Promise<ResolvedIds> {
    const offsets = [0, -1, 1, -2, 2, -3, 3, -5, 5, -7, 7];
    let resolved: ResolvedIds = { tournamentId };

    console.log(`Resolving IDs for tournamentId: ${tournamentId} (Sport: ${sportId})`);

    for (const offset of offsets) {
        try {
            const raw = await getFlashScoreMatchesRaw(offset, sportId);
            const tournaments = Array.isArray(raw) ? raw : (raw?.DATA || raw?.data || []);

            // Try to find by tournament_id match OR tournament_stage_id match
            const matchTournament = tournaments.find((t: any) => {
                const tId = String(t?.tournament_id || '').trim();
                const sId = String(t?.tournament_stage_id || '').trim();
                return tId === tournamentId || sId === tournamentId;
            });

            if (!matchTournament) continue;

            console.log(`Found tournament match on offset ${offset}:`, matchTournament.tournament_id);

            const extracted = extractIds(matchTournament);
            const urlFromTournament = extractUrl(matchTournament);
            resolved = mergeResolvedIds(resolved, {
                tournamentId: extracted.tournamentId || tournamentId,
                stageId: extracted.stageId,
                templateId: extracted.templateId,
                seasonId: extracted.seasonId,
                tournamentUrl: urlFromTournament
            });

            if (resolved.stageId && resolved.templateId && resolved.seasonId) {
                return resolved;
            }

            const match = Array.isArray(matchTournament.matches) ? matchTournament.matches[0] : null;
            const matchId = match?.match_id || match?.event_key || match?.id;
            if (!matchId) continue;

            // Fetch match details to get deeper IDs
            const matchDetailsRes = await getFlashScoreMatchDetails(String(matchId));
            const matchDetails = normalizeDetails(matchDetailsRes);

            if (matchDetails) {
                const extractedFromMatch = extractIds(matchDetails);
                const urlFromMatch = extractUrl(matchDetails);

                resolved = mergeResolvedIds(resolved, {
                    tournamentId: extractedFromMatch.tournamentId || tournamentId,
                    stageId: extractedFromMatch.stageId,
                    templateId: extractedFromMatch.templateId,
                    seasonId: extractedFromMatch.seasonId,
                    tournamentUrl: urlFromMatch
                });
            }

            if (resolved.stageId && resolved.templateId && resolved.seasonId) {
                return resolved;
            }
        } catch (err) {
            console.error('Error in resolveIds loop:', err);
        }
    }

    return resolved;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id') || '';
    let url = searchParams.get('url') || '';
    const sport = searchParams.get('sport') || searchParams.get('sportId') || 'football';

    let tournamentId = searchParams.get('tournament_id') || searchParams.get('tournamentId') || undefined;
    let stageId = searchParams.get('tournament_stage_id') || searchParams.get('tournamentStageId') || searchParams.get('stageId') || undefined;
    let templateId = searchParams.get('tournament_template_id') || searchParams.get('templateId') || undefined;
    let seasonId = searchParams.get('season_id') || searchParams.get('seasonId') || undefined;
    let drawStageId = searchParams.get('draw_stage_id') || searchParams.get('drawStageId') || undefined;

    tournamentId = stripFsPrefix(tournamentId);
    stageId = stripFsPrefix(stageId);
    drawStageId = stripFsPrefix(drawStageId);

    console.log('TOURNAMENT API GET:', { id, url, sport, tournamentId, stageId, templateId, seasonId, drawStageId });

    const hasFsPrefix = id.toLowerCase().startsWith('fs-');
    const rawId = hasFsPrefix ? id.slice(3) : id;
    console.log('ID Parsing:', { hasFsPrefix, rawId });

    if (hasFsPrefix && rawId) {
        tournamentId = tournamentId || rawId;
    }

    let details: any = null;

    try {
        if (hasFsPrefix && rawId && !stageId) {
            console.log('Attempting details with rawId as stageId:', rawId);
            const detailsAttemptRes = await getTournamentDetails(rawId);
            const detailsAttempt = normalizeDetails(detailsAttemptRes);
            console.log('Details attempt result:', detailsAttempt ? 'Found' : 'Not found');
            if (detailsAttempt) {
                const extracted = extractIds(detailsAttempt);
                const detailsUrl = extractUrl(detailsAttempt);
                if (extracted.stageId || extracted.tournamentId || detailsUrl) {
                    details = detailsAttempt;
                    tournamentId = extracted.tournamentId || tournamentId;
                    seasonId = extracted.seasonId || seasonId;
                    templateId = extracted.templateId || templateId;
                    stageId = extracted.stageId || stageId || rawId;
                    drawStageId = extracted.drawStageId || drawStageId;
                    if (detailsUrl) {
                        url = url || detailsUrl;
                    }
                }
            }
        }

        if (stageId && !details) {
            const detailsRes = await getTournamentDetails(stageId);
            details = normalizeDetails(detailsRes);

            if (details) {
                const extracted = extractIds(details);
                tournamentId = extracted.tournamentId || tournamentId;
                seasonId = extracted.seasonId || seasonId;
                templateId = extracted.templateId || templateId;
                stageId = extracted.stageId || stageId;
                drawStageId = extracted.drawStageId || drawStageId;

                const detailsUrl = extractUrl(details);
                if (detailsUrl) {
                    const idsRes = await getTournamentIds(detailsUrl);
                    const idsData = idsRes?.DATA || idsRes;
                    if (Array.isArray(idsData) && idsData.length > 0) {
                        const first = idsData[0];
                        tournamentId = first.tournament_id || tournamentId;
                        seasonId = first.season_id || seasonId;
                        templateId = first.tournament_template_id || templateId;
                        stageId = first.tournament_stage_id || stageId;
                        drawStageId = extractIds(first).drawStageId || drawStageId;
                    } else if (idsData && typeof idsData === 'object') {
                        tournamentId = idsData.tournament_id || tournamentId;
                        seasonId = idsData.season_id || seasonId;
                        templateId = idsData.tournament_template_id || templateId;
                        stageId = idsData.tournament_stage_id || stageId;
                        drawStageId = extractIds(idsData).drawStageId || drawStageId;
                    }
                }
            }
        }

        if (tournamentId && (!stageId || !templateId || !seasonId || !url)) {
            const resolved = await resolveIdsFromTournamentId(tournamentId, sport);
            tournamentId = resolved.tournamentId || tournamentId;
            seasonId = resolved.seasonId || seasonId;
            templateId = resolved.templateId || templateId;
            stageId = resolved.stageId || stageId;
            if (resolved.tournamentUrl) {
                url = url || resolved.tournamentUrl;
            }
        }

        if (url && (!templateId || !seasonId || !stageId || !tournamentId)) {
            const idsRes = await getTournamentIds(url);
            const idsData = idsRes?.DATA || idsRes;
            if (Array.isArray(idsData) && idsData.length > 0) {
                const first = idsData[0];
                tournamentId = first.tournament_id || tournamentId;
                seasonId = first.season_id || seasonId;
                templateId = first.tournament_template_id || templateId;
                stageId = first.tournament_stage_id || stageId;
                drawStageId = extractIds(first).drawStageId || drawStageId;
            } else if (idsData && typeof idsData === 'object') {
                tournamentId = idsData.tournament_id || tournamentId;
                seasonId = idsData.season_id || seasonId;
                templateId = idsData.tournament_template_id || templateId;
                stageId = idsData.tournament_stage_id || stageId;
                drawStageId = extractIds(idsData).drawStageId || drawStageId;
            }
        }

        tournamentId = stripFsPrefix(tournamentId);
        stageId = stripFsPrefix(stageId);

        const canFetchMatches = !!(templateId && seasonId);
        const canFetchStandings = !!(tournamentId && stageId);
        const canFetchDraw = !!(tournamentId && drawStageId);
        const canFetchArchives = !!stageId;
        const detailsPromise = stageId && !details ? getTournamentDetails(stageId) : Promise.resolve(details);

        const snapshotEntityId = tournamentId || stageId || id || url || 'unknown';
        const snapshotKey = { entityType: 'tournament' as const, entityId: snapshotEntityId };
        const tabSources: Record<string, 'api' | 'snapshot' | 'empty'> = {};

        const resolveTab = (tab: string, payload: any, fetchOk: boolean) => {
            const snapshot = getTabSnapshot({ ...snapshotKey, tab });
            const hasData = hasMeaningfulPayload(payload);

            if (!fetchOk || (!hasData && snapshot)) {
                tabSources[tab] = snapshot ? 'snapshot' : 'empty';
                return snapshot?.payload ?? (Array.isArray(payload) ? [] : payload ?? null);
            }

            if (hasData) {
                upsertTabSnapshot({ ...snapshotKey, tab, payload, fetchStatus: 'ok' });
                tabSources[tab] = 'api';
                return payload;
            }

            tabSources[tab] = 'empty';
            return Array.isArray(payload) ? [] : payload ?? null;
        };

        const settled = await Promise.allSettled([
            canFetchMatches ? getTournamentResults(templateId!, seasonId!) : Promise.resolve([]),
            canFetchMatches ? getTournamentFixtures(templateId!, seasonId!) : Promise.resolve([]),
            canFetchStandings ? getTournamentStandings(tournamentId!, stageId!) : Promise.resolve([]),
            canFetchStandings ? getTournamentTopScorers(tournamentId!, stageId!) : Promise.resolve([]),
            canFetchStandings ? getTournamentStandingsForm(tournamentId!, stageId!) : Promise.resolve([]),
            canFetchStandings ? getTournamentStandingsHtFt(tournamentId!, stageId!) : Promise.resolve([]),
            canFetchStandings ? getTournamentStandingsOverUnder(tournamentId!, stageId!) : Promise.resolve([]),
            detailsPromise,
            canFetchDraw ? getTournamentDraw(tournamentId!, drawStageId!) : Promise.resolve([]),
            canFetchArchives ? getTournamentArchives(stageId!) : Promise.resolve([])
        ]);

        const resultsRes = settled[0].status === 'fulfilled' ? settled[0].value : null;
        const fixturesRes = settled[1].status === 'fulfilled' ? settled[1].value : null;
        const standingsRes = settled[2].status === 'fulfilled' ? settled[2].value : null;
        const topScorersRes = settled[3].status === 'fulfilled' ? settled[3].value : null;
        const standingsFormRes = settled[4].status === 'fulfilled' ? settled[4].value : null;
        const standingsHtFtRes = settled[5].status === 'fulfilled' ? settled[5].value : null;
        const standingsOverUnderRes = settled[6].status === 'fulfilled' ? settled[6].value : null;
        const detailsRes = settled[7].status === 'fulfilled' ? settled[7].value : null;
        const drawRes = settled[8].status === 'fulfilled' ? settled[8].value : null;
        const archivesRes = settled[9].status === 'fulfilled' ? settled[9].value : null;

        const resultsFetchOk = canFetchMatches && settled[0].status === 'fulfilled';
        const fixturesFetchOk = canFetchMatches && settled[1].status === 'fulfilled';
        const standingsFetchOk = canFetchStandings && settled[2].status === 'fulfilled';
        const topScorersFetchOk = canFetchStandings && settled[3].status === 'fulfilled';
        const standingsFormFetchOk = canFetchStandings && settled[4].status === 'fulfilled';
        const standingsHtFtFetchOk = canFetchStandings && settled[5].status === 'fulfilled';
        const standingsOverUnderFetchOk = canFetchStandings && settled[6].status === 'fulfilled';
        const detailsFetchOk = settled[7].status === 'fulfilled';
        const drawFetchOk = canFetchDraw && settled[8].status === 'fulfilled';
        const archivesFetchOk = canFetchArchives && settled[9].status === 'fulfilled';

        const detailsPayload = resolveTab('details', normalizeDetails(detailsRes) || details, detailsFetchOk);
        const resultsPayload = resolveTab('results', resultsRes?.DATA || resultsRes || [], resultsFetchOk);
        const fixturesPayload = resolveTab('fixtures', fixturesRes?.DATA || fixturesRes || [], fixturesFetchOk);
        const standingsFormPayload = resolveTab('standingsForm', standingsFormRes?.DATA || standingsFormRes || [], standingsFormFetchOk);
        const standingsHtFtPayload = resolveTab('standingsHtFt', standingsHtFtRes?.DATA || standingsHtFtRes || [], standingsHtFtFetchOk);
        const standingsOverUnderPayload = resolveTab('standingsOverUnder', standingsOverUnderRes?.DATA || standingsOverUnderRes || [], standingsOverUnderFetchOk);
        const topScorersPayload = resolveTab('topScorers', topScorersRes?.DATA || topScorersRes || [], topScorersFetchOk);
        const drawPayload = resolveTab('draw', drawRes?.DATA || drawRes || [], drawFetchOk);
        const archivesPayload = resolveTab('archives', archivesRes?.DATA || archivesRes || [], archivesFetchOk);

        const standingsSnapshot = getTabSnapshot({ ...snapshotKey, tab: 'standings' });
        const rawStandings = standingsFetchOk ? (standingsRes?.DATA || standingsRes || []) : null;
        let standingsSource: 'api' | 'snapshot' | 'empty' = 'empty';

        if (!standingsFetchOk || (!hasMeaningfulPayload(rawStandings) && standingsSnapshot)) {
            standingsSource = standingsSnapshot ? 'snapshot' : 'empty';
        } else {
            standingsSource = 'api';
        }

        let finalStandings = standingsSource === 'snapshot' ? (standingsSnapshot?.payload || []) : (rawStandings || []);

        console.log('FINAL RESOLVED:', {
            tournamentId, stageId, templateId, seasonId,
            hasDetails: !!detailsPayload,
            results: resultsPayload?.length || 0,
            standings: Array.isArray(finalStandings) ? finalStandings.length : 0
        });

        // --- Custom Re-grouping Logic ---
        const customConfigs = db.phaseConfigurations[id];

        if (customConfigs && customConfigs.length > 0) {
            const activePhase = customConfigs.find(p => p.status === 'published') || customConfigs[0];
            if ((activePhase.phaseType === 'groups' || activePhase.phaseType === 'league') && activePhase.groupAssignments) {
                const assignments = activePhase.groupAssignments;
                const groups: Record<number, any[]> = {};

                // Flatten all rows if they were already grouped, or just use them
                let allRows: any[] = [];
                if (finalStandings[0]?.rows) {
                    finalStandings.forEach((g: any) => allRows.push(...(g.rows || [])));
                } else {
                    allRows = finalStandings;
                }

                allRows.forEach(row => {
                    const team = row.team || row.participant || row;
                    const teamId = team.id || team.team_id || team.participant_id || team.name;
                    const groupIdx = assignments[teamId] ?? 0;

                    if (!groups[groupIdx]) groups[groupIdx] = [];
                    groups[groupIdx].push(row);
                });

                // Convert to FlashScore-like grouped format
                finalStandings = Object.keys(groups).sort().map(key => {
                    const idx = parseInt(key);
                    return {
                        group_name: `Grupo ${String.fromCharCode(65 + idx)}`,
                        rows: groups[idx].sort((a, b) => (a.position || 0) - (b.position || 0))
                    };
                });
            }
        }

        if (standingsSource === 'api' && hasMeaningfulPayload(finalStandings)) {
            upsertTabSnapshot({ ...snapshotKey, tab: 'standings', payload: finalStandings, fetchStatus: 'ok' });
            tabSources.standings = 'api';
        } else if (standingsSource === 'snapshot') {
            tabSources.standings = 'snapshot';
        } else {
            tabSources.standings = 'empty';
        }

        try {
            persistFromTournamentPayload({
                ids: { tournamentId, seasonId },
                sport,
                details: detailsPayload,
                standings: finalStandings,
                fixtures: fixturesPayload,
                results: resultsPayload,
                topScorers: topScorersPayload
            });
        } catch (persistError) {
            console.warn('Catalog persist failed:', persistError);
        }

        return Response.json({
            ok: true,
            _debug: {
                query: { id, url, sport, tournamentId, stageId, templateId, seasonId },
                resolvedIds: { tournamentId, stageId, templateId, seasonId },
                counts: {
                    results: Array.isArray(resultsPayload) ? resultsPayload.length : 0,
                    fixtures: Array.isArray(fixturesPayload) ? fixturesPayload.length : 0,
                    standings: Array.isArray(finalStandings) ? finalStandings.length : 0,
                    topScorers: Array.isArray(topScorersPayload) ? topScorersPayload.length : 0
                }
            },
            _cache: {
                entityId: snapshotEntityId,
                tabSources
            },
            ids: { tournamentId, stageId, templateId, seasonId, drawStageId },
            details: detailsPayload,
            results: resultsPayload,
            fixtures: fixturesPayload,
            standings: finalStandings,
            standingsForm: standingsFormPayload,
            standingsHtFt: standingsHtFtPayload,
            standingsOverUnder: standingsOverUnderPayload,
            topScorers: topScorersPayload,
            draw: drawPayload,
            archives: archivesPayload
        });
    } catch (e: any) {
        console.error('Tournament API error', e);
        try {
            const fallbackEntityId = tournamentId || stageId || id || url || 'unknown';
            const fallbackKey = { entityType: 'tournament' as const, entityId: fallbackEntityId };
            const fallbackTabs = [
                'details',
                'results',
                'fixtures',
                'standings',
                'standingsForm',
                'standingsHtFt',
                'standingsOverUnder',
                'topScorers',
                'draw',
                'archives'
            ];
            const fallbackSources: Record<string, 'snapshot' | 'empty'> = {};

            const readFallback = (tab: string, emptyValue: any) => {
                const snap = getTabSnapshot({ ...fallbackKey, tab });
                if (snap) {
                    fallbackSources[tab] = 'snapshot';
                    return snap.payload;
                }
                fallbackSources[tab] = 'empty';
                return emptyValue;
            };

            const fallbackDetails = readFallback('details', null);
            const fallbackResults = readFallback('results', []);
            const fallbackFixtures = readFallback('fixtures', []);
            const fallbackStandings = readFallback('standings', []);
            const fallbackStandingsForm = readFallback('standingsForm', []);
            const fallbackStandingsHtFt = readFallback('standingsHtFt', []);
            const fallbackStandingsOverUnder = readFallback('standingsOverUnder', []);
            const fallbackTopScorers = readFallback('topScorers', []);
            const fallbackDraw = readFallback('draw', []);
            const fallbackArchives = readFallback('archives', []);

            const hasAnySnapshot = Object.values(fallbackSources).some((v) => v === 'snapshot');
            if (hasAnySnapshot) {
                return Response.json({
                    ok: true,
                    _cache: {
                        entityId: fallbackEntityId,
                        tabSources: fallbackSources,
                        fallback: true
                    },
                    ids: { tournamentId, stageId, templateId, seasonId, drawStageId },
                    details: fallbackDetails,
                    results: fallbackResults,
                    fixtures: fallbackFixtures,
                    standings: fallbackStandings,
                    standingsForm: fallbackStandingsForm,
                    standingsHtFt: fallbackStandingsHtFt,
                    standingsOverUnder: fallbackStandingsOverUnder,
                    topScorers: fallbackTopScorers,
                    draw: fallbackDraw,
                    archives: fallbackArchives
                });
            }
        } catch (fallbackError) {
            console.error('Tournament fallback error', fallbackError);
        }
        return Response.json(
            { ok: false, error: 'Failed to load tournament data', details: e.message || String(e) },
            { status: 500 }
        );
    }
}
