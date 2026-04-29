import { google } from "googleapis";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { encryptToken, decryptToken } from "@/lib/crypto/tokens";
import { logger } from "@/lib/logger";

const tokenLog = logger.child({ component: "gmail-token-refresh" });

/**
 * Get authenticated Gmail client for a user (uses primary email_account
 * preferentially, falls back to NextAuth `accounts` table for legacy users).
 */
export async function getGmailClient(userId: string) {
  // Prefer the primary email_account
  const primaryAccount = await db.query.emailAccounts.findFirst({
    where: and(
      eq(schema.emailAccounts.userId, userId),
      eq(schema.emailAccounts.isPrimary, true),
      eq(schema.emailAccounts.enabled, true),
    ),
  });
  if (primaryAccount?.accessToken) {
    const decAccess = decryptToken(primaryAccount.accessToken) ?? primaryAccount.accessToken;
    const decRefresh = decryptToken(primaryAccount.refreshToken);
    return buildGmailClient(decAccess, decRefresh, async (newTokens) => {
      await db
        .update(schema.emailAccounts)
        .set({
          accessToken: encryptToken(newTokens.access_token ?? null) ?? newTokens.access_token,
          expiresAt: newTokens.expiry_date ? Math.floor(newTokens.expiry_date / 1000) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(schema.emailAccounts.id, primaryAccount.id));
    });
  }

  // Fallback: legacy NextAuth account
  const account = await db.query.accounts.findFirst({
    where: eq(schema.accounts.userId, userId),
  });
  if (!account?.access_token) {
    throw new Error("No Gmail access token found. Re-authenticate.");
  }
  const decLegacyAccess = decryptToken(account.access_token) ?? account.access_token;
  const decLegacyRefresh = decryptToken(account.refresh_token);
  return buildGmailClient(decLegacyAccess, decLegacyRefresh, async (newTokens) => {
    await db
      .update(schema.accounts)
      .set({
        access_token: encryptToken(newTokens.access_token ?? null) ?? newTokens.access_token,
        expires_at: newTokens.expiry_date ? Math.floor(newTokens.expiry_date / 1000) : undefined,
      })
      .where(eq(schema.accounts.userId, userId));
  });
}

/**
 * Get authenticated Gmail client for a SPECIFIC email_account (by id).
 * Used during multi-account sync.
 */
export async function getGmailClientForAccount(accountId: number) {
  const account = await db.query.emailAccounts.findFirst({
    where: eq(schema.emailAccounts.id, accountId),
  });
  if (!account?.accessToken) {
    throw new Error(`email_accounts ${accountId} has no access_token`);
  }
  const decAccess = decryptToken(account.accessToken) ?? account.accessToken;
  const decRefresh = decryptToken(account.refreshToken);
  return buildGmailClient(decAccess, decRefresh, async (newTokens) => {
    await db
      .update(schema.emailAccounts)
      .set({
        accessToken: encryptToken(newTokens.access_token ?? null) ?? newTokens.access_token,
        expiresAt: newTokens.expiry_date ? Math.floor(newTokens.expiry_date / 1000) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(schema.emailAccounts.id, account.id));
  });
}

interface NewTokens {
  access_token?: string | null;
  expiry_date?: number | null;
}

function buildGmailClient(
  accessToken: string,
  refreshToken: string | null | undefined,
  onTokenRefresh: (tokens: NewTokens) => Promise<void>,
) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken || undefined,
  });
  oauth2Client.on("tokens", (tokens) => {
    if (tokens.access_token) {
      // Persistir el nuevo access_token. Antes silenciaba el error, lo cual
      // dejaba al usuario con un token caducado en DB y la siguiente llamada
      // a Gmail fallaba sin pista en logs. Ahora se loggea para que se vea
      // en Vercel y podamos diagnosticar refresh tokens caducados.
      onTokenRefresh({
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date,
      }).catch((err) => {
        tokenLog.warn(
          { err: (err as Error)?.message?.slice(0, 200) },
          "failed to persist refreshed access_token",
        );
      });
    }
  });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export type GmailClient = Awaited<ReturnType<typeof getGmailClient>>;

/** Search emails in Gmail. Pass `gmailClient` to use a specific account. */
export async function searchEmails(
  userId: string,
  query: string,
  maxResults = 100,
  pageToken?: string,
  gmailClient?: GmailClient,
) {
  const gmail = gmailClient || (await getGmailClient(userId));
  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
    pageToken,
  });
  return {
    messages: res.data.messages || [],
    nextPageToken: res.data.nextPageToken,
  };
}

// Gmail payload type (Google API nests parts recursively — schema imported as unknown)
interface GmailPayload {
  mimeType?: string | null;
  filename?: string | null;
  body?: { data?: string | null; attachmentId?: string | null; size?: number | null } | null;
  parts?: GmailPayload[] | null;
  headers?: Array<{ name?: string | null; value?: string | null }> | null;
}

