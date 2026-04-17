import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BridgeClient } from "../bridge-client.js";

export function registerMpStatus(
  server: McpServer,
  bridge: BridgeClient,
): void {
  server.registerTool(
    "mp_status",
    {
      title: "Mission Planner Status",
      description:
        "Check if Mission Planner is running, connected to a vehicle, and whether the bridge API is compatible. Call this first before using other tools.",
    },
    async () => {
      const compat = await bridge.checkCompatibility();

      try {
        const status = await bridge.getStatus();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  bridge_compatible: compat.compatible,
                  ...status,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  bridge_compatible: false,
                  error: "mp_unreachable",
                  message: compat.reason ?? "Cannot reach Mission Planner bridge",
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
