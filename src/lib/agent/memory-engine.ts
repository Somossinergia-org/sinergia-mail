/**
 * Persistent Memory Engine for Sinergia AI Swarm
 *
 * Layers:
 *   1. Short-term memory: last 50 conversation turns (in-memory + DB)
 *   2. Long-term memory: semantic search via pgvector (memorySources)
 *   3. Episodic memory: key events (deals, decisions, preferences)
 *   4. Working memory: current task context
 *
 * Features:
 *   - Auto-summarization when conversation > 20 messages
 *   - Preference learning: detects user patterns
 *   - Memory consolidation: merges related memories periodically
 */

import { db, schema } from "@/db";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { embed, searchMemory, addSource, chunkText } from "@/lib/memory";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "memory-engine" });

// ─── Types ───────────────────────────────────────────────────────────────

export interface ConversationTurn {
  role: "user" | "assistant" | "system";
  content: string;
  agentId?: string;
  timestamp: number;
  toolCalls?: Array<{ name: string; result: string }>;
}

export interface EpisodicMemory {
  id: string;
  type: "deal_closed" | "decision" | "preference" | "milestone" | "conflict" | "insight";
  summary: string;
  details: Record<string, unknown>;
  importance: number; // 1-10
  timestamp: number;
}

export interface UserPreference {
  key: string;
  value: string;
  confidence: number; // 0-1
  detectedAt: number;
  examples: string[];
}

export interface WorkingMemory {
  currentTask: string | null;
  activeAgentId: string | null;
  pendingDelegations: string[];
  contextSummary: string | null;
  startedAt: number | null;
}

export interface MemorySnapshot {
  shortTerm: ConversationTurn[];
  relevantLongTerm: Array<{ title: string; content: string; similarity: number }>;
  episodic: EpisodicMemory[];
  preferences: UserPreference[];
  working: WorkingMemory;
  tokenEstimate: number;
}

// ─── In-Memory Stores (per-user) ─────────────────────────────────────────

const SHORT_TERM_LIMIT = 50;
const SUMMARIZE_THRESHOLD = 20;

// userId -> conversation turns
const shortTermStore: Map<string, ConversationTurn[]> = new Map();
// userId -> episodic memories
const episodicStore: Map<string, EpisodicMemory[]> = new Map();
// userId -> detected preferences
const preferenceStore: Map<string, UserPreference[]> = new Map();
// userId -> working memory
const workingMemoryStore: Map<string, WorkingMemory> = new Map();
// userId -> conversation summaries (older compressed context)
const summaryStore: Map<string, string[]> = new Map();

// ─── Short-Term Memory ──────────────────────────────────────────────────

/**
 * Add a conversation turn to short-term memory.
 * When exceeding SHORT_TERM_LIMIT, oldest messages are evicted.
 * When exceeding SUMMARIZE_THRESHOLD, older messages are summarized.
 */
export function addToShortTerm(userId: string, turn: ConversationTurn): void {
  let turns = shortTermStore.get(userId);
  if (!turns) {
    turns = [];
    shortTermStore.set(userId, turns);
  }
  turns.push(turn);

  // Auto-summarize if we have too many messages
  if (turns.length > SUMMARIZE_THRESHOLD) {
    triggerAutoSummarize(userId).catch((e) =>
      logError(log, e, { userId }, "auto-summarize failed"),
    );
  }

  // Hard limit: evict oldest
  if (turns.length > SHORT_TERM_LIMIT) {
    const evicted = turns.splice(0, turns.length - SHORT_TERM_LIMIT);
    log.debug({ userId, evicted: evicted.length }, "short-term memory eviction");
  }
}

/**
 * Get the short-term conversation history for a user.
 */
export function getShortTerm(userId: string): ConversationTurn[] {
  return shortTermStore.get(userId) || [];
}

/**
 * Clear short-term memory for a user.
 */
export function clearShortTerm(userId: string): void {
  shortTermStore.delete(userId);
  summaryStore.delete(userId);
}

/**
 * Get conversation summaries (compressed older context).
 */
export function getSummaries(userId: string): string[] {
  return summaryStore.get(userId) || [];
}

// ─── Auto-Summarization ─────────────────────────────────────────────────

/**
 * Summarize older messages when the conversation gets long.
 * Keeps the last 10 messages intact and summarizes the rest.
 */
