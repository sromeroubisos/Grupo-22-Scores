import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function buildOpenApiSpec(origin: string) {
  const baseUrl = origin.replace(/\/$/, '');

  return {
    openapi: '3.1.0',
    info: {
      title: 'G22Scores Results API',
      version: '1.0.0',
      description: 'Actions for searching tournaments and matches, updating official scores, and returning publish-ready content from G22Scores.',
    },
    servers: [
      {
        url: baseUrl,
        description: 'G22Scores deployment',
      },
    ],
    paths: {
      '/api/results/tournaments/search': {
        post: {
          operationId: 'searchResultsTournaments',
          summary: 'Search tournaments directly',
          description: 'Finds visible G22Scores tournaments by query, sport, and status so an agent can choose the right competition before looking for matches.',
          security: [{ bearerAuth: [] }],
          'x-openai-isConsequential': false,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ResultsTournamentSearchPayload',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Matching tournaments.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ResultsTournamentSearchResponse',
                  },
                },
              },
            },
            '400': {
              description: 'Invalid tournament search payload.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '401': {
              description: 'Unauthorized.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/api/results/matches/by-date': {
        post: {
          operationId: 'searchResultsMatchesByDate',
          summary: 'Search matches by date',
          description: 'Returns matches for a specific local date with optional tournament, team, sport, status, and category filters.',
          security: [{ bearerAuth: [] }],
          'x-openai-isConsequential': false,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ResultsMatchesByDatePayload',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Matches for the requested date.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ResultsMatchesByDateResponse',
                  },
                },
              },
            },
            '400': {
              description: 'Invalid date search payload.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '401': {
              description: 'Unauthorized.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/api/results/pieces': {
        post: {
          operationId: 'getResultsPublishingPieces',
          summary: 'Get ready-to-publish pieces',
          description: 'Builds publish-ready captions, WhatsApp text, alt text, and ExportImage render payloads for match results, schedules, daily match lists, and standings.',
          security: [{ bearerAuth: [] }],
          'x-openai-isConsequential': false,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ResultsPublishingPiecesPayload',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Ready-to-publish pieces.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ResultsPublishingPiecesResponse',
                  },
                },
              },
            },
            '400': {
              description: 'Invalid pieces payload.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '401': {
              description: 'Unauthorized.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '404': {
              description: 'No matching match found.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/api/results/search': {
        post: {
          operationId: 'searchResultsMatch',
          summary: 'Search a match by ID or teams',
          description: 'Finds one or more matches using match_id or team names plus optional tournament filters.',
          security: [{ bearerAuth: [] }],
          'x-openai-isConsequential': false,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ResultsSearchPayload',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Matching matches found or resolved.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ResultsSearchResponse',
                  },
                },
              },
            },
            '400': {
              description: 'Invalid search payload.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '401': {
              description: 'Unauthorized.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '409': {
              description: 'Ambiguous team resolution or multiple candidate matches.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/api/results/update': {
        post: {
          operationId: 'updateResultsMatch',
          summary: 'Update an official match result',
          description: 'Updates a resolved match score, recalculates standings, and returns the updated table snapshot.',
          security: [{ bearerAuth: [] }],
          'x-openai-isConsequential': true,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ResultsUpdatePayload',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Match updated and standings recalculated.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ResultsUpdateResponse',
                  },
                },
              },
            },
            '400': {
              description: 'Invalid update payload.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '401': {
              description: 'Unauthorized.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '404': {
              description: 'Match not found.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '409': {
              description: 'Conflicting or ambiguous match selection.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: 'Use the G22Scores Results API key in the Authorization header as Bearer <API_KEY>.',
        },
      },
      schemas: {
        ResultsTournamentSearchPayload: {
          type: 'object',
          additionalProperties: false,
          properties: {
            query: { type: 'string', description: 'Tournament search text. Also accepts search or tournament in the raw payload.' },
            sport: { type: 'string', description: 'Optional sport filter, for example rugby, football, hockey, basketball, motorsport.' },
            status: { type: 'string', description: 'Optional tournament status filter.' },
            limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum number of tournaments to return.' },
            include_static: { type: 'boolean', description: 'Whether to include bundled external/static tournament catalog entries.' },
          },
        },
        ResultsTournamentSummary: {
          type: 'object',
          properties: {
            tournament_id: { type: 'string' },
            name: { type: 'string' },
            display_name: { type: 'string' },
            slug: { type: ['string', 'null'] },
            category: { type: ['string', 'null'] },
            status: { type: ['string', 'null'] },
            sport_id: { type: ['string', 'null'] },
            source: { type: 'string', enum: ['database', 'static'] },
            url: { type: ['string', 'null'] },
            external_id: { type: ['string', 'null'] },
            external_ids: {
              type: ['object', 'null'],
              additionalProperties: true,
            },
          },
        },
        ResultsTournamentSearchResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            count: { type: 'integer' },
            tournaments: {
              type: 'array',
              items: { $ref: '#/components/schemas/ResultsTournamentSummary' },
            },
          },
        },
        ResultsMatchesByDatePayload: {
          type: 'object',
          additionalProperties: false,
          required: ['date'],
          properties: {
            date: { type: 'string', format: 'date', description: 'Local date in YYYY-MM-DD format.' },
            timezone: { type: 'string', description: 'IANA timezone. Defaults to America/Argentina/Buenos_Aires.' },
            sport: { type: 'string', description: 'Optional sport filter.' },
            status: { type: 'string', description: 'Optional match status filter.' },
            tournament: { type: 'string', description: 'Optional tournament name or slug filter.' },
            tournament_id: { type: 'string', description: 'Optional exact tournament ID filter.' },
            category: { type: 'string', description: 'Optional category filter.' },
            team: { type: 'string', description: 'Optional home or away team filter.' },
            limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum number of matches to return.' },
            include_pieces: { type: 'boolean', description: 'When true, also returns a daily_matches ready-to-publish piece.' },
          },
        },
        ResultsMatchesByDateResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            date: { type: 'string', format: 'date' },
            timezone: { type: 'string' },
            count: { type: 'integer' },
            matches: {
              type: 'array',
              items: { $ref: '#/components/schemas/MatchSummary' },
            },
            pieces: {
              type: 'array',
              items: { $ref: '#/components/schemas/PublishingPiece' },
            },
          },
        },
        ResultsPublishingPiecesPayload: {
          type: 'object',
          additionalProperties: false,
          properties: {
            match_id: { type: 'string', description: 'Direct match identifier.' },
            date: { type: 'string', format: 'date', description: 'Local date in YYYY-MM-DD format. Used for daily match pieces or date-scoped matching.' },
            timezone: { type: 'string', description: 'IANA timezone. Defaults to America/Argentina/Buenos_Aires.' },
            tournament: { type: 'string', description: 'Tournament name or slug filter.' },
            tournament_id: { type: 'string', description: 'Exact tournament ID filter.' },
            category: { type: 'string', description: 'Category filter.' },
            round: { type: 'string', description: 'Round or jornada label.' },
            home_team: { type: 'string', description: 'Home team name when resolving by teams.' },
            away_team: { type: 'string', description: 'Away team name when resolving by teams.' },
            team: { type: 'string', description: 'Home or away team filter when resolving by date.' },
            piece_types: {
              type: 'array',
              minItems: 1,
              maxItems: 4,
              items: {
                type: 'string',
                enum: ['match_result', 'match_schedule', 'daily_matches', 'standings'],
              },
              description: 'Requested piece types. Defaults to daily_matches for date payloads, otherwise match_result and standings.',
            },
            limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Maximum number of matches to turn into pieces.' },
          },
          description: 'Send match_id, date, or both home_team and away_team.',
        },
        PublishingPiece: {
          type: 'object',
          properties: {
            piece_id: { type: 'string' },
            type: { type: 'string' },
            status: { type: 'string', enum: ['ready'] },
            title: { type: 'string' },
            caption: { type: 'string' },
            whatsapp_text: { type: 'string' },
            alt_text: { type: 'string' },
            suggested_filename: { type: 'string' },
            source: {
              type: 'object',
              additionalProperties: true,
            },
            render: {
              type: 'object',
              description: 'Payload ready for the existing ExportImage renderer. It is not a binary PNG by itself.',
              additionalProperties: true,
            },
          },
        },
        ResultsPublishingPiecesResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            count: { type: 'integer' },
            match_count: { type: 'integer' },
            pieces: {
              type: 'array',
              items: { $ref: '#/components/schemas/PublishingPiece' },
            },
            warnings: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        ResultsSearchPayload: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tournament: { type: 'string', description: 'Tournament name or slug filter.' },
            category: { type: 'string', description: 'Category filter.' },
            match_id: { type: 'string', description: 'Direct match identifier when already known.' },
            home_team: { type: 'string', description: 'Home team name to resolve locally.' },
            away_team: { type: 'string', description: 'Away team name to resolve locally.' },
            match_date: { type: 'string', format: 'date', description: 'Expected match date in YYYY-MM-DD format.' },
            round: { type: 'string', description: 'Round or jornada label.' },
            limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Maximum number of matches to return.' },
          },
          description: 'Send match_id or send both home_team and away_team.',
        },
        ResultsUpdatePayload: {
          type: 'object',
          additionalProperties: false,
          required: ['home_score', 'away_score'],
          properties: {
            tournament: { type: 'string', description: 'Tournament name or slug filter.' },
            category: { type: 'string', description: 'Category filter.' },
            match_id: { type: 'string', description: 'Direct match identifier when already known.' },
            home_team: { type: 'string', description: 'Home team name if resolving the match by teams.' },
            away_team: { type: 'string', description: 'Away team name if resolving the match by teams.' },
            home_score: { type: 'integer', minimum: 0, description: 'Official home team score.' },
            away_score: { type: 'integer', minimum: 0, description: 'Official away team score.' },
            match_date: { type: 'string', format: 'date', description: 'Expected match date in YYYY-MM-DD format.' },
            round: { type: 'string', description: 'Round or jornada label.' },
            status: {
              type: 'string',
              description: 'Normalized status such as final, live, scheduled, postponed, cancelled, or suspended.',
            },
            observations: { type: 'string', description: 'Human notes attached to the integration update.' },
            corrections: { type: 'string', description: 'Corrections or review notes attached to the update.' },
            source: { type: 'string', description: 'Source label written into integration notes.' },
            bonus_point: { type: 'boolean', nullable: true, description: 'Whether a bonus point rule should be applied.' },
            bonus_target: {
              type: 'string',
              nullable: true,
              enum: ['home', 'away', 'both', 'winner', 'none'],
              description: 'Which side receives bonus points when bonus_point is true.',
            },
            home_bonus_points: {
              type: 'number',
              nullable: true,
              minimum: 0,
              description: 'Manual override for home bonus points.',
            },
            away_bonus_points: {
              type: 'number',
              nullable: true,
              minimum: 0,
              description: 'Manual override for away bonus points.',
            },
          },
          description: 'Send home_score and away_score plus match_id, or enough match data to resolve exactly one match.',
        },
        MatchSummary: {
          type: 'object',
          properties: {
            match_id: { type: 'string' },
            matched_by: { type: 'string' },
            tournament_id: { type: ['string', 'null'] },
            tournament: { type: ['string', 'null'] },
            tournament_slug: { type: ['string', 'null'] },
            category: { type: ['string', 'null'] },
            round: { type: ['string', 'null'] },
            match_date: { type: ['string', 'null'], format: 'date' },
            match_time: { type: ['string', 'null'] },
            date_time: { type: ['string', 'null'], format: 'date-time' },
            status: { type: ['string', 'null'] },
            sport_id: { type: ['string', 'null'] },
            home_team: { type: ['string', 'null'] },
            away_team: { type: ['string', 'null'] },
            home_score: { type: 'number' },
            away_score: { type: 'number' },
          },
        },
        ResultsSearchResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            count: { type: 'integer' },
            matches: {
              type: 'array',
              items: { $ref: '#/components/schemas/MatchSummary' },
            },
            reversed_matches: {
              type: 'array',
              items: { $ref: '#/components/schemas/MatchSummary' },
            },
            resolution: {
              type: ['object', 'null'],
              additionalProperties: true,
            },
            standings_context: {
              type: ['object', 'null'],
              additionalProperties: true,
            },
            rules: {
              type: ['object', 'null'],
              additionalProperties: true,
            },
          },
        },
        ResultsUpdateResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            updated_match: {
              type: 'object',
              additionalProperties: true,
            },
            standings_updated: { type: 'boolean' },
            standings_context: {
              type: ['object', 'null'],
              additionalProperties: true,
            },
            rules: {
              type: ['object', 'null'],
              additionalProperties: true,
            },
            table: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
              },
            },
            summary: {
              type: 'object',
              additionalProperties: true,
            },
            resolution: {
              type: 'object',
              additionalProperties: true,
            },
            warnings: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', enum: [false] },
            error: { type: 'string' },
            code: { type: 'string' },
            details: {
              type: ['object', 'array', 'string', 'null'],
            },
          },
        },
      },
    },
  };
}

export async function GET(request: NextRequest) {
  const spec = buildOpenApiSpec(request.nextUrl.origin);
  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
