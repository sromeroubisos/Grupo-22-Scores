type SheetRows = Record<string, string>[];

export type RankingExpectedField = {
    key: string;
    label: string;
    aliases: readonly string[];
};

export type RankingCatalogClubSource = {
    id: string;
    name: string;
    short_name?: string | null;
    shortName?: string | null;
    logo_url?: string | null;
    logoUrl?: string | null;
    aliases?: string[] | null;
    sport?: string | null;
};

export type RankingCatalogClub = {
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    sport: string | null;
    aliases: string[];
    normalizedName: string;
    normalizedAliases: string[];
};

export type RankingClubMatch = {
    sourceValue: string;
    normalizedValue: string;
    matchedClubId: string | null;
    matchedClubName: string | null;
    matchedClubShortName: string | null;
    matchedClubLogoUrl: string | null;
    confidence: 'alta' | 'media' | 'baja' | 'sin_match';
    matchType: 'exact' | 'alias' | 'contains' | 'fuzzy' | 'manual' | 'unresolved';
    score: number;
    ambiguous: boolean;
    alternatives: Array<{ id: string; name: string }>;
};

export type RankingColumnAnalysis = {
    header: string;
    normalizedHeader: string;
    fillCount: number;
    emptyCount: number;
    fillRate: number;
    uniqueCount: number;
    sampleValues: string[];
    dataType: 'texto' | 'numero' | 'booleano' | 'mixto' | 'vacio';
    expectedFieldKey: string | null;
    expectedFieldLabel: string | null;
    matchedHeaderAlias: boolean;
    clubMatchCount: number;
    clubMatchRate: number;
    averageClubScore: number;
};

export type RankingSheetAnalysis = {
    columns: RankingColumnAnalysis[];
    suggestedClubHeader: string | null;
    suggestedFieldHeaders: Record<string, string | null>;
    matchMapsByHeader: Record<string, Record<string, RankingClubMatch>>;
};

export type RankingRowClubAnalysis = {
    rowIndex: number;
    sourceValue: string;
    match: RankingClubMatch | null;
};

export type RankingRowClubSummary = {
    rows: RankingRowClubAnalysis[];
    totalRows: number;
    rowsWithValue: number;
    matchedRows: number;
    unresolvedRows: number;
    ambiguousRows: number;
    uniqueClubMatches: number;
    matchCoverage: number;
};

const GENERIC_CLUB_TOKENS = new Set([
    'club',
    'rc',
    'rugby',
    'athletic',
    'atletico',
    'deportivo',
    'deportiva',
    'association',
    'asociacion',
    'asociacion',
]);

const CONNECTOR_TOKENS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'the', 'y']);

function readText(value: unknown) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\u00a0/g, ' ').trim();
}

export function normalizeHeaderKey(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function normalizeNameKey(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\./g, '')
        .trim()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildReducedAlias(value: string) {
    const normalized = normalizeNameKey(value);
    if (!normalized) return null;
    const tokens = normalized.split(' ').filter(Boolean);
    const reduced = tokens.filter((token) => !GENERIC_CLUB_TOKENS.has(token));
    if (!reduced.length || reduced.length === tokens.length) return null;
    return reduced.join(' ');
}

function buildAcronymAlias(value: string) {
    const normalized = normalizeNameKey(value);
    if (!normalized) return null;
    const tokens = normalized
        .split(' ')
        .filter(Boolean)
        .filter((token) => !CONNECTOR_TOKENS.has(token));
    if (tokens.length < 2) return null;
    const acronym = tokens.map((token) => token[0]).join('');
    return acronym.length >= 2 ? acronym : null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.map((value) => readText(value)).filter(Boolean)));
}

function inferColumnDataType(values: string[]): RankingColumnAnalysis['dataType'] {
    const nonEmpty = values.filter(Boolean);
    if (nonEmpty.length === 0) return 'vacio';

    const numericCount = nonEmpty.filter((value) => /^-?\d+(?:[.,]\d+)?$/.test(value.replace(/\s+/g, ''))).length;
    const booleanCount = nonEmpty.filter((value) => {
        const normalized = value.toLowerCase();
        return ['si', 'no', 'true', 'false', '1', '0', 'x'].includes(normalized);
    }).length;

    if (numericCount === nonEmpty.length) return 'numero';
    if (booleanCount === nonEmpty.length) return 'booleano';
    if (numericCount / nonEmpty.length >= 0.8) return 'numero';
    if (booleanCount / nonEmpty.length >= 0.8) return 'booleano';
    if (numericCount === 0 && booleanCount === 0) return 'texto';
    return 'mixto';
}

