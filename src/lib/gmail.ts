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

  // Extract body
  let body = "";
  const parts = res.data.payload?.parts || [];
  if (parts.length > 0) {
    const textPart = parts.find((p) => p.mimeType === "text/plain");
    const htmlPart = parts.find((p) => p.mimeType === "text/html");
    const part = textPart || htmlPart;
    if (part?.body?.data) {
      body = Buffer.from(part.body.data, "base64").toString("utf-8");
    }
  } else if (res.data.payload?.body?.data) {
    body = Buffer.from(res.data.payload.body.data, "base64").toString("utf-8");
  }

  // Extract attachments info
  const attachments = parts
    .filter((p) => p.filename && p.filename.length > 0)
    .map((p) => ({
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
