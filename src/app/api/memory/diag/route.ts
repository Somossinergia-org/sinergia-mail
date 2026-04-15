import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { embed } from "@/lib/memory";

/** GET /api/memory/diag — tests if Gemini embedding API works */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const vec = await embed("prueba de embedding de facturas Iberdrola 2026");
    return NextResponse.json({
      ok: true,
      dimension: vec.length,
      firstValues: vec.slice(0, 5),
      hasApiKey: !!process.env.GEMINI_API_KEY,
      apiKeyLength: process.env.GEMINI_API_KEY?.length || 0,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.split("\n").slice(0, 3) : undefined,
      hasApiKey: !!process.env.GEMINI_API_KEY,
      apiKeyLength: process.env.GEMINI_API_KEY?.length || 0,
    }, { status: 500 });
  }
}