function bigramSimilarity(left: string, right: string) {
    if (left === right) return 1;
    if (!left || !right) return 0;
    if (left.length < 2 || right.length < 2) {
        return left === right ? 1 : 0;
    }

    const pairs = (value: string) =>
        Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2));

    const leftPairs = pairs(left);
    const rightPairs = pairs(right);
    const bag = new Map<string, number>();
    rightPairs.forEach((pair) => bag.set(pair, (bag.get(pair) || 0) + 1));
    let overlap = 0;
    leftPairs.forEach((pair) => {
        const count = bag.get(pair) || 0;
        if (count > 0) {
            overlap += 1;
            bag.set(pair, count - 1);
        }
    });

    return leftPairs.length + rightPairs.length === 0
        ? 0
        : (2 * overlap) / (leftPairs.length + rightPairs.length);
}

function containmentScore(left: string, right: string) {
    if (!left || !right) return 0;

    const shorter = left.length <= right.length ? left : right;
    const longer = left.length <= right.length ? right : left;

    if (shorter.length < 4) return 0;

    const paddedLonger = ` ${longer} `;
    const paddedShorter = ` ${shorter} `;
    if (!paddedLonger.includes(paddedShorter)) return 0;

    const coverage = shorter.length / longer.length;
    return Math.max(0.88, Math.min(0.97, 0.82 + coverage * 0.2));
}

function tokenOverlapScore(left: string, right: string) {
    if (!left || !right) return 0;

    const leftTokens = left.split(' ').filter(Boolean);
    const rightTokens = right.split(' ').filter(Boolean);
    if (!leftTokens.length || !rightTokens.length) return 0;

    const [smaller, larger] = leftTokens.length <= rightTokens.length
        ? [leftTokens, rightTokens]
        : [rightTokens, leftTokens];

    const largerSet = new Set(larger);
    const overlap = smaller.filter((token) => largerSet.has(token)).length;
    if (overlap === 0) return 0;

    const smallerRatio = overlap / smaller.length;
    const largerRatio = overlap / larger.length;

    if (smallerRatio === 1) {
        return Math.max(0.82, Math.min(0.96, 0.76 + largerRatio * 0.2));
    }

    return (smallerRatio + largerRatio) / 2;
}

function computeVariationScore(source: string, target: string) {
    if (source === target) {
        return { score: 1, matchType: 'exact' as const };
    }

    const bigram = bigramSimilarity(source, target);
    const contains = containmentScore(source, target);
    const tokenScore = tokenOverlapScore(source, target);
    const score = Math.max(bigram, contains, tokenScore);

    return {
        score,
        matchType: contains >= bigram && contains >= tokenScore && contains >= 0.82
            ? ('contains' as const)
            : ('fuzzy' as const),
    };
}

export function buildCatalogClubs(rows: RankingCatalogClubSource[]) {
    return rows
        .map((row) => {
            const name = readText(row.name) || row.id;
            const shortName = readText(row.shortName ?? row.short_name) || null;
            const logoUrl = readText(row.logoUrl ?? row.logo_url) || null;
            const aliases = uniqueStrings([
                name,
                shortName,
                ...(Array.isArray(row.aliases) ? row.aliases : []),
                buildReducedAlias(name),
                shortName ? buildReducedAlias(shortName) : null,
                buildAcronymAlias(name),
                shortName ? buildAcronymAlias(shortName) : null,
            ]);
            const normalizedAliases = uniqueStrings(aliases.map((alias) => normalizeNameKey(alias)));

            return {
                id: row.id,
                name,
                shortName,
                logoUrl,
                sport: readText(row.sport) || null,
                aliases,
                normalizedName: normalizeNameKey(name),
                normalizedAliases,
            } satisfies RankingCatalogClub;
        })
        .sort((left, right) => left.name.localeCompare(right.name, 'es'));
}

