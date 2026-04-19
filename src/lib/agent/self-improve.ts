/**
 * Agent Self-Improvement System
 *
 * Continuously monitors agent performance, researches new AI techniques,
 * and applies optimizations automatically.
 *
 * Features:
 *  1. Performance tracking per agent (success rate, speed, user satisfaction)
 *  2. AI research: searches for new techniques, tools, and best practices
 *  3. Prompt optimization: analyzes what prompts work best
 *  4. Learning from corrections: when user corrects an agent, it adapts
 *  5. Cross-agent knowledge sharing: discoveries benefit all agents
 *  6. Weekly improvement report for the CEO
 */

import { webSearch } from "./web-search";
import { recordEpisode, getEpisodes } from "./memory-engine";
import { db, schema } from "@/db";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "self-improve" });

// ─── Types ──────────────────────────────────────────────────────────────

export interface AgentPerformanceMetrics {
  agentId: string;
  period: string; // "2026-04-19" or "2026-W16"
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  avgDurationMs: number;
  avgTokensUsed: number;
  toolsUsed: Record<string, number>;
  delegationsMade: number;
  delegationsReceived: number;
  userCorrections: number;
  successRate: number;
  efficiency: number; // tokens per successful task
}

export interface ImprovementSuggestion {
  id: string;
  agentId: string;
  type: "prompt_optimization" | "tool_addition" | "workflow_change" | "knowledge_update" | "model_change";
  title: string;
  description: string;
  expectedImpact: "low" | "medium" | "high";
  source: "performance_analysis" | "ai_research" | "user_feedback" | "cross_agent";
  applied: boolean;
  createdAt: string;
}

export interface AIResearchFinding {
  topic: string;
  summary: string;
  relevance: string;
  actionable: boolean;
  source: string;
  date: string;
}

// ─── Performance Tracking ───────────────────────────────────────────────

/**
 * Calculate performance metrics for an agent over a time period.
 */
export async function getAgentPerformance(
  userId: string,
  agentId: string,
  days: number = 7,
): Promise<AgentPerformanceMetrics> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const logs = await db
      .select()
      .from(schema.agentLogs)
      .where(
        and(
          eq(schema.agentLogs.userId, userId),
          sql`${schema.agentLogs.action} LIKE ${"swarm:" + agentId + "%"}`,
          gte(schema.agentLogs.createdAt, since),
        ),
      )
      .orderBy(desc(schema.agentLogs.createdAt))
      .limit(500);

    const totalCalls = logs.length;
    const successfulCalls = logs.filter((l) => l.success).length;
    const failedCalls = totalCalls - successfulCalls;
    const avgDuration = totalCalls > 0
      ? logs.reduce((sum, l) => sum + (l.durationMs || 0), 0) / totalCalls
      : 0;
    const avgTokens = totalCalls > 0
      ? logs.reduce((sum, l) => sum + (l.tokensUsed || 0), 0) / totalCalls
      : 0;

    // Parse tool usage from log summaries
    const toolsUsed: Record<string, number> = {};
    for (const l of logs) {
      const toolMatch = l.inputSummary?.match(/tools=(\d+)/);
      if (toolMatch) {
        const count = parseInt(toolMatch[1], 10);
        toolsUsed["total"] = (toolsUsed["total"] || 0) + count;
      }
    }

    // Count delegations
    const delegationsMade = logs.filter(
      (l) => l.inputSummary?.includes("delegations=") &&
        !l.inputSummary?.includes("delegations=0"),
    ).length;

    return {
      agentId,
      period: `last_${days}_days`,
      totalCalls,
      successfulCalls,
      failedCalls,
      avgDurationMs: Math.round(avgDuration),
      avgTokensUsed: Math.round(avgTokens),
      toolsUsed,
      delegationsMade,
      delegationsReceived: 0, // Would need reverse query
      userCorrections: 0, // From memory episodes
      successRate: totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 100,
      efficiency: successfulCalls > 0 ? Math.round(avgTokens / (successfulCalls / totalCalls)) : 0,
    };
  } catch (err) {
    logError(log, err, { userId, agentId }, "performance metrics failed");
    return {
      agentId,
      period: `last_${days}_days`,
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      avgDurationMs: 0,
      avgTokensUsed: 0,
      toolsUsed: {},
      delegationsMade: 0,
      delegationsReceived: 0,
      userCorrections: 0,
      successRate: 100,
      efficiency: 0,
    };
  }
}

/**
 * Get performance for all agents.
 */
