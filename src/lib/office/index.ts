/**
 * Office State Module — Public API
 *
 * Usage:
 *   import { buildOfficeState, buildFallbackState, type OfficeStateSnapshot } from "@/lib/office";
 */

// Types
export type {
  OfficeAgentState,
  OfficeAgentStatus,
  OfficeAgentLayer,
  OfficeDelegation,
  OfficeActivityEntry,
  OfficeActiveCase,
  OfficeStateSnapshot,
} from "./types";

// Builder
export {
  buildOfficeState,
  buildFallbackState,
  deriveAgentStatus,
  extractDelegations,
  buildActivityFeed,
  AGENT_LAYER_MAP,
  ALL_AGENT_IDS,
  type BuildOfficeStateInput,
} from "./state-builder";

// Stream events (diff + SSE)
export {
  diffOfficeState,
  serializeSSE,
  serializeHeartbeat,
  serializeSnapshot,
  serializeError,
  type OfficeStreamEvent,
  type OfficeStreamEventType,
} from "./stream-events";
