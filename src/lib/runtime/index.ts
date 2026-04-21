/**
 * Runtime Module — Public API
 *
 * Usage:
 *   import { getRuntimeConfig, preActionCheck, OperationMode } from "@/lib/runtime";
 */

// Config, modes, flags
export {
  OperationMode,
  HIGH_RISK_TOOLS,
  buildRuntimeConfig,
  getRuntimeConfig,
  resetRuntimeConfig,
  setRuntimeConfig,
  isDryRun,
  isShadow,
  isGuarded,
  isProduction,
  isExternalCommsBlocked,
  isChannelBlocked,
  isDelegationBlocked,
  isJuniorDisabled,
  isReadOnly,
  type RuntimeConfig,
  type KillSwitches,
  type RateLimits,
} from "./config";

// Guardrails
export {
  preActionCheck,
  validateBeforeSend,
  runHealthCheck,
  resetCounters,
  type PreActionInput,
  type PreActionResult,
  type PreSendValidation,
  type HealthCheck,
} from "./guardrails";

// Tool classification
export {
  READ_ONLY_TOOLS,
  MUTATION_TOOLS,
  EXTERNAL_COMM_TOOLS,
  SENSITIVE_SEND_TOOLS,
  DELEGATION_TOOL_NAMES,
  isReadOnlyTool,
  isMutationTool,
  isExternalCommTool,
  isSensitiveSendTool,
  isDelegationTool,
  getToolCategory,
} from "./tool-classification";