export async function getAllAgentPerformance(
  userId: string,
  days: number = 7,
): Promise<AgentPerformanceMetrics[]> {
  const agentIds = [
    "ceo", "email-manager", "fiscal-controller", "calendar-assistant",
    "crm-director", "energy-analyst", "automation-engineer", "legal-rgpd",
    "marketing-director", "web-master",
  ];

  return Promise.all(agentIds.map((id) => getAgentPerformance(userId, id, days)));
}

// ─── AI Research ────────────────────────────────────────────────────────

/**
 * Research latest AI techniques relevant to our agent system.
 */
export async function researchAITechniques(): Promise<AIResearchFinding[]> {
  const findings: AIResearchFinding[] = [];
  const today = new Date().toISOString().slice(0, 10);

  const researchTopics = [
    {
      query: "GPT function calling best practices multi-agent 2025 2026",
      topic: "Multi-agent orchestration",
    },
    {
      query: "AI agent memory retrieval augmented generation RAG 2025 2026",
      topic: "RAG y memoria semántica",
    },
    {
      query: "AI email automation classification CRM best practices",
      topic: "Automatización email con IA",
    },
    {
      query: "AI invoice processing OCR extraction accuracy improvement",
      topic: "Procesamiento de facturas IA",
    },
    {
      query: "AI energy market prediction electricity price forecasting",
      topic: "Predicción precios energía con IA",
    },
    {
      query: "prompt engineering optimization enterprise agents 2025 2026",
      topic: "Optimización de prompts",
    },
  ];

  for (const topic of researchTopics) {
    try {
      const results = await webSearch(topic.query, 3);
      for (const r of results.slice(0, 1)) {
        findings.push({
          topic: topic.topic,
          summary: r.snippet.slice(0, 200),
          relevance: topic.topic,
          actionable: true,
          source: r.url,
          date: today,
        });
      }
    } catch {
      // Skip failed searches
    }
  }

  return findings;
}

// ─── Improvement Suggestions ────────────────────────────────────────────

/**
 * Analyze agent performance and generate improvement suggestions.
 */
export async function generateImprovements(
  userId: string,
): Promise<ImprovementSuggestion[]> {
  const suggestions: ImprovementSuggestion[] = [];
  const performance = await getAllAgentPerformance(userId, 7);
  const today = new Date().toISOString().slice(0, 10);

  for (const perf of performance) {
    // Low success rate
    if (perf.totalCalls > 5 && perf.successRate < 80) {
      suggestions.push({
        id: `${perf.agentId}-success-${today}`,
        agentId: perf.agentId,
        type: "prompt_optimization",
        title: `Mejorar tasa de éxito de ${perf.agentId}`,
        description: `Tasa de éxito: ${perf.successRate}%. Revisar prompt del sistema y herramientas disponibles.`,
        expectedImpact: "high",
        source: "performance_analysis",
        applied: false,
        createdAt: today,
      });
    }

    // High token usage (inefficient)
    if (perf.avgTokensUsed > 3000 && perf.totalCalls > 5) {
      suggestions.push({
        id: `${perf.agentId}-tokens-${today}`,
        agentId: perf.agentId,
        type: "prompt_optimization",
        title: `Reducir consumo de tokens de ${perf.agentId}`,
        description: `Media: ${perf.avgTokensUsed} tokens/llamada. Optimizar prompt para ser más conciso.`,
        expectedImpact: "medium",
        source: "performance_analysis",
        applied: false,
        createdAt: today,
      });
    }

    // Slow response
    if (perf.avgDurationMs > 15000 && perf.totalCalls > 5) {
      suggestions.push({
        id: `${perf.agentId}-speed-${today}`,
        agentId: perf.agentId,
        type: "model_change",
        title: `Acelerar ${perf.agentId}`,
        description: `Tiempo medio: ${Math.round(perf.avgDurationMs / 1000)}s. Considerar modelo más rápido (GPT-4o-mini) para este agente.`,
        expectedImpact: "medium",
        source: "performance_analysis",
        applied: false,
        createdAt: today,
      });
    }

    // Too many delegations (agent can't handle its domain)
    if (perf.delegationsMade > perf.totalCalls * 0.5 && perf.totalCalls > 10) {
      suggestions.push({
        id: `${perf.agentId}-delegation-${today}`,
        agentId: perf.agentId,
        type: "knowledge_update",
        title: `Ampliar conocimiento de ${perf.agentId}`,
        description: `Delega el ${Math.round(perf.delegationsMade / perf.totalCalls * 100)}% de las tareas. Necesita más herramientas o conocimiento.`,
        expectedImpact: "high",
        source: "performance_analysis",
        applied: false,
        createdAt: today,
      });
    }
  }

  // Add research-based suggestions
  try {
    const aiFindings = await researchAITechniques();
    for (const finding of aiFindings.slice(0, 3)) {
      suggestions.push({
        id: `research-${finding.topic.replace(/\s/g, "-")}-${today}`,
        agentId: "ceo",
        type: "knowledge_update",
        title: `Nueva técnica: ${finding.topic}`,
        description: finding.summary,
        expectedImpact: "medium",
        source: "ai_research",
        applied: false,
        createdAt: today,
      });
    }
  } catch {
    // Skip research failures
  }

  return suggestions;
}

