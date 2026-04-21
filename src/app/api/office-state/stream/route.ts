import { NextRequest } from "next/server";
import { buildOfficeState, buildFallbackState } from "@/lib/office";
import type { OfficeStateSnapshot } from "@/lib/office";
import type { AuditEvent } from "@/lib/audit/types";
import {
  diffOfficeState,
  serializeSSE,
  serializeHeartbeat,
  serializeSnapshot,
  serializeError,
} from "@/lib/office/stream-events";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Pro: 5 min max

/**
 * GET /api/office-state/stream — SSE stream for office real-time updates.
 *
 * Flow:
 *   1. Send initial full snapshot
 *   2. Every 2s: build new snapshot, diff vs previous, emit only changes
 *   3. Every 15s: heartbeat to keep connection alive
 *   4. After maxDuration: close (client reconnects via EventSource)
 *
 * Query params:
 *   ?window=300  — event window in seconds (default 300)
 */
export async function GET(req: NextRequest) {
  const windowSec = parseInt(req.nextUrl.searchParams.get("window") || "300", 10);

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // ── Helper: fetch current snapshot from real sources
      async function fetchSnapshot(): Promise<OfficeStateSnapshot> {
        const since = new Date(Date.now() - windowSec * 1000).toISOString();
        let recentEvents: AuditEvent[] = [];
        let activeCases: Array<{
          id: number | string;
          visibleOwnerId: string | null;
          status: string;
          subject: string | null;
          channel: string | null;
          updatedAt: Date | string | null;
        }> = [];

        try {
          const { auditLog } = await import("@/lib/audit");
          recentEvents = auditLog.query({ since, limit: 100 });
        } catch { /* audit unavailable */ }

        try {
          const { db, schema } = await import("@/db");
          const { inArray } = await import("drizzle-orm");
          const rows = await db
            .select({
              id: schema.cases.id,
              visibleOwnerId: schema.cases.visibleOwnerId,
              status: schema.cases.status,
              subject: schema.cases.subject,
              channel: schema.cases.channel,
              updatedAt: schema.cases.updatedAt,
            })
            .from(schema.cases)
            .where(inArray(schema.cases.status, ["open", "active", "waiting"]))
            .limit(50);

          activeCases = rows.map((r) => ({
            id: r.id,
            visibleOwnerId: r.visibleOwnerId,
            status: r.status,
            subject: r.subject,
            channel: r.channel,
            updatedAt: r.updatedAt,
          }));
        } catch { /* DB unavailable */ }

        return buildOfficeState({ recentEvents, activeCases });
      }

      // ── Helper: safe write
      function write(data: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          closed = true;
        }
      }

      // ── 1. Send initial snapshot
      let prevSnapshot: OfficeStateSnapshot;
      try {
        prevSnapshot = await fetchSnapshot();
        write(serializeSnapshot(prevSnapshot));
      } catch {
        prevSnapshot = buildFallbackState();
        write(serializeSnapshot(prevSnapshot));
        write(serializeError("Failed to load initial state"));
      }

      // ── 2. Poll + diff loop (every 2s)
      let tickCount = 0;
      const pollInterval = setInterval(async () => {
        if (closed) {
          clearInterval(pollInterval);
          return;
        }

        tickCount++;

        // Heartbeat every ~15s (every 7-8 ticks at 2s interval)
        if (tickCount % 7 === 0) {
          write(serializeHeartbeat());
        }

        try {
          const nextSnapshot = await fetchSnapshot();
          const events = diffOfficeState(prevSnapshot, nextSnapshot);

          if (events.length > 0) {
            for (const evt of events) {
              write(serializeSSE(evt));
            }
          }

          prevSnapshot = nextSnapshot;
        } catch {
          // Don't crash the stream on transient errors
        }
      }, 2000);

      // ── 3. Auto-close after maxDuration - 10s safety margin
      const closeTimer = setTimeout(() => {
        closed = true;
        clearInterval(pollInterval);
        try { controller.close(); } catch { /* already closed */ }
      }, (maxDuration - 10) * 1000);

      // ── Cleanup on abort (client disconnect)
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(pollInterval);
        clearTimeout(closeTimer);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
