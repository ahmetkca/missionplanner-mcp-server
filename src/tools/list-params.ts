import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BridgeClient, ParamSummary } from "../bridge-client.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function registerListParams(
  server: McpServer,
  bridge: BridgeClient,
): void {
  server.registerTool(
    "list_params",
    {
      title: "List Parameters",
      description: [
        "List ArduPilot parameters for the connected vehicle.",
        "Returns lightweight entries (name, value, type) without metadata.",
        "Use `get_param` for full metadata on a specific parameter.",
        "",
        "Pagination: results are paginated. The first call returns the first `limit` entries.",
        "If `next_cursor` is non-null in the response, pass it as `cursor` to get the next page.",
        "Continue until `next_cursor` is null.",
        "",
        "Filtering: use `prefix` to filter by parameter name prefix (e.g., 'SERVO1' returns SERVO1_FUNCTION, SERVO1_MIN, etc.).",
      ].join("\n"),
      inputSchema: {
        prefix: z
          .string()
          .optional()
          .describe(
            "Filter by name prefix, case-sensitive (e.g., 'GPS_', 'SERVO1')",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .optional()
          .describe(
            `Max entries per page (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT})`,
          ),
        cursor: z
          .string()
          .optional()
          .describe(
            "Opaque cursor from a previous response's next_cursor field. Omit for the first page.",
          ),
      },
    },
    async ({ prefix, limit, cursor }) => {
      try {
        const data = await bridge.getParams();
        let params = data.params;

        // Filter by prefix
        if (prefix) {
          params = params.filter((p) => p.name.startsWith(prefix));
        }

        // Decode cursor (cursor is the index to start from)
        const pageSize = limit ?? DEFAULT_LIMIT;
        const startIndex = cursor ? decodeCursor(cursor) : 0;
        const page = params.slice(startIndex, startIndex + pageSize);
        const hasMore = startIndex + pageSize < params.length;

        const result = {
          vehicle_type: data.vehicle_type,
          params_loaded: data.params_loaded,
          params_total: data.params_total,
          filtered_count: params.length,
          params: page,
          next_cursor: hasMore
            ? encodeCursor(startIndex + pageSize)
            : null,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
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

function encodeCursor(index: number): string {
  return Buffer.from(String(index)).toString("base64");
}

function decodeCursor(cursor: string): number {
  const decoded = Number(Buffer.from(cursor, "base64").toString("utf-8"));
  if (Number.isNaN(decoded) || decoded < 0) return 0;
  return decoded;
}
