import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  BridgeClient,
  ParamDetailResponse,
  ParamSummary,
} from "../bridge-client.js";

const MAX_DETAIL_FETCHES = 25;

export function registerSearchParams(
  server: McpServer,
  bridge: BridgeClient,
): void {
  server.registerTool(
    "search_params",
    {
      title: "Search Parameters",
      description: [
        "Search ArduPilot parameters by keyword.",
        "First filters by name substring (case-insensitive), then fetches metadata for the top matches",
        "and also searches across display_name and description.",
        "",
        "Returns up to 25 results with full metadata, ranked: exact name matches first, then name substring matches, then description matches.",
        "",
        "Use this when you don't know the exact parameter name (e.g., search 'airspeed' to find ARSPD_* params).",
      ].join("\n"),
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            "Search term — matched case-insensitively against parameter names, display names, and descriptions",
          ),
      },
    },
    async ({ query }) => {
      try {
        const data = await bridge.getParams();
        const queryLower = query.toLowerCase();

        // Phase 1: name-based matching against the lightweight list
        const nameMatches: ParamSummary[] = [];
        const rest: ParamSummary[] = [];

        for (const p of data.params) {
          if (p.name.toLowerCase().includes(queryLower)) {
            nameMatches.push(p);
          } else {
            rest.push(p);
          }
        }

        // Fetch metadata for name matches (up to limit)
        const toFetch = nameMatches.slice(0, MAX_DETAIL_FETCHES);
        const detailed = await Promise.all(
          toFetch.map((p) =>
            bridge.getParam(p.name).catch((): null => null),
          ),
        );

        const results: ParamDetailResponse[] = [];
        for (const d of detailed) {
          if (d) results.push(d);
        }

        // Phase 2: if we have room, search remaining params' metadata for description matches
        if (results.length < MAX_DETAIL_FETCHES) {
          const remaining = MAX_DETAIL_FETCHES - results.length;
          const candidates = rest.slice(0, remaining * 3); // fetch a larger pool to find matches

          const candidateDetails = await Promise.all(
            candidates.map((p) =>
              bridge.getParam(p.name).catch((): null => null),
            ),
          );

          for (const d of candidateDetails) {
            if (results.length >= MAX_DETAIL_FETCHES) break;
            if (!d) continue;
            const searchable = [
              d.display_name ?? "",
              d.description ?? "",
            ]
              .join(" ")
              .toLowerCase();
            if (searchable.includes(queryLower)) {
              results.push(d);
            }
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  query,
                  result_count: results.length,
                  results,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${e instanceof Error ? e.message : String(e)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
