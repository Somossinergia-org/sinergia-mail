/**
 * Audit Module — Public API
 *
 * Usage:
 *   import { auditLog, validateAndAuditToolAccess, ... } from "@/lib/audit";
 */

// Types
export type {
  AuditEvent,
  AuditEventInput,
  AuditEventType,
  AuditEventResult,
  AuditAgentLayer,
  AuditQueryFilter,
  TimelineEntry,
} from "./types";

// Logger (singleton)
export { auditLog, AuditLogger, type AuditLoggerConfig } from "./logger";

// Store (adapter interface + implementations)
export { type AuditStore, MemoryAuditStore } from "./store";
export { DatabaseAuditStore } from "./db-store";
export { DualAuditStore } from "./dual-store";

// Governance validators
export {
  validateAndAuditToolAccess,
  validateSingleVoice,
  validateOwnerAssignment,
  auditExternalMessage,
  type GovernanceCheckResult,
} from "./governance";
