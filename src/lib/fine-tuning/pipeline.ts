import { db, schema } from "@/db";
import { eq, and, sql, isNotNull } from "drizzle-orm";
import OpenAI from "openai";

// ═══════ Types ═══════

export interface TrainingExample {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}

const SYSTEM_PROMPT =
  "Eres el asistente IA de Somos Sinergia, empresa de servicios energéticos en Orihuela, España. Gerente: David Miquel Jordá. Respondes en español, de forma profesional pero cercana.";

// Cost per 1K tokens for fine-tuning (training phase)
const COST_PER_1K_TOKENS: Record<string, number> = {
  "gpt-4o-mini-2024-07-18": 0.008,
  "gpt-4o-mini": 0.008,
  "gpt-4o-2024-08-06": 0.08,
  "gpt-4o": 0.08,
};

function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
}

// ═══════ Extract Training Data ═══════

export async function extractTrainingData(userId: string): Promise<{
  drafts: TrainingExample[];
  conversations: TrainingExample[];
  categorizations: TrainingExample[];
  total: number;
}> {
  // 1. Drafts: emails with approved+sent draft responses
  const sentDrafts = await db
    .select({
      emailSubject: schema.emails.subject,
      emailBody: schema.emails.body,
      emailFrom: schema.emails.fromName,
      draftBody: schema.draftResponses.body,
    })
    .from(schema.draftResponses)
    .innerJoin(schema.emails, eq(schema.draftResponses.emailId, schema.emails.id))
    .where(
      and(
        eq(schema.draftResponses.userId, userId),
        eq(schema.draftResponses.status, "sent")
      )
    );

  const drafts: TrainingExample[] = sentDrafts
    .filter((d) => d.emailBody && d.draftBody)
    .map((d) => ({
      messages: [
        { role: "system" as const, content: SYSTEM_PROMPT },
        {
          role: "user" as const,
          content: `Redacta una respuesta profesional a este email:\n\nDe: ${d.emailFrom || "Desconocido"}\nAsunto: ${d.emailSubject || "(sin asunto)"}\n\n${d.emailBody}`,
        },
        { role: "assistant" as const, content: d.draftBody },
      ],
    }));

  // 2. Conversations: user→assistant pairs from agent conversations
  const allConversations = await db
    .select({
      id: schema.agentConversations.id,
      role: schema.agentConversations.role,
      content: schema.agentConversations.content,
      createdAt: schema.agentConversations.createdAt,
    })
    .from(schema.agentConversations)
    .where(eq(schema.agentConversations.userId, userId))
    .orderBy(schema.agentConversations.createdAt);

  const conversations: TrainingExample[] = [];
  for (let i = 0; i < allConversations.length - 1; i++) {
    const current = allConversations[i];
    const next = allConversations[i + 1];
    // user question → assistant answer, where the next message is another user msg
    // (meaning user accepted the answer and continued)
    if (
      current.role === "user" &&
      next.role === "assistant" &&
      current.content &&
      next.content
    ) {
      const hasFollowUp = allConversations[i + 2]?.role === "user";
      if (hasFollowUp) {
        conversations.push({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: current.content },
            { role: "assistant", content: next.content },
          ],
        });
      }
    }
  }

  // 3. Categorizations: emails with AI-assigned category
  const categorizedEmails = await db
    .select({
      subject: schema.emails.subject,
      body: schema.emails.body,
      snippet: schema.emails.snippet,
      category: schema.emails.category,
      priority: schema.emails.priority,
    })
    .from(schema.emails)
    .where(
      and(
        eq(schema.emails.userId, userId),
        isNotNull(schema.emails.category)
      )
    )
    .limit(500);

  const categorizations: TrainingExample[] = categorizedEmails
    .filter((e) => (e.subject || e.snippet) && e.category)
    .map((e) => ({
      messages: [
        {
          role: "system" as const,
          content: `${SYSTEM_PROMPT} Clasifica el siguiente email con categoría y prioridad. Responde SOLO con JSON.`,
        },
        {
          role: "user" as const,
          content: `Asunto: ${e.subject || "(sin asunto)"}\n\n${(e.body || e.snippet || "").slice(0, 1000)}`,
        },
        {
          role: "assistant" as const,
          content: JSON.stringify({
            category: e.category,
            priority: e.priority || "MEDIA",
          }),
        },
      ],
    }));

  return {
    drafts,
    conversations,
    categorizations,
    total: drafts.length + conversations.length + categorizations.length,
  };
}

