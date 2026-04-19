import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export interface LoadedAgentConfig {
  agentName: string;
  personality: string;
  customPrompt: string;
  businessContext: string;
  preferredModel: string;
  fineTunedModelId: string | null;
  autoReplies: boolean;
  maxAutoActions: number;
  neverAutoReply: string[];
  alwaysNotify: string[];
  defaultTone: string;
  signatureHtml: string | null;
}

/**
 * Load agent configuration for a user from the database.
 * Returns sensible defaults if no row exists yet.
 * This function should be called by swarm.ts to inject the custom config
 * into the system prompt before every agent invocation.
 */
export async function loadAgentConfig(
  userId: string
): Promise<LoadedAgentConfig> {
  const rows = await db
    .select()
    .from(schema.agentConfig)
    .where(eq(schema.agentConfig.userId, userId))
    .limit(1);

  const row = rows[0];

  if (!row) {
    return {
      agentName: "Sinergia IA",
      personality: "profesional",
      customPrompt: "",
      businessContext: "",
      preferredModel: "auto",
      fineTunedModelId: null,
      autoReplies: false,
      maxAutoActions: 5,
      neverAutoReply: [],
      alwaysNotify: [],
      defaultTone: "profesional",
      signatureHtml: null,
    };
  }

  return {
    agentName: row.agentName ?? "Sinergia IA",
    personality: row.agentPersonality ?? "profesional",
    customPrompt: row.customSystemPrompt ?? "",
    businessContext: row.businessContext ?? "",
    preferredModel: row.preferredModel ?? "auto",
    fineTunedModelId: row.fineTunedModelId ?? null,
    autoReplies: row.autoReplies ?? false,
    maxAutoActions: row.maxAutoActions ?? 5,
    neverAutoReply: (row.neverAutoReply as string[] | null) ?? [],
    alwaysNotify: (row.alwaysNotify as string[] | null) ?? [],
    defaultTone: row.defaultDraftTone ?? "profesional",
    signatureHtml: row.signatureHtml ?? null,
  };
}
