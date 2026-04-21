/**
 * Tool Classification — Formal categorization of tools for runtime guardrails.
 *
 * This module provides the classification layer that preActionCheck() and
 * validateBeforeSend() use to determine which rules apply to each tool.
 *
 * Categories are NOT mutually exclusive — a tool can be in multiple categories.
 * For example, `make_phone_call` is both EXTERNAL_COMM and HIGH_RISK.
 *
 * Design: These sets are the single source of truth for tool classification.
 * When a new tool is added, it should be classified here.
 */

// ─── External Communication Tools ────────────────────────────────────────
// Tools that send messages or make contact with external parties (clients, providers).
// Subject to: kill switches, rate limits, shadow simulation, ownership validation.

export const EXTERNAL_COMM_TOOLS = new Set([
  "send_whatsapp",
  "send_sms",
  "send_telegram",
  "send_email_transactional",
  "make_phone_call",
  "draft_and_send",
  "speak_with_voice",
]);

// ─── Read-Only Tools ─────────────────────────────────────────────────────
// Tools that only read data, never mutate state or communicate externally.
// Safe to execute in ANY mode, including dry-run and read-only.

export const READ_ONLY_TOOLS = new Set([
  // Email reads
  "search_emails",
  "get_stats",
  // Invoice reads
  "list_invoices",
  "find_invoices_smart",
  "get_overdue_invoices",
  "get_iva_quarterly",
  // Calendar / Tasks reads
  "list_upcoming_events",
  "list_tasks",
  // Search
  "smart_search",
  "web_search",
  "web_read_page",
  // Memory / Knowledge reads
  "memory_search",
  "knowledge_search",
  // Contact reads
  "contact_intelligence",
  // Channels status
  "get_channels_status",
  // Energy market reads
  "get_omie_spot",
  "get_omip_futures",
  "get_pvpc_prices",
  "compare_tariffs",
  "search_tariffs",
  "analyze_consumption",
  "get_market_briefing",
  // Analytics / BI reads
  "get_agent_performance",
  "get_all_agent_performance",
  "generate_weekly_status",
  // OCR (reads image, doesn't mutate)
  "ocr_scan_document",
  // BOE / AEAT searches
  "search_boe",
  "search_aeat",
  "search_energy_tariffs",
  "search_company",
  "search_industry_news",
]);

// ─── Mutation Tools ──────────────────────────────────────────────────────
// Tools that write, update, or delete data but do NOT communicate externally.
// Blocked in read-only mode, simulated in dry-run mode.

export const MUTATION_TOOLS = new Set([
  // Email mutations
  "create_draft",
  "bulk_categorize",
  "create_email_rule",
  "delete_email_rule",
  // Calendar mutations
  "create_calendar_event",
  // Task mutations
  "create_task",
  // Invoice mutations
  "update_invoice",
  // Memory mutations
  "memory_add",
  "memory_delete",
  "memory_star",
  // Image generation (creates artifact)
  "generate_image_ai",
  // Self-improve (writes corrections)
  "record_correction",
  // Savings report (generates report artifact)
  "generate_savings_report",
]);

// ─── Sensitive Send Tools ────────────────────────────────────────────────
// Subset of external comm tools that involve legal, financial, or contractual content.
// In guarded mode, these require extra validation via validateBeforeSend().
// TODO Phase 2: Detect from document content, not just tool name.

export const SENSITIVE_SEND_TOOLS = new Set([
  "draft_and_send",           // Sends actual email (not just draft)
  "send_email_transactional", // Transactional email (invoices, contracts)
]);

// ─── Delegation Tools ────────────────────────────────────────────────────
// Tool names that trigger agent-to-agent delegation.

export const DELEGATION_TOOL_NAMES = new Set([
  "delegate_task",
]);

// ─── Helper Functions ────────────────────────────────────────────────────

/** Tool only reads data — safe in all modes */
export function isReadOnlyTool(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(toolName);
}

/** Tool mutates state (writes, creates, deletes) */
export function isMutationTool(toolName: string): boolean {
  return MUTATION_TOOLS.has(toolName);
}

/** Tool sends external communication */
export function isExternalCommTool(toolName: string): boolean {
  return EXTERNAL_COMM_TOOLS.has(toolName);
}

/** Tool involves sending sensitive/legal content */
export function isSensitiveSendTool(toolName: string): boolean {
  return SENSITIVE_SEND_TOOLS.has(toolName);
}

/** Tool triggers delegation */
export function isDelegationTool(toolName: string): boolean {
  return DELEGATION_TOOL_NAMES.has(toolName);
}

/**
 * Get the effective action category for a tool.
 * Used by preActionCheck to determine which rules to apply.
 *
 * Priority: external_comm > mutation > read (if somehow in multiple)
 */
export function getToolCategory(toolName: string): "external_comm" | "mutation" | "read" | "unknown" {
  if (EXTERNAL_COMM_TOOLS.has(toolName)) return "external_comm";
  if (MUTATION_TOOLS.has(toolName)) return "mutation";
  if (READ_ONLY_TOOLS.has(toolName)) return "read";
  return "unknown"; // Unclassified tools treated as mutations for safety
}