// ═══════ Generate JSONL Training File ═══════

export async function generateTrainingFile(
  userId: string,
  types: string[]
): Promise<{
  jsonl: string;
  examples: number;
  estimatedCost: string;
}> {
  const data = await extractTrainingData(userId);

  const examples: TrainingExample[] = [];
  if (types.includes("drafts")) examples.push(...data.drafts);
  if (types.includes("conversations")) examples.push(...data.conversations);
  if (types.includes("categorizations")) examples.push(...data.categorizations);

  const jsonl = examples
    .map((ex) => JSON.stringify({ messages: ex.messages }))
    .join("\n");

  // Rough token estimate: ~4 chars per token on average
  const totalChars = jsonl.length;
  const estimatedTokens = Math.ceil(totalChars / 4);
  const costPer1K = COST_PER_1K_TOKENS["gpt-4o-mini"] || 0.008;
  // Training runs ~4 epochs by default
  const estimatedCost = ((estimatedTokens / 1000) * costPer1K * 4).toFixed(2);

  return {
    jsonl,
    examples: examples.length,
    estimatedCost: `~$${estimatedCost} USD`,
  };
}

// ═══════ Upload & Start Fine-Tuning ═══════

export async function startFineTuning(
  userId: string,
  opts: {
    trainingFileContent: string;
    model?: string;
    suffix?: string;
  }
): Promise<{
  jobId: string;
  status: string;
  model: string;
  estimatedTime: string;
}> {
  const openai = getOpenAI();
  const model = opts.model || "gpt-4o-mini-2024-07-18";
  const suffix = opts.suffix || "sinergia";

  // Upload JSONL as a file
  const blob = new Blob([opts.trainingFileContent], { type: "application/jsonl" });
  const file = new File([blob], `sinergia-training-${Date.now()}.jsonl`, {
    type: "application/jsonl",
  });

  const uploaded = await openai.files.create({
    file,
    purpose: "fine-tune",
  });

  // Start fine-tuning job
  const job = await openai.fineTuning.jobs.create({
    training_file: uploaded.id,
    model,
    suffix,
  });

  // Rough time estimate based on example count
  const lines = opts.trainingFileContent.split("\n").filter(Boolean).length;
  let estimatedTime = "15-30 minutos";
  if (lines > 100) estimatedTime = "30-60 minutos";
  if (lines > 500) estimatedTime = "1-3 horas";

  return {
    jobId: job.id,
    status: job.status,
    model: job.model,
    estimatedTime,
  };
}

// ═══════ Check Fine-Tuning Status ═══════

export async function getFineTuningStatus(jobId: string): Promise<{
  id: string;
  status: string;
  model: string;
  fine_tuned_model: string | null;
  trained_tokens: number | null;
  error: string | null;
}> {
  const openai = getOpenAI();
  const job = await openai.fineTuning.jobs.retrieve(jobId);

  return {
    id: job.id,
    status: job.status,
    model: job.model,
    fine_tuned_model: job.fine_tuned_model,
    trained_tokens: job.trained_tokens,
    error: job.error?.message || null,
  };
}

// ═══════ List Fine-Tuning Jobs ═══════

export async function listFineTuningJobs(): Promise<
  Array<{
    id: string;
    status: string;
    model: string;
    fine_tuned_model: string | null;
    created_at: number;
  }>
> {
  const openai = getOpenAI();
  const list = await openai.fineTuning.jobs.list({ limit: 20 });

  return list.data.map((job) => ({
    id: job.id,
    status: job.status,
    model: job.model,
    fine_tuned_model: job.fine_tuned_model,
    created_at: job.created_at,
  }));
}
