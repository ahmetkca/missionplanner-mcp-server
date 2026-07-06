import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BridgeClient } from "./bridge-client.js";
import { registerMpStatus } from "./tools/mp-status.js";
import { registerListParams } from "./tools/list-params.js";
import { registerGetParam } from "./tools/get-param.js";
import { registerSearchParams } from "./tools/search-params.js";
import { registerSetParam } from "./tools/set-param.js";
import { registerParamsCurrent } from "./resources/params-current.js";
import { registerParamByName } from "./resources/param-by-name.js";

export function createServer(bridgeBaseUrl?: string): {
  server: McpServer;
  bridge: BridgeClient;
} {
  const bridge = new BridgeClient(bridgeBaseUrl);

  const server = new McpServer({
    name: "missionplanner-mcp-server",
    version: "0.1.0",
  });

  // Tools
  registerMpStatus(server, bridge);
  registerListParams(server, bridge);
  registerGetParam(server, bridge);
  registerSearchParams(server, bridge);
  registerSetParam(server, bridge);

  // Resources
  registerParamsCurrent(server, bridge);
  registerParamByName(server, bridge);

  return { server, bridge };
}
