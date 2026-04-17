#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createServer } from "./server.js";

// ── CLI args ───────────────────────────────────────────────────────────

function parseArgs(): {
  transport: "stdio" | "http";
  port: number;
  bridgeUrl?: string;
} {
  const args = process.argv.slice(2);
  let transport: "stdio" | "http" = "stdio";
  let port = 9990;
  let bridgeUrl: string | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--transport" && args[i + 1]) {
      const val = args[i + 1]!;
      if (val !== "stdio" && val !== "http") {
        console.error(`Unknown transport: ${val}. Use "stdio" or "http".`);
        process.exit(1);
      }
      transport = val;
      i++;
    } else if (arg === "--port" && args[i + 1]) {
      port = Number(args[i + 1]);
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        console.error(`Invalid port: ${args[i + 1]}`);
        process.exit(1);
      }
      i++;
    } else if (arg === "--bridge-url" && args[i + 1]) {
      bridgeUrl = args[i + 1];
      i++;
    }
  }

  return { transport, port, ...(bridgeUrl !== undefined ? { bridgeUrl } : {}) };
}

// ── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { transport: mode, port, bridgeUrl } = parseArgs();
  const { server, bridge } = createServer(bridgeUrl);

  // Check bridge compatibility on startup
  const compat = await bridge.checkCompatibility();
  if (!compat.compatible) {
    console.error(
      `WARNING: Bridge compatibility check failed: ${compat.reason}`,
    );
    console.error(
      "The server will start but tools requiring MP connection will fail.",
    );
  }

  if (mode === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP server running on stdio");
  } else {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    const httpServer = createHttpServer((req, res) => {
      // Only handle the /mcp endpoint
      if (req.url === "/mcp" || req.url?.startsWith("/mcp?")) {
        transport.handleRequest(req, res);
      } else if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    await server.connect(transport);

    httpServer.listen(port, "127.0.0.1", () => {
      console.error(
        `MCP server running on http://127.0.0.1:${port}/mcp (Streamable HTTP)`,
      );
    });

    // Graceful shutdown
    const shutdown = (): void => {
      console.error("Shutting down MCP server...");
      httpServer.close();
      void server.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
