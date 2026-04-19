import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseBillText, parseBillWithAI } from "@/lib/bill-parser";

/* eslint-disable */
const pdfParse = require("pdf-parse");
/* eslint-enable */

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "No se ha subido archivo" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // Si es PDF → extraer texto y parsear con regex
    if (file.type === "application/pdf") {
      const pdfData = await pdfParse(buffer);
      if (!pdfData.text || pdfData.text.trim().length < 50) {
        return NextResponse.json({
          error: "No se pudo extraer texto del PDF. Puede ser escaneada.",
          suggestion: "Descarga la factura digital desde el área de cliente de tu comercializadora.",
        }, { status: 422 });
      }

      const result = parseBillText(pdfData.text);
      result.textoExtraido = pdfData.text.substring(0, 3000);

      // Si baja confianza → fallback Gemini AI
      if (result.confianza < 75) {
        try {
          const aiResult = await parseBillWithAI(pdfData.text);
          if (aiResult.confianza > result.confianza) {
            // Merge AI results for missing fields
            if (!result.comercializadora && (aiResult as any).comercializadora) result.comercializadora = (aiResult as any).comercializadora;
            if (!result.cups && (aiResult as any).cups) result.cups = (aiResult as any).cups;
            if (!result.importeTotal && (aiResult as any).importeTotal) result.importeTotal = (aiResult as any).importeTotal;
            result.confianza = Math.max(result.confianza, aiResult.confianza);
            result.advertencias.push("Datos completados con Gemini AI (confianza regex baja)");
          }
        } catch (e) {
          result.advertencias.push(`Gemini fallback fallido: ${e instanceof Error ? e.message : "error"}`);
        }
      }

      return NextResponse.json({ success: true, data: result, pages: pdfData.numpages });
    }

    // Si es imagen → Gemini Vision directamente
    if (file.type.startsWith("image/")) {
      const aiResult = await parseBillWithAI("[Imagen de factura — usar Gemini Vision]");
      return NextResponse.json({ success: true, data: aiResult, method: "vision" });
    }

    return NextResponse.json({ error: "Formato no soportado. Usa PDF o imagen." }, { status: 400 });
  } catch (e) {
    console.error("[bill-parser]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error interno" }, { status: 500 });
  }
}
