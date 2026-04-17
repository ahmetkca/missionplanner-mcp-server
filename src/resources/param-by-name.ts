import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BridgeClient } from "../bridge-client.js";

export function registerParamByName(
  server: McpServer,
  bridge: BridgeClient,
): void {
  server.registerResource(
    "ardupilot-vehicle-param",
    new ResourceTemplate(
      "ardupilot-missionplanner://vehicle/params/{name}",
      {
        list: async () => {
          const data = await bridge.getParams();
          return {
            resources: data.params.map((p) => ({
              uri: `ardupilot-missionplanner://vehicle/params/${encodeURIComponent(p.name)}`,
              name: p.name,
              description: `${p.name} = ${p.value} (${p.type})`,
              mimeType: "application/json" as const,
            })),
          };
        },
        complete: {
          name: async (value) => {
            const data = await bridge.getParams();
            const prefix = value.toUpperCase();
            return data.params
              .filter((p) => p.name.startsWith(prefix))
              .slice(0, 20)
              .map((p) => p.name);
          },
        },
      },
    ),
    {
      description:
        "Single ArduPilot parameter with full metadata (description, units, range, allowed values, bitmask, etc.) from the vehicle connected via Mission Planner.",
      mimeType: "application/json",
    },
    async (uri, { name }) => {
      const paramName = Array.isArray(name) ? name[0]! : name!;
      const param = await bridge.getParam(paramName);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(param, null, 2),
          },
        ],
      };
    },
  );
}
