# @ahmetkca/missionplanner-mcp-server

> An [MCP](https://modelcontextprotocol.io) server that gives AI coding agents (Claude Code, Codex, etc.) structured, live context about [ArduPilot Mission Planner](https://github.com/ArduPilot/MissionPlanner) — starting with the full vehicle parameter set.

**Status:** pre-1.0, MVP, read-only. Localhost-only, single-vehicle, no auth. See [Roadmap](#roadmap).

---

## What it does

When Mission Planner is connected to a vehicle (via COM/TCP/UDP), this server lets an AI agent:

- Ask whether MP is connected, to which vehicle, and with what firmware.
- List the full parameter set (1000+ params on a typical vehicle) with values and MAVLink types.
- Look up a single parameter by name with **full pdef metadata** — description, units, allowed values, bitmask definitions, range, reboot-required flag, and more.
- Search parameters by keyword across names, display names, and descriptions.

The metadata is whatever MP already has cached locally in its pdef database — no extra downloads, no parsing in this process.

---

## How the pieces fit together

```
┌──────────────────────────┐      ┌─────────────────────────────┐      ┌─────────────────┐
│  Mission Planner         │      │  @ahmetkca/missionplanner-  │      │  AI coding      │
│  (with MCP bridge)       │◄────►│  mcp-server                 │◄────►│  agent          │
│                          │      │                             │      │                 │
│  HTTP  127.0.0.1:9999    │ HTTP │  stdio (default)            │  MCP │                 │
└──────────────────────────┘      │  or Streamable HTTP on 9990 │      └─────────────────┘
                                  └─────────────────────────────┘
```

Two moving parts you need to run:

1. **Mission Planner** with the HTTP bridge compiled in. This lives on a fork at [`ahmetkca/MissionPlanner`](https://github.com/ahmetkca/MissionPlanner) on branch `feat/mcp-bridge`.
2. **This MCP server.** Installed from npm, spawned by your agent (stdio) or run separately (HTTP).

---

## Requirements

- Node.js 20+ (tested on Node 24).
- A running Mission Planner built from [`ahmetkca/MissionPlanner@feat/mcp-bridge`](https://github.com/ahmetkca/MissionPlanner/tree/feat/mcp-bridge). The bridge listens on `127.0.0.1:9999` from MP startup — no extra config needed.
- Whatever MCP-capable agent you want to use (this repo has been tested with [Claude Code](https://www.claude.com/product/claude-code)).

You do **not** need to connect MP to a vehicle for the server to start — the `mp_status` tool will just report `connected: false`. The read tools will start returning live data as soon as MP finishes the parameter download after connecting.

---

## Install & configure

### Claude Code

Add this to your `~/.claude.json` under `mcpServers`.

**macOS / Linux:**

```json
{
  "mcpServers": {
    "missionplanner": {
      "command": "npx",
      "args": ["--yes", "@ahmetkca/missionplanner-mcp-server"]
    }
  }
}
```

**Windows** (requires `cmd /c` — see [Windows gotchas](#windows-gotchas) below):

```json
{
  "mcpServers": {
    "missionplanner": {
      "command": "cmd",
      "args": ["/c", "npx", "--yes", "@ahmetkca/missionplanner-mcp-server"]
    }
  }
}
```

Restart Claude Code. Run `/mcp` — the server should show as connected. Ask: *"What's the status of Mission Planner?"* or *"List all ARSPD parameters."*

### Other MCP clients

Any client that speaks the Model Context Protocol and can spawn a stdio server should work. Point it at `npx --yes @ahmetkca/missionplanner-mcp-server`.

For clients that prefer an HTTP endpoint, run the server manually (see [HTTP mode](#http-mode)) and point your client at `http://127.0.0.1:9990/mcp`.

---

## Tools

| Tool | Description |
|---|---|
| `mp_status` | Is MP running? Connected? Which vehicle and firmware? Is the bridge API version compatible with this server? |
| `list_params(prefix?, limit?, cursor?)` | Browse params with optional name-prefix filter and opaque-cursor pagination. Returns lightweight entries (name, value, type) — no metadata. |
| `get_param(name)` | Full pdef metadata for a single parameter. Case-sensitive, UPPER_SNAKE_CASE. |
| `search_params(query)` | Keyword search across parameter names, display names, and descriptions. Returns up to 25 results with full metadata, ranked by match quality. |

## Resources

| URI | Description |
|---|---|
| `ardupilot-missionplanner://vehicle/params` | Full lightweight param list (same shape as `list_params` with no filter, unpaginated). |
| `ardupilot-missionplanner://vehicle/params/{name}` | Resource template — one param with full metadata. Registers `list` and `complete` callbacks so agents can browse and autocomplete. |

---

## Run modes

The server supports two transports, selected via `--transport`.

### stdio (default)

```bash
npx @ahmetkca/missionplanner-mcp-server
# equivalent to:
npx @ahmetkca/missionplanner-mcp-server --transport stdio
```

One instance per agent session. The agent spawns it as a child process. This is the recommended default.

### HTTP mode

```bash
npx @ahmetkca/missionplanner-mcp-server --transport http --port 9990
```

Runs a [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) server on `127.0.0.1:9990/mcp`, with a `/health` endpoint for liveness checks. One instance can serve multiple agents and survives agent restarts. Useful for:

- Debugging with [`@modelcontextprotocol/inspector`](https://github.com/modelcontextprotocol/inspector).
- Sharing a warmed-up process (bridge already validated, no startup latency) across multiple agent sessions.

### Flags

| Flag | Default | Purpose |
|---|---|---|
| `--transport <stdio\|http>` | `stdio` | Transport mode |
| `--port <n>` | `9990` | Port for HTTP mode |
| `--bridge-url <url>` | `http://127.0.0.1:9999` | Where the MP HTTP bridge is listening |

---

## Windows gotchas

Three things tripped us up during initial rollout, all documented here so future-you doesn't rediscover them:

1. **You must use `cmd /c npx ...` in your agent config.** Claude Code on Windows does not resolve `.cmd` shims through `PATHEXT` when spawning a command directly. Wrapping in `cmd /c` works.
2. **You must use `--yes` with `npx`.** Otherwise the first invocation prompts "Ok to proceed?" on stdout and corrupts the JSON-RPC stream.
3. **`.js` files must have a `#!/usr/bin/env node` shebang** for npm to generate a proper `.cmd` shim on Windows. This is handled inside this package; listed here only in case you fork or vendor the code.

Diagnosis tip: run Claude Code with `--debug` to get stderr from the spawned MCP server in the debug log. The actual failure message is usually hiding there.

---

## Development

### Local setup

```bash
git clone https://github.com/ahmetkca/missionplanner-mcp-server.git
cd missionplanner-mcp-server
npm install
npm run build
```

### Scripts

| Script | What |
|---|---|
| `npm run dev` | `tsx watch` on `src/index.ts` for fast iteration |
| `npm run build` | `tsc` → emits `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run start:stdio` | Run the built server in stdio mode |
| `npm run start:http` | Run the built server in HTTP mode on 9990 |

### Point your agent at the local build

Replace the `npx` config with a direct `node dist/index.js` invocation so your agent picks up your local changes without a publish cycle:

```json
{
  "mcpServers": {
    "missionplanner-dev": {
      "command": "node",
      "args": ["C:\\path\\to\\missionplanner-mcp-server\\dist\\index.js"]
    }
  }
}
```

### Code layout

```
src/
├─ index.ts            ← entry point, CLI parsing, transport selection
├─ server.ts           ← McpServer factory, wires tools + resources
├─ bridge-client.ts    ← typed HTTP client for the MP bridge
├─ semver.ts           ← minimal semver parse + range check
├─ tools/
│  ├─ mp-status.ts
│  ├─ list-params.ts
│  ├─ get-param.ts
│  └─ search-params.ts
└─ resources/
   ├─ params-current.ts
   └─ param-by-name.ts
```

### Testing against a mock bridge

There are no unit tests yet — contributions welcome. The easiest harness is a small Node HTTP server that stubs `/status`, `/params`, and `/params/{name}`. The bridge contract is specified in [`MCP_BRIDGE_DESIGN.md`](https://github.com/ahmetkca/MissionPlanner/blob/feat/mcp-bridge/docs/MCP_BRIDGE_DESIGN.md) §3.

---

## Architecture and contribution guide

The full design — including the HTTP contract, threading model, metadata sourcing, versioning handshake, and ADRs — lives in the Mission Planner fork:

- **HTTP bridge contract:** [`MCP_BRIDGE_DESIGN.md`](https://github.com/ahmetkca/MissionPlanner/blob/feat/mcp-bridge/docs/MCP_BRIDGE_DESIGN.md)
- **Project-wide architecture + vision:** [`ARCHITECTURE.md`](https://github.com/ahmetkca/MissionPlanner/blob/feat/mcp-bridge/docs/ARCHITECTURE.md)
- **ADRs:** [`docs/adrs/`](https://github.com/ahmetkca/MissionPlanner/tree/feat/mcp-bridge/docs/adrs)

Please read the design doc before proposing changes that touch the HTTP contract or the MCP tool surface. Bumping `bridge_api_version` is not free — both sides have to agree.

---

## Roadmap

The long-term vision is to expose **full Mission Planner context** to AI agents, not just parameters. Near-term targets:

- **Parameter writes** (`PARAM_SET` → `POST /params/{name}`). Designed for in the bridge contract; not enabled.
- **Missions / waypoints.** Read first, then write.
- **Live telemetry snapshot** — attitude, battery, GPS fix, flight mode, armed state.
- **Logs / dataflash** listing and retrieval.

Each of these is a contract-extending change — new endpoints in the bridge, new MCP tools here. Proposals welcome.

---

## License

MIT © Ahmet Karapinar