async function triggerAutoSummarize(userId: string): Promise<void> {
  const turns = shortTermStore.get(userId);
  if (!turns || turns.length <= SUMMARIZE_THRESHOLD) return;

  const keepRecent = 10;
  const toSummarize = turns.slice(0, turns.length - keepRecent);

  if (toSummarize.length < 5) return; // Not enough to summarize

  // Build summary text from the messages to compress
  const summaryInput = toSummarize
    .map((t) => `[${t.role}${t.agentId ? ` (${t.agentId})` : ""}]: ${t.content.slice(0, 200)}`)
    .join("\n");

  const summary = `RESUMEN DE CONVERSACION PREVIA (${toSummarize.length} mensajes, ${new Date(toSummarize[0].timestamp).toISOString().slice(0, 16)} - ${new Date(toSummarize[toSummarize.length - 1].timestamp).toISOString().slice(0, 16)}):\n` +
    `Temas tratados: ${extractTopics(toSummarize).join(", ")}\n` +
    `Acciones realizadas: ${extractActions(toSummarize).join(", ") || "ninguna"}\n` +
    `Contexto clave: ${summaryInput.slice(0, 500)}`;

  // Store summary
  let summaries = summaryStore.get(userId);
  if (!summaries) {
    summaries = [];
    summaryStore.set(userId, summaries);
  }
  summaries.push(summary);

  // Keep only last 5 summaries
  if (summaries.length > 5) {
    summaries.splice(0, summaries.length - 5);
  }

  // Remove summarized turns, keep recent
  const recent = turns.slice(turns.length - keepRecent);
  shortTermStore.set(userId, recent);

  log.info({ userId, summarized: toSummarize.length, kept: recent.length }, "auto-summarized conversation");
}

function extractTopics(turns: ConversationTurn[]): string[] {
  const topicPatterns: Array<[RegExp, string]> = [
    [/factura|invoice|iva|gasto/i, "facturas"],
    [/email|correo|bandeja/i, "emails"],
    [/calendario|evento|reunion/i, "calendario"],
    [/contacto|cliente|proveedor/i, "contactos"],
    [/consumo|energia|potencia/i, "energia"],
    [/regla|automatiz/i, "automatizacion"],
    [/memoria|recuerda|apunta/i, "memoria"],
  ];

  const found = new Set<string>();
  for (const turn of turns) {
    for (const [pattern, topic] of topicPatterns) {
      if (pattern.test(turn.content)) {
        found.add(topic);
      }
    }
  }
  return Array.from(found);
}

function extractActions(turns: ConversationTurn[]): string[] {
  const actions: string[] = [];
  for (const turn of turns) {
    if (turn.toolCalls) {
      for (const tc of turn.toolCalls) {
        actions.push(tc.name);
      }
    }
  }
  return Array.from(new Set(actions));
}

// ─── Long-Term Memory (via pgvector) ─────────────────────────────────────

/**
 * Search long-term memory for relevant context given a query.
 */
export async function searchLongTerm(
  userId: string,
  query: string,
  limit: number = 5,
): Promise<Array<{ title: string; content: string; similarity: number; kind: string }>> {
  try {
    const results = await searchMemory(userId, query, { limit });
    return results.map((r) => ({
      title: r.title,
      content: r.content,
      similarity: r.similarity,
      kind: r.kind,
    }));
  } catch (e) {
    logError(log, e, { userId }, "long-term search failed");
    return [];
  }
}

/**
 * Persist an important conversation or insight to long-term memory.
 */
export async function persistToLongTerm(
  userId: string,
  title: string,
  content: string,
  kind: "note" | "email" | "invoice" | "contact" = "note",
  tags?: string[],
): Promise<number[]> {
  try {
    const result = await addSource({
      userId,
      kind,
      title,
      content,
      tags,
    });
    log.info({ userId, title, chunks: result.ids.length }, "persisted to long-term memory");
    return result.ids;
  } catch (e) {
    logError(log, e, { userId, title }, "persist to long-term failed");
    return [];
  }
}

// ─── Episodic Memory ─────────────────────────────────────────────────────

/**
 * Record a significant event (deal closed, decision made, preference detected).
 */
