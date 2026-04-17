import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BridgeClient } from "../bridge-client.js";

export function registerGetParam(
  server: McpServer,
  bridge: BridgeClient,
): void {
  server.registerTool(
    "get_param",
    {
      title: "Get Parameter",
      description:
        "Get a single ArduPilot parameter by exact name with full metadata (description, units, range, allowed values, bitmask, etc.). Parameter names are case-sensitive and conventionally UPPER_SNAKE_CASE (e.g., SERVO1_FUNCTION, ARSPD_FBW_MIN).",
      inputSchema: {
        name: z
          .string()
          .describe(
            "Exact parameter name, case-sensitive (e.g., SERVO1_FUNCTION)",
          ),
      },
    },
    async ({ name }) => {
      try {
        const param = await bridge.getParam(name);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(param, null, 2),
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
