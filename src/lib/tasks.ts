import { google } from "googleapis";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

/** Google Tasks client por usuario (mismo OAuth que Gmail/Calendar/Drive). */
async function getTasksClient(userId: string) {
  const account = await db.query.accounts.findFirst({
    where: and(eq(schema.accounts.userId, userId), eq(schema.accounts.provider, "google")),
  });
  if (!account?.access_token) {
    throw new Error("No Google account connected for this user");
  }
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });
  return google.tasks({ version: "v1", auth: oauth2Client });
}

export interface TaskInput {
  title: string;
  notes?: string;
  /** Fecha límite ISO (yyyy-mm-dd o ISO completo). Google Tasks sólo respeta la fecha. */
  due?: string;
  /** ID de lista. Si se omite, usa @default */
  tasklist?: string;
}

export interface TaskResult {
  id: string;
  title: string;
  notes: string | null;
  due: string | null;
  status: string;
  selfLink: string;
  webViewLink: string; // computed
}

function toWebViewLink(id: string) {
  // Deep link a la app web de Google Tasks para esa tarea
  return `https://tasks.google.com/tasks/list/?task=${encodeURIComponent(id)}`;
}

export async function createTask(userId: string, input: TaskInput): Promise<TaskResult> {
  const client = await getTasksClient(userId);
  const listId = input.tasklist || "@default";

  // Google Tasks espera RFC3339 con Z. Si nos pasan yyyy-mm-dd, lo completamos.
  let due: string | undefined;
  if (input.due) {
    due = /^\d{4}-\d{2}-\d{2}$/.test(input.due)
      ? `${input.due}T00:00:00.000Z`
      : input.due.endsWith("Z")
        ? input.due
        : `${input.due}Z`;
  }

  const res = await client.tasks.insert({
    tasklist: listId,
    requestBody: {
      title: input.title,
      notes: input.notes || undefined,
      due,
      status: "needsAction",
    },
  });
  return {
    id: res.data.id!,
    title: res.data.title || input.title,
    notes: res.data.notes || null,
    due: res.data.due || null,
    status: res.data.status || "needsAction",
    selfLink: res.data.selfLink || "",
    webViewLink: toWebViewLink(res.data.id!),
  };
}

export async function listPendingTasks(userId: string, tasklist?: string): Promise<TaskResult[]> {
  const client = await getTasksClient(userId);
  const res = await client.tasks.list({
    tasklist: tasklist || "@default",
    showCompleted: false,
    maxResults: 100,
  });
  return (res.data.items || []).map((t) => ({
    id: t.id!,
    title: t.title || "(sin título)",
    notes: t.notes || null,
    due: t.due || null,
    status: t.status || "needsAction",
    selfLink: t.selfLink || "",
    webViewLink: toWebViewLink(t.id!),
  }));
}
