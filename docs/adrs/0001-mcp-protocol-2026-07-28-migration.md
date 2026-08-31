# 0001. Migrating to MCP protocol revision 2026-07-28

- **Status:** Proposed
- **Date:** 2026-08-30

## Context

This server was built against MCP protocol `2025-11-25` (via `@modelcontextprotocol/sdk@^1.29.0`,
a stateful, session-oriented SDK). The [2026-07-28 revision](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
replaces the connection-oriented model (`initialize` handshake, `Mcp-Session-Id`, server-initiated
requests, always-on SSE notifications) with a stateless, per-request model. Support for it ships
as a new major SDK generation — `@modelcontextprotocol/{server,client,core,node,...}@2.0.0` —
not as a patch to the package we currently depend on. As of this writing that generation is a
one-month-old **first beta**.

This document maps that revision onto this specific codebase: what changes, what doesn't, and
whether migrating now is the right call.

### What this server touches on the MCP wire today

| File | MCP surface |
|---|---|
| `src/server.ts` | `McpServer` construction, 5 `registerTool` calls, 2 `registerResource` calls |
| `src/index.ts` | stdio transport (`StdioServerTransport`) and HTTP transport (`StreamableHTTPServerTransport` + `sessionIdGenerator`) |
| `src/tools/*.ts` | tool schemas (raw zod shapes), no server-initiated requests, no notifications |
| `src/resources/*.ts` | 1 static resource, 1 `ResourceTemplate` with `list`/`complete` |

Notably: **this server has no server-side session state today.** ADR-0005 in the MissionPlanner
fork (`ahmetkca/MissionPlanner@feat/mcp-bridge`) deliberately rejected session-tracked
read-before-write enforcement for `set_param` specifically because this server can be run in
Streamable HTTP mode serving multiple concurrent agents, and chose a stateless mechanism
(`expected_current_value`) instead. Every tool here is a pure passthrough to the MissionPlanner
bridge's REST API (`127.0.0.1:9999`) — an internal API, versioned separately via
`bridge_api_version`, that is **not itself MCP** and is unaffected by anything in this document.

## Decision drivers

Gap-by-gap mapping of the 2026-07-28 changes against the table above:

1. **Sessions/handshake removed → conflicts with `index.ts`'s HTTP transport.**
   `sessionIdGenerator: () => randomUUID()` and the single shared `StreamableHTTPServerTransport`
   instance are the one piece of real, forced rework. The replacement is a stateless factory
   (`createMcpHandler(() => buildServer())` from `@modelcontextprotocol/server`, wrapped for
   Node via `toNodeHandler()` from `@modelcontextprotocol/node`) that builds a fresh server
   instance per request. Given this server already has no cross-request memory, this is a
   near-perfect fit conceptually — the rework is mechanical, not architectural.

2. **stdio transport moves to `serveStdio()`.** Replaces `new StdioServerTransport()` +
   `server.connect()`. Negotiates protocol era once per connection and pins to it. Smaller
   change than the HTTP path.

3. **MRTR (`inputRequired()`) replaces server-initiated requests.** We don't use
   `roots/list`, `sampling/createMessage`, or `elicitation/create` today, so nothing here is
   *forced*. It is, however, a real opportunity: `set_param`'s tool description
   (`src/tools/set-param.ts`) currently asks the *agent* to voluntarily call a client-side
   confirmation tool before writing a parameter — ADR-0005 explicitly called this
   unenforceable, because at the time MCP had no first-class "the human already approved this"
   mechanism. `inputRequired()` is a materially stronger primitive: the server can force a
   round-trip through the client's own confirmation UI before a write proceeds, rather than
   trusting the agent to police itself. This changes the premise ADR-0005 was reasoning
   from — worth its own follow-up ADR, not bundled into this migration.

4. **Deprecations (Roots, Sampling, Logging, HTTP+SSE transport, OAuth DCR).** None are used
   here. No action needed.

5. **Cache hints become required** (`ttlMs`/`cacheScope` on list/read results). None of the
   5 tools or 2 resources set this today. Vehicle parameters can change from MP's own UI,
   another concurrent agent, or the vehicle itself at any time, so the only honest hint is
   `ttlMs: 0`, `cacheScope: "private"` — anything more permissive risks a client trusting a
   stale value it never re-fetched, which is exactly the class of bug `set_param`'s
   read-before-write design (ADR-0005) exists to prevent on the write side.

6. **Deterministic `tools/list` ordering.** Registration order in `src/server.ts`
   (`mp_status`, `list_params`, `get_param`, `search_params`, `set_param`) is already fixed and
   not data-dependent, so this should already hold; worth a smoke test, not a code change.

7. **Raw zod shapes → `z.object(...)`.** All 5 tools pass raw shapes
   (e.g. `inputSchema: { name: z.string() }`) rather than wrapped objects. Deprecated-but-still-
   accepted in v2; the official codemod (`@modelcontextprotocol/codemod v1-to-v2`) rewrites
   this automatically. Cosmetic, not urgent on its own.

8. **Server identity in `_meta` on every response**, replacing one-time `initialize` identity.
   `src/server.ts:19` hardcodes `version: "0.1.0"` on the `McpServer`, while `package.json` is
   at `0.2.0` — already stale today, but low-stakes since identity was only exchanged once at
   `initialize`. Under 2026-07-28 this version string is echoed on *every* response, so it's
   worth fixing whenever this file is next touched, migration or not.

9. **Resource-not-found error code `-32002` → `-32602`, error-code range partitioning.**
   Doesn't touch us — bridge errors surface as `isError: true` text content inside a normal
   tool result, never as JSON-RPC protocol-level errors.

## Recommendation

**Do not migrate yet.** Reasoning, not just caution:

- The v2 package family is a one-month-old first beta. The changelog's own backward-compat
  story (`versionNegotiation: { mode: 'auto' }`, probing `server/discover` with a fallback to
  legacy 2025) means nothing about the current `1.29.0`/`1.30.0`-based server is broken or
  urgent to fix — existing clients keep working.
- We don't yet know whether the MCP clients this server actually targets (Claude Code, etc.)
  have adopted 2026-07-28 client-side. Migrating the server ahead of client adoption buys
  nothing except beta-package risk in the meantime.

**When the above changes** (v2 stabilizes and/or target clients confirm 2026-07-28 support),
the migration itself is small in scope for this codebase specifically, because it already has
no session state to unwind:

1. Bump `@modelcontextprotocol/sdk` → `1.30.0` now, independent of everything else — same
   protocol era, picks up unrelated SSE keep-alive fixes, zero risk.
2. Once `@modelcontextprotocol/codemod` is stable, run `v1-to-v2` at the package root, grep for
   `@mcp-codemod-error` markers it couldn't auto-resolve.
3. Rewrite the HTTP block in `src/index.ts` around `createMcpHandler` + `toNodeHandler`
   (the one structurally forced change); port `src/index.ts`'s stdio block to `serveStdio`.
4. Add `cacheHint: { ttlMs: 0, cacheScope: "private" }` to each of the 5 tool and 2 resource
   registrations.
5. Sync `src/server.ts`'s hardcoded version with `package.json`.
6. Decide, in a separate ADR, whether `set_param` should adopt native `inputRequired()`
   confirmation instead of (or alongside) the prompting-layer convention ADR-0005 established.

## Consequences

**Positive:**
- No forced action today; existing behavior is fully spec-compliant for the era it targets and
  keeps working against clients that haven't moved either.
- Because this server is already stateless in practice, the eventual HTTP-transport rewrite is
  mechanical rather than a redesign — there's no session state to figure out how to drop.
- The gaps identified here (cache hints, version-string drift, `set_param` confirmation) are
  each independently small enough to land as their own follow-up, rather than one large
  migration commit.

**Negative:**
- Deferring means re-deriving beta-package details again whenever migration actually starts,
  since the v2 API surface may still shift before stabilizing.
- The `set_param` confirmation question (driver 3) is left open rather than resolved here —
  intentionally, since it's a design decision independent of the mechanical migration.

## Alternatives considered

**Migrate immediately.** Rejected — no client-adoption evidence yet, and adopting a first-beta
SDK generation in a tool that writes live vehicle parameters (`set_param`) is a worse risk
trade than the cost of waiting.

**Dual-support both protocol eras simultaneously via `server-legacy`.** Possible per the
migration guide, but adds real maintenance surface (two code paths, two test matrices) for a
server with five tools and no evidence yet that any client needs 2026-07-28 specifically.
Revisit if a target client requires it before v2 stabilizes.

**Ignore the revision entirely until forced.** Rejected — the backward-compatibility window
described in the changelog is real but not indefinite (features move from Deprecated to Removed
on a 12-month clock), so tracking the gap now, without acting on it yet, is the cheaper
long-term option.