export function recordEpisode(userId: string, episode: Omit<EpisodicMemory, "id">): void {
  let episodes = episodicStore.get(userId);
  if (!episodes) {
    episodes = [];
    episodicStore.set(userId, episodes);
  }

  const id = `ep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  episodes.push({ ...episode, id });

  // Keep only last 100 episodes
  if (episodes.length > 100) {
    episodes.splice(0, episodes.length - 100);
  }

  // Also persist high-importance episodes to long-term memory
  if (episode.importance >= 7) {
    persistToLongTerm(
      userId,
      `[Episodio] ${episode.type}: ${episode.summary}`,
      JSON.stringify(episode.details),
      "note",
      ["episodic", episode.type],
    ).catch((e) => logError(log, e, { userId }, "episodic persist failed"));
  }

  log.info({ userId, type: episode.type, importance: episode.importance }, "episode recorded");
}

/**
 * Get recent episodic memories for a user.
 */
export function getEpisodes(userId: string, limit: number = 20): EpisodicMemory[] {
  const episodes = episodicStore.get(userId) || [];
  return episodes.slice(-limit);
}

// ─── Preference Learning ─────────────────────────────────────────────────

const PREFERENCE_PATTERNS: Array<{
  key: string;
  detect: (content: string) => string | null;
}> = [
  {
    key: "communication_tone",
    detect: (c) => {
      if (/formal|usted|estimad/i.test(c)) return "formal";
      if (/informal|tu |colega|tio/i.test(c)) return "informal";
      return null;
    },
  },
  {
    key: "preferred_channel",
    detect: (c) => {
      if (/whatsapp/i.test(c)) return "whatsapp";
      if (/email|correo/i.test(c)) return "email";
      if (/telegram/i.test(c)) return "telegram";
      return null;
    },
  },
  {
    key: "response_length",
    detect: (c) => {
      if (/breve|corto|resumen|rapido/i.test(c)) return "short";
      if (/detalle|completo|extenso|explica/i.test(c)) return "detailed";
      return null;
    },
  },
  {
    key: "language_formality",
    detect: (c) => {
      if (/por favor.*gracias/i.test(c)) return "very_polite";
      if (/hazlo ya|rapido|urgente/i.test(c)) return "direct";
      return null;
    },
  },
  {
    key: "time_preference",
    detect: (c) => {
      if (/manana|por la manana|temprano/i.test(c)) return "morning";
      if (/tarde|despues de comer/i.test(c)) return "afternoon";
      return null;
    },
  },
];

/**
 * Analyze a user message for preference signals and store them.
 */
export function detectPreferences(userId: string, content: string): UserPreference[] {
  const detected: UserPreference[] = [];

  for (const pattern of PREFERENCE_PATTERNS) {
    const value = pattern.detect(content);
    if (!value) continue;

    let prefs = preferenceStore.get(userId);
    if (!prefs) {
      prefs = [];
      preferenceStore.set(userId, prefs);
    }

    const existing = prefs.find((p) => p.key === pattern.key);
    if (existing) {
      if (existing.value === value) {
        // Same preference seen again: increase confidence
        existing.confidence = Math.min(1, existing.confidence + 0.1);
        existing.examples.push(content.slice(0, 100));
        if (existing.examples.length > 5) existing.examples.shift();
      } else {
        // Different preference: decrease old confidence, maybe switch
        existing.confidence -= 0.2;
        if (existing.confidence <= 0.3) {
          existing.value = value;
          existing.confidence = 0.4;
          existing.examples = [content.slice(0, 100)];
          existing.detectedAt = Date.now();
        }
      }
    } else {
      const newPref: UserPreference = {
        key: pattern.key,
        value,
        confidence: 0.4,
        detectedAt: Date.now(),
        examples: [content.slice(0, 100)],
      };
      prefs.push(newPref);
      detected.push(newPref);
    }
  }

  return detected;
}

/**
 * Get all detected preferences for a user.
 */
export function getPreferences(userId: string): UserPreference[] {
  return (preferenceStore.get(userId) || []).filter((p) => p.confidence >= 0.3);
}

/**
 * Manually store a user preference.
 */
export function setPreference(userId: string, key: string, value: string): void {
  let prefs = preferenceStore.get(userId);
  if (!prefs) {
    prefs = [];
    preferenceStore.set(userId, prefs);
  }

  const existing = prefs.find((p) => p.key === key);
  if (existing) {
    existing.value = value;
    existing.confidence = 1.0;
    existing.detectedAt = Date.now();
  } else {
    prefs.push({
      key,
      value,
      confidence: 1.0,
      detectedAt: Date.now(),
      examples: ["set manually"],
    });
  }

  // Record as episode
  recordEpisode(userId, {
    type: "preference",
    summary: `Preferencia establecida: ${key} = ${value}`,
    details: { key, value },
    importance: 5,
    timestamp: Date.now(),
  });
}

// ─── Working Memory ──────────────────────────────────────────────────────

/**
 * Set the current working context (what the agent is doing right now).
 */
export function setWorkingMemory(userId: string, update: Partial<WorkingMemory>): void {
  const current = workingMemoryStore.get(userId) || {
    currentTask: null,
    activeAgentId: null,
    pendingDelegations: [],
    contextSummary: null,
    startedAt: null,
  };
  workingMemoryStore.set(userId, { ...current, ...update });
}

/**
 * Get the current working memory.
 */
export function getWorkingMemory(userId: string): WorkingMemory {
  return workingMemoryStore.get(userId) || {
    currentTask: null,
    activeAgentId: null,
    pendingDelegations: [],
    contextSummary: null,
    startedAt: null,
  };
}

/**
 * Clear working memory after task completion.
 */
export function clearWorkingMemory(userId: string): void {
  workingMemoryStore.delete(userId);
}

// ─── Full Memory Snapshot ────────────────────────────────────────────────

/**
 * Build a complete memory snapshot for the agent's context window.
 * Includes all memory layers, with token estimation.
 */
export async function buildMemorySnapshot(
  userId: string,
  currentQuery: string,
): Promise<MemorySnapshot> {
  const shortTerm = getShortTerm(userId);
  const summaries = getSummaries(userId);
  const episodic = getEpisodes(userId, 10);
  const preferences = getPreferences(userId);
  const working = getWorkingMemory(userId);

  // Search long-term memory for relevant context
  let relevantLongTerm: Array<{ title: string; content: string; similarity: number }> = [];
  try {
    const ltResults = await searchLongTerm(userId, currentQuery, 5);
    relevantLongTerm = ltResults
      .filter((r) => r.similarity > 0.3)
      .map((r) => ({ title: r.title, content: r.content.slice(0, 500), similarity: r.similarity }));
  } catch (e) {
    logError(log, e, { userId }, "memory snapshot: long-term search failed");
  }

  // Estimate token usage for the memory context
  const shortTermText = shortTerm.map((t) => t.content).join(" ");
  const summaryText = summaries.join(" ");
  const ltText = relevantLongTerm.map((r) => r.content).join(" ");
  const episodicText = episodic.map((e) => e.summary).join(" ");
  const prefText = preferences.map((p) => `${p.key}=${p.value}`).join(" ");
  const allText = [shortTermText, summaryText, ltText, episodicText, prefText].join(" ");
  // Rough estimate: 1 token per 4 characters for Spanish
  const tokenEstimate = Math.ceil(allText.length / 4);

  return {
    shortTerm,
    relevantLongTerm,
    episodic,
    preferences,
    working,
    tokenEstimate,
  };
}

/**
 * Format memory snapshot as a context string for injection into the system prompt.
 */
export function formatMemoryContext(snapshot: MemorySnapshot): string {
  const parts: string[] = [];

  // Summaries of older conversations
  const summaries = getSummariesFromSnapshot(snapshot);
  if (summaries.length > 0) {
    parts.push("=== HISTORIAL RESUMIDO ===\n" + summaries.join("\n"));
  }

  // Recent conversation context
  if (snapshot.shortTerm.length > 0) {
    const recentContext = snapshot.shortTerm
      .slice(-5)
      .map((t) => `[${t.role}]: ${t.content.slice(0, 150)}`)
      .join("\n");
    parts.push("=== CONVERSACION RECIENTE ===\n" + recentContext);
  }

  // Relevant long-term memories
  if (snapshot.relevantLongTerm.length > 0) {
    const ltContext = snapshot.relevantLongTerm
      .map((r) => `- ${r.title} (relevancia: ${Math.round(r.similarity * 100)}%): ${r.content.slice(0, 200)}`)
      .join("\n");
    parts.push("=== MEMORIA A LARGO PLAZO RELEVANTE ===\n" + ltContext);
  }

  // Episodic memories
  if (snapshot.episodic.length > 0) {
    const epContext = snapshot.episodic
      .filter((e) => e.importance >= 6)
      .slice(-5)
      .map((e) => `- [${e.type}] ${e.summary}`)
      .join("\n");
    if (epContext) {
      parts.push("=== EVENTOS IMPORTANTES ===\n" + epContext);
    }
  }

  // User preferences
  if (snapshot.preferences.length > 0) {
    const prefContext = snapshot.preferences
      .filter((p) => p.confidence >= 0.5)
      .map((p) => `- ${p.key}: ${p.value} (confianza: ${Math.round(p.confidence * 100)}%)`)
      .join("\n");
    if (prefContext) {
      parts.push("=== PREFERENCIAS DEL USUARIO ===\n" + prefContext);
    }
  }

  // Working memory
  if (snapshot.working.currentTask) {
    parts.push(`=== TAREA ACTUAL ===\nTrabajando en: ${snapshot.working.currentTask}`);
  }

  return parts.join("\n\n");
}

function getSummariesFromSnapshot(snapshot: MemorySnapshot): string[] {
  // We can't directly access summaryStore from snapshot shape,
  // but we can extract from the short-term messages if they exist
  return [];
}

// ─── Memory Consolidation ────────────────────────────────────────────────

/**
 * Periodic job: merge related memories, prune duplicates,
 * and update importance scores.
 */
export async function consolidateMemory(userId: string): Promise<{
  merged: number;
  pruned: number;
}> {
  let merged = 0;
  let pruned = 0;

  try {
    // 1. Persist high-confidence preferences to long-term
    const prefs = getPreferences(userId).filter((p) => p.confidence >= 0.8);
    for (const pref of prefs) {
      await persistToLongTerm(
        userId,
        `Preferencia: ${pref.key}`,
        `El usuario prefiere ${pref.key} = ${pref.value}. Detectado con ${Math.round(pref.confidence * 100)}% confianza. Ejemplos: ${pref.examples.join("; ")}`,
        "note",
        ["preference", pref.key],
      );
      merged++;
    }

    // 2. Persist important episodic memories
    const episodes = getEpisodes(userId).filter((e) => e.importance >= 7);
    for (const ep of episodes) {
      await persistToLongTerm(
        userId,
        `[${ep.type}] ${ep.summary}`,
        JSON.stringify(ep.details),
        "note",
        ["episodic", ep.type],
      );
      merged++;
    }

    // 3. Prune old short-term conversations that have been summarized
    const summaries = getSummaries(userId);
    if (summaries.length > 3) {
      // Persist oldest summaries to long-term memory, then remove
      for (const summary of summaries.slice(0, summaries.length - 3)) {
        await persistToLongTerm(
          userId,
          "Resumen de conversacion",
          summary,
          "note",
          ["conversation_summary"],
        );
        pruned++;
      }
      const kept = summaries.slice(-3);
      summaryStore.set(userId, kept);
    }

    log.info({ userId, merged, pruned }, "memory consolidation complete");
  } catch (e) {
    logError(log, e, { userId }, "memory consolidation failed");
  }

  return { merged, pruned };
}

// ─── DB Persistence for Conversations ────────────────────────────────────

/**
 * Save conversation history to the agent_logs table for long-term persistence.
 */
export async function persistConversationToDB(
  userId: string,
  turns: ConversationTurn[],
): Promise<void> {
  try {
    const summary = turns
      .slice(-10)
      .map((t) => `[${t.role}]: ${t.content.slice(0, 100)}`)
      .join(" | ");

    await db.insert(schema.agentLogs).values({
      userId,
      action: "conversation_persist",
      inputSummary: `${turns.length} turns`,
      outputSummary: summary.slice(0, 300),
      durationMs: 0,
      success: true,
    });
  } catch (e) {
    logError(log, e, { userId }, "persist conversation to DB failed");
  }
}

/**
 * Load recent conversation context from DB (for session recovery).
 */
export async function loadConversationFromDB(
  userId: string,
  limit: number = 10,
): Promise<ConversationTurn[]> {
  try {
    const recent = await db.query.agentLogs.findMany({
      where: and(
        eq(schema.agentLogs.userId, userId),
        eq(schema.agentLogs.action, "conversation_persist"),
      ),
      orderBy: [desc(schema.agentLogs.createdAt)],
      limit: 1,
    });

    // If we have a recent persisted conversation, parse it
    // For now, return empty array as the primary store is in-memory
    return [];
  } catch (e) {
    logError(log, e, { userId }, "load conversation from DB failed");
    return [];
  }
}
