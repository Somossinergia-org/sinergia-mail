import { createHash, randomBytes } from "crypto";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/**
 * MCP Bearer token authentication.
 *
 * - Plaintext tokens (sk_mcp_<32 hex>) are shown ONCE to the user at creation.
 * - Only SHA-256 hash is stored in DB.
 * - Validation: SHA-256(bearer) lookup → user resolution + lastUsedAt update.
 */

const PREFIX = "sk_mcp_";
const HASH_ALGO = "sha256";

export function generateToken(): { plaintext: string; hash: string; prefix: string } {
  const raw = randomBytes(24).toString("hex"); // 48 hex chars
  const plaintext = `${PREFIX}${raw}`;
  const hash = createHash(HASH_ALGO).update(plaintext).digest("hex");
  const prefix = plaintext.slice(0, 12); // sk_mcp_abcd
  return { plaintext, hash, prefix };
}

export function hashToken(plaintext: string): string {
  return createHash(HASH_ALGO).update(plaintext).digest("hex");
}

/** Validate a bearer token. Returns the userId or null if invalid/revoked. */
export async function validateToken(bearer: string | null): Promise<string | null> {
  if (!bearer || !bearer.startsWith(PREFIX)) return null;
  const hash = hashToken(bearer);

  const token = await db.query.mcpTokens.findFirst({
    where: eq(schema.mcpTokens.tokenHash, hash),
  });

  if (!token || token.revoked) return null;

  // Fire-and-forget update lastUsedAt (no await to keep request fast)
  db.update(schema.mcpTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.mcpTokens.id, token.id))
    .catch(() => {});

  return token.userId;
}
