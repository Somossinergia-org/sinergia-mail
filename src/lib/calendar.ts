import { google } from "googleapis";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

/**
 * Google Calendar client per user.
 *
 * Uses the OAuth tokens stored by NextAuth in `accounts`. Same Google
 * account as Gmail (so the user only granted permission once).
 */
async function getCalendarClient(userId: string) {
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

  return google.calendar({ version: "v3", auth: oauth2Client });
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  startISO: string; // 'YYYY-MM-DDTHH:mm:ss' (assumed Madrid timezone)
  endISO?: string;
  durationMin?: number;
  timeZone?: string; // default 'Europe/Madrid'
  location?: string;
  reminderMinutes?: number; // default 60 = 1h before
  /** Si true, añade un Google Meet al evento y devuelve meetLink */
  withMeet?: boolean;
}

export interface CalendarEventResult {
  id: string;
  htmlLink: string;
  summary: string;
  startISO: string;
  meetLink?: string | null;
}

/** Create an event on the user's primary calendar. */
export async function createEvent(
  userId: string,
  input: CalendarEventInput,
): Promise<CalendarEventResult> {
  const cal = await getCalendarClient(userId);
  const tz = input.timeZone || "Europe/Madrid";

  let endISO = input.endISO;
  if (!endISO) {
    const start = new Date(input.startISO);
    const minutes = input.durationMin || 60;
    endISO = new Date(start.getTime() + minutes * 60_000).toISOString().slice(0, 19);
  }

  const res = await cal.events.insert({
    calendarId: "primary",
    conferenceDataVersion: input.withMeet ? 1 : 0,
    requestBody: {
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: { dateTime: input.startISO, timeZone: tz },
      end: { dateTime: endISO, timeZone: tz },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: input.reminderMinutes ?? 60 },
        ],
      },
      ...(input.withMeet
        ? {
            conferenceData: {
              createRequest: {
                requestId: `sinergia-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }
        : {}),
    },
  });

  // El link de Meet puede tardar un instante; Google lo devuelve en
  // conferenceData.entryPoints cuando se resuelve el createRequest.
  const meetEntry = res.data.conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video",
  );
  const meetLink = meetEntry?.uri || res.data.hangoutLink || null;

  return {
    id: res.data.id || "",
    htmlLink: res.data.htmlLink || "",
    summary: res.data.summary || input.summary,
    startISO: input.startISO,
    meetLink,
  };
}

export interface UpcomingEvent {
  id: string;
  summary: string;
  startISO: string;
  endISO: string;
  htmlLink: string;
  location: string | null;
}

/** Fetch upcoming events from primary calendar (next N days). */
export async function listUpcomingEvents(userId: string, days = 7): Promise<UpcomingEvent[]> {
  const cal = await getCalendarClient(userId);
  const now = new Date();
  const max = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const res = await cal.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: max.toISOString(),
    maxResults: 50,
    singleEvents: true,
    orderBy: "startTime",
  });
  return (res.data.items || []).map((e) => ({
    id: e.id || "",
    summary: e.summary || "(sin título)",
    startISO: e.start?.dateTime || e.start?.date || "",
    endISO: e.end?.dateTime || e.end?.date || "",
    htmlLink: e.htmlLink || "",
    location: e.location || null,
  }));
}
