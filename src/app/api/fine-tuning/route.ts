import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  extractTrainingData,
  generateTrainingFile,
  startFineTuning,
  getFineTuningStatus,
  listFineTuningJobs,
} from "@/lib/fine-tuning/pipeline";

/** GET /api/fine-tuning — training data stats + list fine-tuning jobs */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const data = await extractTrainingData(session.user.id);
    let jobs: Awaited<ReturnType<typeof listFineTuningJobs>> = [];

    try {
      jobs = await listFineTuningJobs();
    } catch {
      // OpenAI key may not be configured — return stats anyway
    }

    return NextResponse.json({
      stats: {
        drafts: data.drafts.length,
        conversations: data.conversations.length,
        categorizations: data.categorizations.length,
        total: data.total,
      },
      jobs,
    });
  } catch (e: any) {
    console.error("[fine-tuning] GET error:", e);
    return NextResponse.json(
      { error: e.message || "Error interno" },
      { status: 500 }
    );
  }
}

/** POST /api/fine-tuning — actions: extract, generate, start, status */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { action } = body;

  try {
    switch (action) {
      // ── Extract & preview training data ──
      case "extract": {
        const data = await extractTrainingData(session.user.id);
        return NextResponse.json({
          stats: {
            drafts: data.drafts.length,
            conversations: data.conversations.length,
            categorizations: data.categorizations.length,
            total: data.total,
          },
          preview: {
            drafts: data.drafts.slice(0, 3),
            conversations: data.conversations.slice(0, 3),
            categorizations: data.categorizations.slice(0, 3),
          },
        });
      }

      // ── Generate JSONL file ──
      case "generate": {
        const types: string[] = body.types || [
          "drafts",
          "conversations",
          "categorizations",
        ];
        const result = await generateTrainingFile(session.user.id, types);
        return NextResponse.json(result);
      }

      // ── Start fine-tuning job ──
      case "start": {
        if (!process.env.OPENAI_API_KEY) {
          return NextResponse.json(
            { error: "OPENAI_API_KEY no configurada" },
            { status: 500 }
          );
        }

        // Generate the JSONL first
        const types: string[] = body.types || [
          "drafts",
          "conversations",
          "categorizations",
        ];
        const file = await generateTrainingFile(session.user.id, types);

        if (file.examples < 10) {
          return NextResponse.json(
            {
              error: `Necesitas al menos 10 ejemplos para entrenar. Tienes ${file.examples}.`,
            },
            { status: 400 }
          );
        }

        const result = await startFineTuning(session.user.id, {
          trainingFileContent: file.jsonl,
          model: body.model,
          suffix: body.suffix || "sinergia",
        });

        return NextResponse.json(result);
      }

      // ── Check job status ──
      case "status": {
        if (!body.jobId) {
          return NextResponse.json(
            { error: "jobId requerido" },
            { status: 400 }
          );
        }
        const status = await getFineTuningStatus(body.jobId);
        return NextResponse.json(status);
      }

      default:
        return NextResponse.json(
          { error: `Acción desconocida: ${action}` },
          { status: 400 }
        );
    }
  } catch (e: any) {
    console.error("[fine-tuning] POST error:", e);
    return NextResponse.json(
      { error: e.message || "Error interno" },
      { status: 500 }
    );
  }
}