/** Recursively find parts by mimeType in nested multipart structures */
function findParts(payload: GmailPayload | undefined, mimeType: string): GmailPayload[] {
  const results: GmailPayload[] = [];
  if (!payload) return results;

  if (payload.mimeType === mimeType && payload.body?.data) {
    results.push(payload);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      results.push(...findParts(part, mimeType));
    }
  }

  return results;
}

/** Recursively collect all attachment parts */
function findAttachments(payload: GmailPayload | undefined): GmailPayload[] {
  const results: GmailPayload[] = [];
  if (!payload) return results;

  if (payload.filename && payload.filename.length > 0) {
    results.push(payload);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      results.push(...findAttachments(part));
    }
  }

  return results;
}

/** Read a full email message */
export async function readEmail(userId: string, messageId: string, gmailClient?: GmailClient) {
  const gmail = gmailClient || (await getGmailClient(userId));
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = res.data.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

  // Extract body — recursively search nested multipart structures
  let body = "";
  const textParts = findParts(res.data.payload, "text/plain");
  const htmlParts = findParts(res.data.payload, "text/html");

  // Prefer text/plain for AI processing, fall back to HTML
  const bodyPart = textParts[0] || htmlParts[0];
  if (bodyPart?.body?.data) {
    body = Buffer.from(bodyPart.body.data, "base64").toString("utf-8");
  } else if (res.data.payload?.body?.data) {
    body = Buffer.from(res.data.payload.body.data, "base64").toString("utf-8");
  }

  // Extract attachments info — recursively search all parts
  const attachmentParts = findAttachments(res.data.payload);
  const attachments = attachmentParts.map((p: any) => ({
    filename: p.filename!,
    mimeType: p.mimeType || "",
    size: p.body?.size || 0,
    attachmentId: p.body?.attachmentId || "",
  }));

  // Parse sender
  const fromRaw = getHeader("From");
  const fromMatch = fromRaw.match(/(?:"?([^"]*)"?\s)?<?([^>]+@[^>]+)>?/);

  return {
    id: res.data.id!,
    threadId: res.data.threadId!,
    labelIds: res.data.labelIds || [],
    snippet: res.data.snippet || "",
    date: new Date(parseInt(res.data.internalDate || "0")),
    fromName: fromMatch?.[1]?.trim() || fromMatch?.[2]?.split("@")[0] || "Unknown",
    fromEmail: fromMatch?.[2] || fromRaw,
    subject: getHeader("Subject"),
    body,
    attachments,
    historyId: res.data.historyId,
  };
}

/** Download PDF attachment */
export async function downloadAttachment(
  userId: string,
  messageId: string,
  attachmentId: string,
  gmailClient?: GmailClient,
): Promise<Buffer> {
  const gmail = gmailClient || (await getGmailClient(userId));
  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });

  if (!res.data.data) throw new Error("Empty attachment");
  return Buffer.from(res.data.data, "base64url");
}

/** Create a draft email */
export async function createDraft(
  userId: string,
  to: string,
  subject: string,
  body: string
) {
  const gmail = await getGmailClient(userId);

  const message = [
    `To: ${to}`,
    `Subject: Re: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");

  const encodedMessage = Buffer.from(message).toString("base64url");

  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw: encodedMessage },
    },
  });

  return res.data;
}

/**
 * Send an email immediately (not a draft) via Gmail API, supporting HTML.
 */
export async function sendEmail(
  userId: string,
  to: string,
  subject: string,
  html: string,
  fromName?: string
): Promise<{ id: string | null | undefined }> {
  const gmail = await getGmailClient(userId);

  const boundary = `sinergia_boundary_${Date.now()}`;
  const headers = [
    `To: ${to}`,
    fromName ? `From: ${fromName}` : "",
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
    .filter(Boolean)
    .join("\r\n");

  const plain = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const bodyMime = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    plain,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
    `--${boundary}--`,
  ].join("\r\n");

  const message = `${headers}\r\n\r\n${bodyMime}`;
  const encoded = Buffer.from(message).toString("base64url");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
  return { id: res.data.id };
}

/** Move email to trash (recoverable) */
export async function trashEmail(userId: string, messageId: string): Promise<void> {
  const gmail = await getGmailClient(userId);
  await gmail.users.messages.trash({ userId: "me", id: messageId });
}

/** Batch trash emails */
export async function trashEmails(userId: string, messageIds: string[]): Promise<{ trashed: number; errors: number }> {
  const gmail = await getGmailClient(userId);
  let trashed = 0, errors = 0;
  // Process in batches of 10 to avoid rate limits
  for (let i = 0; i < messageIds.length; i += 10) {
    const batch = messageIds.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(id => gmail.users.messages.trash({ userId: "me", id }))
    );
    for (const r of results) {
      if (r.status === "fulfilled") trashed++;
      else errors++;
    }
    if (i + 10 < messageIds.length) await new Promise(r => setTimeout(r, 200));
  }
  return { trashed, errors };
}
