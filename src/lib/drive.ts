import { google } from "googleapis";
import { Readable } from "stream";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

/**
 * Google Drive client por usuario. Usa el OAuth de NextAuth (mismo
 * token que Gmail / Calendar). Sólo requiere scope drive.file: sólo vemos
 * y creamos archivos propios de la app, no el resto del Drive.
 */
async function getDriveClient(userId: string) {
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
  return google.drive({ version: "v3", auth: oauth2Client });
}

type DriveClient = Awaited<ReturnType<typeof getDriveClient>>;

/**
 * Devuelve el folderId de una carpeta. Si no existe, la crea. Si se pasa
 * `parentId` busca/crea DENTRO de ese padre; si no, en "My Drive".
 */
async function ensureFolder(
  drive: DriveClient,
  name: string,
  parentId?: string,
): Promise<string> {
  const safeName = name.replace(/'/g, "\\'");
  const q = parentId
    ? `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and '${parentId}' in parents and trashed=false`
    : `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and trashed=false`;

  const existing = await drive.files.list({
    q,
    fields: "files(id,name)",
    pageSize: 1,
    spaces: "drive",
  });
  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id!;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });
  return created.data.id!;
}

/**
 * Asegura la ruta "Sinergia Mail / Facturas YYYY / Categoría" y devuelve
 * el id del último nivel, creando carpetas faltantes en el camino.
 */
export async function ensureInvoiceFolderPath(
  userId: string,
  year: number,
  category: string | null,
): Promise<{ folderId: string; webViewLink: string }> {
  const drive = await getDriveClient(userId);
  const rootId = await ensureFolder(drive, "Sinergia Mail");
  const yearId = await ensureFolder(drive, `Facturas ${year}`, rootId);
  const catId = await ensureFolder(drive, category || "OTROS", yearId);

  // Obtener webViewLink de la carpeta final
  const meta = await drive.files.get({ fileId: catId, fields: "id,webViewLink" });
  return {
    folderId: catId,
    webViewLink: meta.data.webViewLink || `https://drive.google.com/drive/folders/${catId}`,
  };
}

export interface UploadedFileResult {
  fileId: string;
  webViewLink: string;
  webContentLink: string | null;
  name: string;
  size: number;
}

/**
 * Sube un Buffer como archivo dentro de folderId. Si ya existe uno con
 * el mismo nombre, devuelve el existente (idempotente).
 */
export async function uploadPdfToFolder(
  userId: string,
  folderId: string,
  fileName: string,
  pdfBuffer: Buffer,
): Promise<UploadedFileResult> {
  const drive = await getDriveClient(userId);
  const safeName = fileName.replace(/'/g, "\\'");

  // ¿Existe ya en esa carpeta?
  const existing = await drive.files.list({
    q: `name='${safeName}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id,name,webViewLink,webContentLink,size)",
    pageSize: 1,
    spaces: "drive",
  });
  if (existing.data.files && existing.data.files.length > 0) {
    const f = existing.data.files[0];
    return {
      fileId: f.id!,
      webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
      webContentLink: f.webContentLink || null,
      name: f.name || fileName,
      size: Number(f.size) || pdfBuffer.length,
    };
  }

  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: "application/pdf",
    },
    media: {
      mimeType: "application/pdf",
      body: Readable.from(pdfBuffer),
    },
    fields: "id,webViewLink,webContentLink,size",
  });
  return {
    fileId: created.data.id!,
    webViewLink:
      created.data.webViewLink || `https://drive.google.com/file/d/${created.data.id}/view`,
    webContentLink: created.data.webContentLink || null,
    name: fileName,
    size: Number(created.data.size) || pdfBuffer.length,
  };
}