function matchClubByName(sourceValue: string, clubs: RankingCatalogClub[]): RankingClubMatch {
    const normalizedValue = normalizeNameKey(sourceValue);
    if (!normalizedValue) {
        return {
            sourceValue,
            normalizedValue,
            matchedClubId: null,
            matchedClubName: null,
            matchedClubShortName: null,
            matchedClubLogoUrl: null,
            confidence: 'sin_match',
            matchType: 'unresolved',
            score: 0,
            ambiguous: false,
            alternatives: [],
        };
    }

    const ranked = clubs
        .map((club) => {
            const exact = club.normalizedName === normalizedValue;
            const aliasExact = club.normalizedAliases.includes(normalizedValue);

            if (exact || aliasExact) {
                return {
                    club,
                    score: 1,
                    matchType: exact ? ('exact' as const) : ('alias' as const),
                };
            }

            const variations = Array.from(new Set([club.normalizedName, ...club.normalizedAliases])).filter(Boolean);
            let bestScore = 0;
            let bestType: RankingClubMatch['matchType'] = 'unresolved';

            for (const variation of variations) {
                const candidate = computeVariationScore(normalizedValue, variation);
                if (candidate.score > bestScore) {
                    bestScore = candidate.score;
                    bestType = candidate.matchType;
                }
            }

            return {
                club,
                score: bestScore,
                matchType: bestType,
            };
        })
        .filter((item) => item.score >= 0.74)
        .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            return left.club.name.localeCompare(right.club.name, 'es');
        });

    const best = ranked[0];
    const second = ranked[1];

    if (!best) {
        return {
            sourceValue,
            normalizedValue,
            matchedClubId: null,
            matchedClubName: null,
            matchedClubShortName: null,
            matchedClubLogoUrl: null,
            confidence: 'sin_match',
            matchType: 'unresolved',
            score: 0,
            ambiguous: false,
            alternatives: [],
        };
    }

    const ambiguous = Boolean(second && best.score - second.score < 0.035 && best.score < 0.99);
    const confidence: RankingClubMatch['confidence'] =
        best.score >= 0.96 && !ambiguous
            ? 'alta'
            : best.score >= 0.86 && !ambiguous
                ? 'media'
                : 'baja';

    return {
        sourceValue,
        normalizedValue,
        matchedClubId: best.club.id,
        matchedClubName: best.club.name,
        matchedClubShortName: best.club.shortName,
        matchedClubLogoUrl: best.club.logoUrl,
        confidence,
        matchType: best.matchType,
        score: best.score,
        ambiguous,
        alternatives: ranked.slice(0, 3).map((item) => ({
            id: item.club.id,
            name: item.club.name,
        })),
    };
}

