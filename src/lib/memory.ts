import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, schema } from "@/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { logger, logError } from "@/lib/logger";

/**
 * Sinergia Memory — vector store con embeddings Gemini + pgvector.
 *
 * Provee:
 *   - embed(text) → vector [number]
 *   - addSource({ userId, kind, title, content, metadata, refId }) → id
 *   - searchMemory(userId, query, limit) → [{ source, score }]
 *   - chunkText(text, maxWords) → string[]   (para fuentes largas)
 *   - summarizeIfLong(text) → string | null  (para sources con content>2000 chars)
 *
 * Modelo: text-embedding-004 (768-d, cosine similarity)
 */

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

const log = logger.child({ component: "memory" });

/** Generate a 768-d embedding for a single text. */
export async function embed(text: string): Promise<number[]> {
  const clean = text.slice(0, 8000).trim(); // model has context limit
  if (!clean) throw new Error("Empty text");
  const res = await embeddingModel.embedContent(clean);
  const values = res.embedding.values;
  if (!values || values.length === 0) throw new Error("Empty embedding");
  return values;
}

/** Batch embed (currently sequential; Google SDK doesn't expose a true batch yet). */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) {
    try {
      out.push(await embed(t));
    } catch (e) {
      logError(log, e, { preview: t.slice(0, 80) }, "embed failed");
      out.push([]);
    }
  }
  return out;
}

/**
 * Serialize a JS number[] into pgvector literal string.
 *   [0.1, 0.2, 0.3]  →  "[0.1,0.2,0.3]"
 */
function toPgvector(v: number[]): string {
  return `[${v.join(",")}]`;
}

export interface AddSourceInput {
  userId: string;
  kind: "email" | "invoice" | "pdf" | "note" | "url" | "contact";
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  sourceRefId?: number | null;
  tags?: string[];
}

/**
 * Add a memory source. Generates embedding automatically. Long content
 * gets chunked into multiple rows.
 */
export async function addSource(input: AddSourceInput): Promise<{ ids: number[]; chunked: boolean }> {
  const chunks = chunkText(input.content, 400);
  const vectors = await embedBatch(chunks);
  const ids: number[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const vec = vectors[i];
    if (!vec || vec.length === 0) continue;

    const rows = await db.execute(sql`
      INSERT INTO memory_sources
        (user_id, kind, title, content, embedding, metadata, source_ref_id, chunk_index, tags)
      VALUES (
        ${input.userId},
        ${input.kind},
        ${input.title},
        ${chunks[i]},
        ${toPgvector(vec)}::vector,
        ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb,
        ${input.sourceRefId ?? null},
        ${chunks.length > 1 ? i : null},
        ${input.tags ? `{${input.tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",")}}` : null}
      )
      RETURNING id
    `);
    const row = (rows as unknown as { id: number }[])[0];
    if (row?.id) ids.push(row.id);
  }

  log.info({ userId: input.userId, kind: input.kind, chunks: chunks.length, ids: ids.length }, "memory source added");
  return { ids, chunked: chunks.length > 1 };
}

/** If source already exists for this (kind, refId), skip. */
export async function addSourceIfNew(input: AddSourceInput): Promise<{ ids: number[]; skipped: boolean }> {
  if (input.sourceRefId) {
    const existing = await db.query.memorySources.findFirst({
      where: and(
        eq(schema.memorySources.userId, input.userId),
        eq(schema.memorySources.kind, input.kind),
        eq(schema.memorySources.sourceRefId, input.sourceRefId),
      ),
    });
    if (existing) return { ids: [], skipped: true };
  }
  const { ids } = await addSource(input);
  return { ids, skipped: false };
}

export interface MemorySearchResult {
  id: number;
  kind: string;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  sourceRefId: number | null;
  similarity: number; // 0..1, higher = more similar
  starred: boolean;
  createdAt: Date | null;
}

/**
 * Semantic search over user's memory. Uses pgvector cosine distance.
 * Starred sources get a slight boost (+0.05 to similarity score).
 */
export async function searchMemory(
  userId: string,
  query: string,
  opts: { limit?: number; kind?: string } = {},
): Promise<MemorySearchResult[]> {
  const limit = Math.min(opts.limit || 5, 20);
  const queryVec = await embed(query);
  const queryVecSql = toPgvector(queryVec);

  // cosine distance = 1 - cosine_similarity  → order ASC for "most similar first"
  // We return similarity = 1 - distance for intuitive reading
  const kindFilter = opts.kind
    ? sql`AND kind = ${opts.kind}`
    : sql``;

  const rows = await db.execute<{
    id: number;
    kind: string;
    title: string;
    content: string;
    metadata: Record<string, unknown> | null;
    source_ref_id: number | null;
    starred: boolean;
    created_at: Date | null;
    distance: number;
  }>(sql`
    SELECT id, kind, title, content, metadata, source_ref_id, starred, created_at,
           (embedding <=> ${queryVecSql}::vector) AS distance
    FROM memory_sources
    WHERE user_id = ${userId}
      AND embedding IS NOT NULL
      ${kindFilter}
    ORDER BY distance ASC
    LIMIT ${limit * 2}
  `);

  const list = (rows as unknown as Array<{
    id: number;
    kind: string;
    title: string;
    content: string;
    metadata: Record<string, unknown> | null;
    source_ref_id: number | null;
    starred: boolean;
    created_at: Date | null;
    distance: number;
  }>).map((r) => {
    let similarity = 1 - r.distance;
    if (r.starred) similarity += 0.05;
    return {
      id: r.id,
      kind: r.kind,
      title: r.title,
      content: r.content,
      metadata: r.metadata,
      sourceRefId: r.source_ref_id,
      similarity: Math.max(0, Math.min(1, similarity)),
      starred: r.starred,
      createdAt: r.created_at,
    };
  });

  list.sort((a, b) => b.similarity - a.similarity);
  return list.slice(0, limit);
}

/**
 * Chunk text into ~maxWords-word passages with a small overlap.
 * Uses word-count as a proxy for tokens (1 word ≈ 0.75 tokens for Spanish).
 */
export function chunkText(text: string, maxWords = 400): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const words = clean.split(" ");
  if (words.length <= maxWords) return [clean];

  const chunks: string[] = [];
  const overlap = Math.floor(maxWords * 0.1);
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) break;
    start = end - overlap;
  }
  return chunks;
}
