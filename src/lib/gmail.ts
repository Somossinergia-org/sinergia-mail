import { google } from "googleapis";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/** Get authenticated Gmail client for a user */
export async function getGmailClient(userId: string) {
  const account = await db.query.accounts.findFirst({
    where: eq(schema.accounts.userId, userId),
  });

  if (!account?.access_token) {
    throw new Error("No Gmail access token found. Re-authenticate.");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  // Auto-refresh if expired
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db
        .update(schema.accounts)
        .set({
          access_token: tokens.access_token,
          expires_at: tokens.expiry_date
            ? Math.floor(tokens.expiry_date / 1000)
            : undefined,
        })
        .where(eq(schema.accounts.userId, userId));
    }
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

/** Search emails in Gmail */
export async function searchEmails(
  userId: string,
  query: string,
  maxResults = 100,
  pageToken?: string
) {
  const gmail = await getGmailClient(userId);
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

/** Recursively find parts by mimeType in nested multipart structures */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findParts(payload: any, mimeType: string): any[] {
  const results: any[] = [];
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findAttachments(payload: any): any[] {
  const results: any[] = [];
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
export async function readEmail(userId: string, messageId: string) {
  const gmail = await getGmailClient(userId);
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
  attachmentId: string
): Promise<Buffer> {
  const gmail = await getGmailClient(userId);
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
