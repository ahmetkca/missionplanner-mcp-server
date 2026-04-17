import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BridgeClient } from "../bridge-client.js";

export function registerParamsCurrent(
  server: McpServer,
  bridge: BridgeClient,
): void {
  server.registerResource(
    "ardupilot-vehicle-params",
    "ardupilot-missionplanner://vehicle/params",
    {
      description:
        "Full parameter list for the currently connected ArduPilot vehicle via Mission Planner. Lightweight entries (name, value, type) without metadata.",
      mimeType: "application/json",
    },
    async () => {
      const data = await bridge.getParams();
      return {
        contents: [
          {
            uri: "ardupilot-missionplanner://vehicle/params",
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );
}
