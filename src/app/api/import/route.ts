/**
 * API Route: POST /api/import
 * Importación masiva de empresas, contactos y puntos de suministro.
 *
 * Seguridad:
 * - Auth requerida (NextAuth session)
 * - Max 10MB por archivo
 * - Solo xlsx/csv
 * - Lock de concurrencia por userId (1 importación a la vez)
 * - Validación de entidad
 *
 * Body: FormData con:
 * - file: archivo xlsx/csv
 * - entity: "companies" | "contacts" | "supplyPoints"
 * - dryRun: "true" | "false" (opcional, default false)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { importFile, MAX_FILE_SIZE } from "@/lib/import";
import type { ImportEntity } from "@/lib/import";

// Lock de concurrencia: 1 importación por usuario a la vez
const activeImports = new Set<string>();

const VALID_ENTITIES: ImportEntity[] = ["companies", "contacts", "supplyPoints"];
const VALID_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.ms-excel", // xls
  "text/csv",
  "application/csv",
  "text/plain", // algunos sistemas envían CSV como text/plain
];
const VALID_EXTENSIONS = [".xlsx", ".xls", ".csv"];

export async function POST(req: NextRequest) {
  // 1. Auth
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "No autorizado. Inicia sesión." },
      { status: 401 }
    );
  }

  const userId = session.user.id;

  // 2. Lock de concurrencia
  if (activeImports.has(userId)) {
    return NextResponse.json(
      { error: "Ya hay una importación en curso. Espera a que termine." },
      { status: 429 }
    );
  }

  activeImports.add(userId);

  try {
    // 3. Parsear FormData
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const entityRaw = formData.get("entity") as string | null;
    const dryRunRaw = formData.get("dryRun") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No se recibió archivo. Envía un archivo xlsx o csv." },
        { status: 400 }
      );
    }

    if (!entityRaw || !VALID_ENTITIES.includes(entityRaw as ImportEntity)) {
      return NextResponse.json(
        { error: `Entidad inválida: "${entityRaw}". Válidas: ${VALID_ENTITIES.join(", ")}` },
        { status: 400 }
      );
    }

    const entity = entityRaw as ImportEntity;
    const dryRun = dryRunRaw === "true";

    // 4. Validar archivo
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `Archivo demasiado grande: ${(file.size / 1024 / 1024).toFixed(1)}MB. Máximo: 10MB.`,
        },
        { status: 400 }
      );
    }

    // Validar extensión
    const fileName = file.name.toLowerCase();
    const hasValidExt = VALID_EXTENSIONS.some((ext) => fileName.endsWith(ext));
    if (!hasValidExt) {
      return NextResponse.json(
        {
          error: `Extensión de archivo no soportada. Usa: ${VALID_EXTENSIONS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // 5. Leer buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 6. Importar
    const result = await importFile(buffer, entity, {
      userId,
      dryRun,
      maxRows: 5000,
    });

    // 7. Responder
    return NextResponse.json({
      success: true,
      dryRun,
      ...result,
      // No enviar rawPreview de cada fila en la respuesta principal para reducir tamaño
      rows: result.rows.map((r) => ({
        rowIndex: r.rowIndex,
        action: r.action,
        entityId: r.entityId,
        errors: r.errors,
        // Solo incluir rawPreview para errores (debug)
        rawPreview: r.action === "error" ? r.rawPreview : undefined,
      })),
    });
  } catch (err) {
    console.error("[/api/import] Error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Error interno del importador",
      },
      { status: 500 }
    );
  } finally {
    activeImports.delete(userId);
  }
}

/**
 * GET /api/import — Devuelve info sobre entidades disponibles y sus campos
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return NextResponse.json({
    entities: VALID_ENTITIES,
    maxFileSize: MAX_FILE_SIZE,
    maxFileSizeMB: MAX_FILE_SIZE / 1024 / 1024,
    validExtensions: VALID_EXTENSIONS,
    entityLabels: {
      companies: "Empresas",
      contacts: "Contactos",
      supplyPoints: "Puntos de suministro",
    },
    entityDescriptions: {
      companies: "Importa empresas con NIF, dirección, contacto. Dedup por NIF.",
      contacts: "Importa contactos con email, teléfono, empresa. Dedup por email.",
      supplyPoints: "Importa puntos de suministro con CUPS. Dedup por CUPS+empresa. Requiere que las empresas existan.",
    },
    importOrder: [
      "1. Primero importa empresas",
      "2. Después contactos (se vinculan a empresas por NIF/nombre)",
      "3. Por último puntos de suministro (requieren empresa existente)",
    ],
  });
}
