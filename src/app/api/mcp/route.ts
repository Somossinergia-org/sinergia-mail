import { NextRequest, NextResponse } from "next/server";
import { validateToken } from "@/lib/mcp/auth";
import { TOOLS, TOOL_LIST } from "@/lib/mcp/tools";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ route: "/api/mcp" });

/**
 * MCP-compatible JSON-RPC 2.0 server.
 *
 * Implements the minimal MCP spec (2024-11-05):
 *   - initialize
 *   - tools/list
 *   - tools/call
 *
 * Auth: Bearer token in Authorization header (sk_mcp_...). Token management
 * happens in the Sinergia Mail UI → Integraciones tab.
 *
 * Example client (Claude Desktop claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "sinergia": {
 *       "url": "https://sinergia-mail.vercel.app/api/mcp",
 *       "headers": { "Authorization": "Bearer sk_mcp_..." }
 *     }
 *   }
 * }
 */

// ─── JSON-RPC types ──────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

const err = (id: JsonRpcRequest["id"], code: number, message: string, data?: unknown): JsonRpcError => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message, data },
});

const ok = (id: JsonRpcRequest["id"], result: unknown): JsonRpcSuccess => ({
  jsonrpc: "2.0",
  id: id ?? null,
  result,
});

// ─── Handler ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") || "unknown";
  const scopedLog = log.child({ requestId });

  // Auth
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const userId = await validateToken(bearer);

  if (!userId) {
    scopedLog.warn({ hasBearer: !!bearer }, "mcp unauthorized");
    return NextResponse.json(
      err(null, -32001, "Unauthorized: invalid or missing Bearer token"),
      { status: 401 }
    );
  }

  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return NextResponse.json(err(null, -32700, "Parse error"));
  }

  if (body.jsonrpc !== "2.0" || !body.method) {
    return NextResponse.json(err(body.id ?? null, -32600, "Invalid request"));
  }

  scopedLog.info({ method: body.method, userId }, "mcp request");

  try {
    switch (body.method) {
      case "initialize":
        return NextResponse.json(
          ok(body.id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "sinergia-mail", version: "1.0.0" },
          })
        );

      case "tools/list":
        return NextResponse.json(ok(body.id, { tools: TOOL_LIST }));

      case "tools/call": {
        const { name, arguments: args } = (body.params || {}) as {
          name?: string;
          arguments?: Record<string, unknown>;
        };
        if (!name || !(name in TOOLS)) {
          return NextResponse.json(err(body.id, -32602, `Unknown tool: ${name}`));
        }
        const result = await TOOLS[name].handler(userId, args || {});
        return NextResponse.json(
          ok(body.id, {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          })
        );
      }

      default:
        return NextResponse.json(err(body.id, -32601, `Method not found: ${body.method}`));
    }
  } catch (e) {
    logError(scopedLog, e, { method: body.method, userId }, "mcp handler error");
    return NextResponse.json(err(body.id, -32603, "Internal error"));
  }
}

// GET for health-check / discovery (not MCP spec but useful)
export async function GET() {
  return NextResponse.json({
    name: "sinergia-mail-mcp",
    version: "1.0.0",
    protocolVersion: "2024-11-05",
    transports: ["http"],
    toolCount: TOOL_LIST.length,
    docs: "POST JSON-RPC 2.0 to this endpoint with Bearer auth. See UI → Integraciones.",
  });
}