function inferExpectedField(
    header: string,
    normalizedHeader: string,
    dataType: RankingColumnAnalysis['dataType'],
    clubMatchRate: number,
    expectedFields: readonly RankingExpectedField[],
) {
    const exactField = expectedFields.find((field) =>
        field.aliases.some((alias) => normalizeHeaderKey(alias) === normalizedHeader),
    );

    if (exactField) {
        return {
            expectedFieldKey: exactField.key,
            expectedFieldLabel: exactField.label,
            matchedHeaderAlias: true,
        };
    }

    if (clubMatchRate >= 0.55 && dataType !== 'numero') {
        return {
            expectedFieldKey: 'club',
            expectedFieldLabel: expectedFields.find((field) => field.key === 'club')?.label ?? 'Nombre del club',
            matchedHeaderAlias: false,
        };
    }

    if (
        ['numero', 'mixto'].includes(dataType) &&
        /(rating|puntaje|puntos|points|pts|score|ovr|overall)/.test(normalizedHeader)
    ) {
        return {
            expectedFieldKey: 'rating_inicial',
            expectedFieldLabel: expectedFields.find((field) => field.key === 'rating_inicial')?.label ?? 'Rating inicial',
            matchedHeaderAlias: false,
        };
    }

    if (
        ['numero', 'texto', 'mixto'].includes(dataType) &&
        /^(pos|posicion|puesto|rank|ranking)$/.test(normalizedHeader)
    ) {
        return {
            expectedFieldKey: 'posicion',
            expectedFieldLabel: expectedFields.find((field) => field.key === 'posicion')?.label ?? 'Posicion actual',
            matchedHeaderAlias: false,
        };
    }

    if (/(^tr$|union|regional|region)/.test(normalizedHeader)) {
        return {
            expectedFieldKey: 'region',
            expectedFieldLabel: expectedFields.find((field) => field.key === 'region')?.label ?? 'TR / Region',
            matchedHeaderAlias: false,
        };
    }

    if (/(puesto_viejo|puesto_anterior|posicion_anterior|old_rank|old_position)/.test(normalizedHeader)) {
        return {
            expectedFieldKey: 'puesto_viejo',
            expectedFieldLabel: expectedFields.find((field) => field.key === 'puesto_viejo')?.label ?? 'Puesto anterior',
            matchedHeaderAlias: false,
        };
    }

    if (/(variacion|delta|cambio|movement)/.test(normalizedHeader)) {
        return {
            expectedFieldKey: 'variacion',
            expectedFieldLabel: expectedFields.find((field) => field.key === 'variacion')?.label ?? 'Variacion',
            matchedHeaderAlias: false,
        };
    }

    if (
        ['booleano', 'texto', 'mixto'].includes(dataType) &&
        /(activo|enabled|habilitado|participa)/.test(normalizedHeader)
    ) {
        return {
            expectedFieldKey: 'activo',
            expectedFieldLabel: expectedFields.find((field) => field.key === 'activo')?.label ?? 'Activo en ranking',
            matchedHeaderAlias: false,
        };
    }

    if (/(nota|comment|observacion|remarks)/.test(normalizedHeader)) {
        return {
            expectedFieldKey: 'notas',
            expectedFieldLabel: expectedFields.find((field) => field.key === 'notas')?.label ?? 'Notas',
            matchedHeaderAlias: false,
        };
    }

    if (
        /(club_id|clubid|codigo_club|id_club)/.test(normalizedHeader) ||
        (normalizedHeader === 'id' && /(club|equipo|team)/.test(normalizeNameKey(header)))
    ) {
        return {
            expectedFieldKey: 'club_id',
            expectedFieldLabel: expectedFields.find((field) => field.key === 'club_id')?.label ?? 'ID del club',
            matchedHeaderAlias: false,
        };
    }

    return {
        expectedFieldKey: null,
        expectedFieldLabel: null,
        matchedHeaderAlias: false,
    };
}

