import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { G22Client } from "./g22Client.js";
import {
  searchMatchInputSchema,
  updateResultInputSchema
} from "./schemas.js";
import { errorResult, successResult } from "./toolResponse.js";

const SEARCH_ENDPOINT = "/api/results/search";
const UPDATE_ENDPOINT = "/api/results/update";

export function registerG22Tools(server: McpServer, client: G22Client): void {
  server.registerTool(
    "search_match",
    {
      title: "Search match",
      description: [
        "Use this when you need to find or disambiguate a G22 Scores match before reading or updating a result.",
        "Provide match_id when available; otherwise provide tournament, category, teams, date, and/or round.",
        "Returns the G22 API JSON with minimal wrapping."
      ].join(" "),
      inputSchema: searchMatchInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (input) => {
      try {
        const response = await client.post(SEARCH_ENDPOINT, input);
        return successResult(SEARCH_ENDPOINT, response.status, response.body);
      } catch (error) {
        return errorResult(SEARCH_ENDPOINT, error);
      }
    }
  );

  server.registerTool(
    "update_result",
    {
      title: "Update result",
      description: [
        "Use this when you need to update a G22 Scores match result and receive the recalculated table from the API.",
        "home_score and away_score are required.",
        "If match_id is missing, the API resolves the match from tournament, category, teams, date, and/or round.",
        "Returns the original API JSON, expected to include the updated match, updated table, rules, summary.short, and summary.changes."
      ].join(" "),
      inputSchema: updateResultInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (input) => {
      try {
        const response = await client.post(UPDATE_ENDPOINT, input);
        return successResult(UPDATE_ENDPOINT, response.status, response.body);
      } catch (error) {
        return errorResult(UPDATE_ENDPOINT, error);
      }
    }
  );
}