// ─── Learning from Corrections ──────────────────────────────────────────

/**
 * Record when the user corrects an agent's behavior.
 * This helps the agent learn and improve over time.
 */
export function recordCorrection(
  userId: string,
  agentId: string,
  originalResponse: string,
  correction: string,
  context: string,
): void {
  recordEpisode(userId, {
    type: "insight",
    summary: `CORRECCIÓN [${agentId}]: El usuario corrigió: "${correction.slice(0, 200)}". Respuesta original: "${originalResponse.slice(0, 100)}". Contexto: ${context.slice(0, 100)}`,
    details: { agentId, type: "user_correction", originalResponse: originalResponse.slice(0, 500), correction, context },
    importance: 9,
    timestamp: Date.now(),
  });

  log.info({ userId, agentId, correction: correction.slice(0, 100) }, "user correction recorded");
}

// ─── Weekly Improvement Report ──────────────────────────────────────────

/**
 * Generate a weekly improvement report for the CEO/user.
 */
export async function generateWeeklyReport(userId: string): Promise<string> {
  const performance = await getAllAgentPerformance(userId, 7);
  const suggestions = await generateImprovements(userId);
  const episodes = getEpisodes(userId, 50);

  const parts: string[] = [];
  parts.push("═══ INFORME SEMANAL DE RENDIMIENTO IA ═══\n");

  // Overall stats
  const totalCalls = performance.reduce((sum, p) => sum + p.totalCalls, 0);
  const totalSuccess = performance.reduce((sum, p) => sum + p.successfulCalls, 0);
  const avgSuccess = totalCalls > 0 ? Math.round((totalSuccess / totalCalls) * 100) : 100;
  const totalTokens = performance.reduce((sum, p) => sum + p.avgTokensUsed * p.totalCalls, 0);

  parts.push(`RESUMEN GENERAL:`);
  parts.push(`  Total interacciones: ${totalCalls}`);
  parts.push(`  Tasa de éxito global: ${avgSuccess}%`);
  parts.push(`  Tokens consumidos: ${totalTokens.toLocaleString()}`);
  parts.push("");

  // Per-agent breakdown
  parts.push("RENDIMIENTO POR AGENTE:");
  for (const perf of performance.sort((a, b) => b.totalCalls - a.totalCalls)) {
    if (perf.totalCalls === 0) continue;
    const emoji = perf.successRate >= 90 ? "✅" : perf.successRate >= 70 ? "⚠️" : "❌";
    parts.push(`  ${emoji} ${perf.agentId}: ${perf.totalCalls} llamadas, ${perf.successRate}% éxito, ${Math.round(perf.avgDurationMs / 1000)}s medio`);
  }
  parts.push("");

  // Decisions recorded
  const decisions = episodes.filter((e) => e.type === "decision");
  if (decisions.length > 0) {
    parts.push("DECISIONES DE NEGOCIO REGISTRADAS:");
    for (const d of decisions.slice(-5)) {
      parts.push(`  📌 ${d.summary.slice(0, 150)}`);
    }
    parts.push("");
  }

  // Improvement suggestions
  if (suggestions.length > 0) {
    parts.push("MEJORAS SUGERIDAS:");
    for (const s of suggestions.slice(0, 5)) {
      parts.push(`  💡 [${s.expectedImpact.toUpperCase()}] ${s.title}: ${s.description.slice(0, 100)}`);
    }
    parts.push("");
  }

  // Escalations
  const escalations = episodes.filter((e) => e.summary.includes("→"));
  if (escalations.length > 0) {
    parts.push(`ESCALACIONES: ${escalations.length} esta semana`);
    for (const esc of escalations.slice(-3)) {
      parts.push(`  🔔 ${esc.summary.slice(0, 120)}`);
    }
  }

  return parts.join("\n");
}
