import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BridgeClient } from "../bridge-client.js";

export function registerSetParam(
  server: McpServer,
  bridge: BridgeClient,
): void {
  server.registerTool(
    "set_param",
    {
      title: "Set Parameter",
      description: [
        "Write a single ArduPilot parameter value on the connected vehicle. This changes live vehicle configuration — follow this sequence exactly:",
        "",
        "1. Call get_param(name) first. This is mandatory, not optional — you must know the current value, range, allowed values/bitmask, and reboot_required before proposing a change. Do not call set_param based on a value you have not just read.",
        "2. Check mp_status for `armed`. If the vehicle is armed, treat this as a reason to pause and confirm extra carefully with the user before proceeding — this tool does not block writes while armed itself.",
        "3. Propose the exact parameter name, current value, and new value to the user and get their explicit confirmation before calling this tool. If you are running as Claude Code, use the AskUserQuestion tool to gather that confirmation rather than assuming intent from the conversation.",
        "4. Pass `expected_current_value` as exactly the value get_param just returned. If the live value has changed since your last read (e.g. changed elsewhere), the write is rejected with value_mismatch — re-fetch with get_param and re-confirm with the user before retrying.",
        "5. After a successful call, always call get_param(name) again — a separate, independent read — to verify what was actually written. ArduPilot can silently clamp an out-of-range value instead of rejecting it, so the applied_value in this tool's response is not sufficient on its own; confirm it against a fresh read.",
        "6. If reboot_required is true in the response, tell the user the change will not take effect until the flight controller is rebooted.",
        "7. On a timeout error, the outcome is ambiguous — the write may have been applied even though the acknowledgement was lost. Call get_param to check before deciding whether to retry.",
      ].join("\n"),
      inputSchema: {
        name: z
          .string()
          .describe(
            "Exact parameter name, case-sensitive (e.g., ATC_RAT_PIT_P). Must come from a prior get_param or list_params call.",
          ),
        value: z
          .number()
          .describe("The new value to write."),
        expected_current_value: z
          .number()
          .describe(
            "The value most recently returned by get_param for this parameter. Required — the write is rejected if the live value no longer matches this.",
          ),
      },
    },
    async ({ name, value, expected_current_value }) => {
      try {
        const result = await bridge.setParam(name, value, expected_current_value);
        const note =
          result.applied_value !== result.requested_value
            ? ` NOTE: the vehicle applied ${result.applied_value}, not the requested ${result.requested_value} — this parameter was likely clamped to a valid range. Confirm with get_param.`
            : "";
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2) + note,
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