export function analyzeRankingSheet(
    rows: SheetRows,
    headers: string[],
    expectedFields: readonly RankingExpectedField[],
    clubs: RankingCatalogClub[],
): RankingSheetAnalysis {
    if (!headers.length) {
        return {
            columns: [],
            suggestedClubHeader: null,
            suggestedFieldHeaders: Object.fromEntries(expectedFields.map((field) => [field.key, null])),
            matchMapsByHeader: {},
        };
    }

    const columns = headers.map((header) => {
        const values = rows.map((row) => readText(row[header]));
        const nonEmptyValues = values.filter(Boolean);
        const uniqueValues = Array.from(new Set(nonEmptyValues));
        const dataType = inferColumnDataType(nonEmptyValues);
        let clubMatchCount = 0;
        let weightedScore = 0;

        if (clubs.length > 0 && dataType !== 'numero' && uniqueValues.length > 0) {
            const counts = nonEmptyValues.reduce((acc, value) => {
                acc.set(value, (acc.get(value) ?? 0) + 1);
                return acc;
            }, new Map<string, number>());

            uniqueValues.forEach((value) => {
                const match = matchClubByName(value, clubs);
                const count = counts.get(value) ?? 0;
                if (match.matchedClubId) {
                    clubMatchCount += count;
                    weightedScore += match.score * count;
                }
            });
        }

        const normalizedHeader = normalizeHeaderKey(header);
        const fieldGuess = inferExpectedField(header, normalizedHeader, dataType, nonEmptyValues.length ? clubMatchCount / nonEmptyValues.length : 0, expectedFields);

        return {
            header,
            normalizedHeader,
            fillCount: nonEmptyValues.length,
            emptyCount: values.length - nonEmptyValues.length,
            fillRate: values.length ? nonEmptyValues.length / values.length : 0,
            uniqueCount: uniqueValues.length,
            sampleValues: uniqueValues.slice(0, 3),
            dataType,
            expectedFieldKey: fieldGuess.expectedFieldKey,
            expectedFieldLabel: fieldGuess.expectedFieldLabel,
            matchedHeaderAlias: fieldGuess.matchedHeaderAlias,
            clubMatchCount,
            clubMatchRate: nonEmptyValues.length ? clubMatchCount / nonEmptyValues.length : 0,
            averageClubScore: clubMatchCount > 0 ? weightedScore / clubMatchCount : 0,
        } satisfies RankingColumnAnalysis;
    });

    const matchMapsByHeader = Object.fromEntries(
        columns.map((column) => [column.header, {} as Record<string, RankingClubMatch>]),
    );

    headers.forEach((header, index) => {
        const values = rows.map((row) => readText(row[header])).filter(Boolean);
        if (!values.length || clubs.length === 0 || columns[index]?.dataType === 'numero') return;
        const uniqueValues = Array.from(new Set(values));
        uniqueValues.forEach((value) => {
            matchMapsByHeader[header][value] = matchClubByName(value, clubs);
        });
    });

    const clubCandidates = columns
        .map((column) => ({
            column,
            rankingScore:
                column.clubMatchRate +
                (column.expectedFieldKey === 'club' ? 0.24 : 0) +
                (/club|equipo|team|institucion/.test(column.normalizedHeader) ? 0.12 : 0) +
                (column.dataType === 'texto' ? 0.05 : column.dataType === 'mixto' ? 0.02 : 0),
        }))
        .filter((item) => item.column.fillCount > 0)
        .sort((left, right) => right.rankingScore - left.rankingScore);

    const suggestedClubHeader =
        clubCandidates[0] && (clubCandidates[0].rankingScore >= 0.4 || clubCandidates[0].column.clubMatchRate >= 0.3)
            ? clubCandidates[0].column.header
            : null;

    const suggestedFieldHeaders = Object.fromEntries(expectedFields.map((field) => [field.key, null])) as Record<string, string | null>;

    expectedFields.forEach((field) => {
        const matchingColumns = columns
            .filter((column) => column.expectedFieldKey === field.key)
            .sort((left, right) => {
                if (Number(right.matchedHeaderAlias) !== Number(left.matchedHeaderAlias)) {
                    return Number(right.matchedHeaderAlias) - Number(left.matchedHeaderAlias);
                }
                if (right.clubMatchRate !== left.clubMatchRate) {
                    return right.clubMatchRate - left.clubMatchRate;
                }
                if (right.fillRate !== left.fillRate) {
                    return right.fillRate - left.fillRate;
                }
                return left.header.localeCompare(right.header, 'es');
            });

        suggestedFieldHeaders[field.key] =
            field.key === 'club'
                ? suggestedClubHeader
                : matchingColumns[0]?.header ?? null;
    });

    return {
        columns,
        suggestedClubHeader,
        suggestedFieldHeaders,
        matchMapsByHeader,
    };
}

export function buildRowClubSummary(
    rows: SheetRows,
    clubHeader: string | null,
    matchMap: Record<string, RankingClubMatch> | null | undefined,
): RankingRowClubSummary {
    if (!clubHeader) {
        return {
            rows: [],
            totalRows: rows.length,
            rowsWithValue: 0,
            matchedRows: 0,
            unresolvedRows: 0,
            ambiguousRows: 0,
            uniqueClubMatches: 0,
            matchCoverage: 0,
        };
    }

    const rowAnalyses = rows.map((row, index) => {
        const sourceValue = readText(row[clubHeader]);
        const match = sourceValue ? matchMap?.[sourceValue] ?? null : null;

        return {
            rowIndex: index,
            sourceValue,
            match,
        } satisfies RankingRowClubAnalysis;
    });

    const rowsWithValue = rowAnalyses.filter((row) => row.sourceValue).length;
    const matchedRows = rowAnalyses.filter((row) => row.match?.matchedClubId).length;
    const unresolvedRows = rowAnalyses.filter((row) => row.sourceValue && !row.match?.matchedClubId).length;
    const ambiguousRows = rowAnalyses.filter((row) => row.match?.ambiguous).length;
    const uniqueClubMatches = new Set(
        rowAnalyses
            .map((row) => row.match?.matchedClubId)
            .filter((clubId): clubId is string => Boolean(clubId)),
    ).size;

    return {
        rows: rowAnalyses,
        totalRows: rows.length,
        rowsWithValue,
        matchedRows,
        unresolvedRows,
        ambiguousRows,
        uniqueClubMatches,
        matchCoverage: rowsWithValue ? matchedRows / rowsWithValue : 0,
    };
}
