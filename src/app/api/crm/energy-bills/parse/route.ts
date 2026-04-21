import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseBillText, parseBillWithAI } from "@/lib/bill-parser";
import { persistParsedBill, DuplicateBillError } from "@/lib/crm/energy-bills";
import { getCompany } from "@/lib/crm/companies";
import { uploadFile, computeFileHash } from "@/lib/storage";

/* eslint-disable */
const pdfParse = require("pdf-parse");
/* eslint-enable */

/**
 * POST /api/crm/energy-bills/parse — Parse a bill PDF and persist it.
 * Accepts FormData with `file` (PDF) and `companyId` (string).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const companyIdStr = formData.get("companyId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No se ha subido archivo" }, { status: 400 });
    }
    if (!companyIdStr) {
      return NextResponse.json({ error: "Campo 'companyId' es obligatorio" }, { status: 400 });
    }

    const companyId = parseInt(companyIdStr, 10);
    if (isNaN(companyId)) {
      return NextResponse.json({ error: "'companyId' debe ser un número" }, { status: 400 });
    }

    // Verify company ownership
    const company = await getCompany(companyId);
    if (!company || company.userId !== session.user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfData = await pdfParse(buffer);

    if (!pdfData.text || pdfData.text.trim().length < 50) {
      return NextResponse.json(
        {
          error: "No se pudo extraer texto del PDF. Puede ser escaneada.",
          suggestion:
            "Descarga la factura digital desde el área de cliente de tu comercializadora.",
        },
        { status: 422 },
      );
    }

    const result = parseBillText(pdfData.text);
    result.textoExtraido = pdfData.text.substring(0, 3000);

    // If low confidence, try AI fallback and merge
    if (result.confianza < 75) {
      try {
        const aiResult = await parseBillWithAI(pdfData.text);
        if (aiResult.confianza > result.confianza) {
          if (!result.comercializadora && (aiResult as any).comercializadora)
            result.comercializadora = (aiResult as any).comercializadora;
          if (!result.cups && (aiResult as any).cups)
            result.cups = (aiResult as any).cups;
          if (!result.importeTotal && (aiResult as any).importeTotal)
            result.importeTotal = (aiResult as any).importeTotal;
          result.confianza = Math.max(result.confianza, aiResult.confianza);
          result.advertencias.push("Datos completados con Gemini AI (confianza regex baja)");
        }
      } catch (e) {
        result.advertencias.push(
          `Gemini fallback fallido: ${e instanceof Error ? e.message : "error"}`,
        );
      }
    }

    // ── Phase 3.5: Real file storage + hash deduplication ──
    const fileHash = computeFileHash(buffer);

    const uploaded = await uploadFile(buffer, file.name, {
      folder: "energy-bills",
      contentType: file.type || "application/pdf",
    });

    const fileName = file.name;
    const { energyBill, supplyPoint, document } = await persistParsedBill({
      companyId,
      userId: session.user.id,
      parsedBill: result,
      fileUrl: uploaded.url,
      fileName,
      fileSize: file.size,
      fileMime: file.type,
      fileHash,
    });

    return NextResponse.json({
      success: true,
      data: result,
      energyBill,
      supplyPoint,
      document,
    });
  } catch (err) {
    // Phase 3.5: Clear duplicate error response
    if (err instanceof DuplicateBillError) {
      return NextResponse.json(
        { error: err.message, duplicate: true, existingBillId: err.existingBillId },
        { status: 409 },
      );
    }
    console.error("[CRM] energy-bills/parse error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
