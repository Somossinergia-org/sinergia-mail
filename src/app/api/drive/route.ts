import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { google } from "googleapis";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

async function getDriveClient(userId: string) {
  const account = await db.query.accounts.findFirst({
    where: and(eq(schema.accounts.userId, userId), eq(schema.accounts.provider, "google")),
  });
  if (!account?.access_token) throw new Error("No Google account connected");
  const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });
  return google.drive({ version: "v3", auth: oauth2Client });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const drive = await getDriveClient(session.user.id);
    const folderId = req.nextUrl.searchParams.get("folderId") || "root";
    const q = req.nextUrl.searchParams.get("q");

    const query = q
      ? `name contains '${q.replace(/'/g, "\\'")}' and trashed=false`
      : `'${folderId}' in parents and trashed=false`;

    const res = await drive.files.list({
      q: query,
      fields: "files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,thumbnailLink)",
      pageSize: 50,
      orderBy: "folder,name",
      spaces: "drive",
    });

    const files = (res.data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: Number(f.size || 0),
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
      iconLink: f.iconLink,
      thumbnailLink: f.thumbnailLink,
      isFolder: f.mimeType === "application/vnd.google-apps.folder",
    }));

    return NextResponse.json({ files, folderId });
  } catch (e) {
    console.error("[drive] GET error:", e);
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg, files: [] }, { status: msg.includes("No Google") ? 403 : 500 });
  }
}
