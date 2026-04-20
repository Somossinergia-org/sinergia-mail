import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { createDraft as createGmailDraft } from "@/lib/gmail";

interface TemplateMetadata {
  name: string;
  subject: string;
  body: string;
  variables: string[];
  category: string;
}

interface ApplyTemplateRequest {
  templateId: string;
  emailId: number;
  variables?: Record<string, string>;
}

interface ApplyTemplateResponse {
  emailId: number;
  to: string;
  subject: string;
  body: string;
  gmailDraftId?: string;
}

const DEFAULT_TEMPLATES: TemplateMetadata[] = [
  { name: "Acuse de recibo", subject: "Re: {{originalSubject}}", body: "Estimado/a {{senderName}},\n\nAcuso recibo de su email. Lo revisaremos y le responderemos a la mayor brevedad.\n\nUn saludo cordial,\nSomos Sinergia", variables: ["senderName", "originalSubject"], category: "General" },
  { name: "Solicitud presupuesto", subject: "Solicitud de presupuesto - Somos Sinergia", body: "Estimado/a {{senderName}},\n\nNos ponemos en contacto para solicitar un presupuesto por los siguientes servicios/productos:\n\n{{detalles}}\n\nQuedamos a la espera de su respuesta.\n\nUn saludo,\nSomos Sinergia", variables: ["senderName", "detalles"], category: "Comercial" },
  { name: "Confirmación de pago", subject: "Confirmación de pago - {{amount}}", body: "Estimado/a {{senderName}},\n\nLe confirmamos que hemos realizado el pago por importe de {{amount}} correspondiente a la factura {{invoiceRef}}.\n\nAdjuntamos justificante.\n\nUn saludo,\nSomos Sinergia", variables: ["senderName", "amount", "invoiceRef"], category: "Finanzas" },
  { name: "Seguimiento", subject: "Seguimiento: {{originalSubject}}", body: "Estimado/a {{senderName}},\n\nLe escribo para hacer seguimiento de nuestra conversación anterior sobre {{tema}}.\n\n¿Ha tenido oportunidad de revisarlo?\n\nQuedamos a su disposición.\n\nUn saludo,\nSomos Sinergia", variables: ["senderName", "originalSubject", "tema"], category: "Comercial" },
  { name: "Agradecimiento", subject: "Gracias - {{originalSubject}}", body: "Estimado/a {{senderName}},\n\nMuchas gracias por su pronta respuesta y colaboración.\n\n{{mensaje}}\n\nUn saludo cordial,\nSomos Sinergia", variables: ["senderName", "originalSubject", "mensaje"], category: "General" },
  { name: "Reclamación", subject: "Reclamación - {{referencia}}", body: "Estimado/a {{senderName}},\n\nNos ponemos en contacto para presentar una reclamación respecto a:\n\n{{descripcion}}\n\nReferencia: {{referencia}}\nFecha: {{fecha}}\n\nSolicitamos una resolución a la mayor brevedad.\n\nUn saludo,\nSomos Sinergia", variables: ["senderName", "referencia", "descripcion", "fecha"], category: "Legal" },
  { name: "Bienvenida cliente", subject: "Bienvenido/a a Somos Sinergia", body: "Estimado/a {{senderName}},\n\nEs un placer darle la bienvenida como nuevo cliente de Somos Sinergia.\n\nA partir de ahora contará con:\n- Gestión integral de sus comunicaciones\n- Asistente IA para automatización\n- Panel de facturas y analíticas\n\nNo dude en contactarnos para cualquier consulta.\n\nUn saludo,\nSomos Sinergia", variables: ["senderName"], category: "Onboarding" },
];

/** Load templates from DB (memorySources with kind="template") + defaults */
async function loadTemplates(userId: string) {
  const rows = await db
    .select()
    .from(schema.memorySources)
    .where(
      and(
        eq(schema.memorySources.userId, userId),
        eq(schema.memorySources.kind, "template")
      )
    );

  const userTemplates = rows.map((row) => {
    const meta = row.metadata as TemplateMetadata | null;
    return {
      id: String(row.id),
      name: meta?.name ?? row.title,
      subject: meta?.subject ?? "",
      body: meta?.body ?? row.content,
      variables: meta?.variables ?? [],
      category: meta?.category ?? "General",
      isCustom: true,
    };
  });

  const defaults = DEFAULT_TEMPLATES.map((t, i) => ({
    id: `default-${i}`,
    ...t,
    isCustom: false,
  }));

  return [...defaults, ...userTemplates];
}

/** Utility: Replace variables in template text */
function replaceVariables(
  text: string,
  variables: Record<string, string>
): string {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`{{${key}}}`, "g");
    result = result.replace(pattern, value || "");
  }
  return result;
}

/** GET /api/agent/templates — Return templates from DB + defaults */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const templates = await loadTemplates(session.user.id);
  return NextResponse.json({ templates });
}

/** POST /api/agent/templates — Apply a template to an email */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const { templateId, emailId, variables = {} } = (await req.json()) as ApplyTemplateRequest;

  const startTime = Date.now();

  try {
    if (!templateId || !emailId) {
      return NextResponse.json(
        { error: "templateId y emailId requeridos" },
        { status: 400 }
      );
    }

    // Find template from DB + defaults
    const allTemplates = await loadTemplates(userId);
    const template = allTemplates.find((t) => t.id === templateId);
    if (!template) {
      return NextResponse.json({ error: "Template no encontrado" }, { status: 404 });
    }

    // Find and validate email ownership
    const email = await db.query.emails.findFirst({
      where: and(
        eq(schema.emails.id, emailId),
        eq(schema.emails.userId, userId)
      ),
    });

    if (!email) {
      return NextResponse.json({ error: "Email no encontrado" }, { status: 404 });
    }

    // Build final variables with auto-filled values
    const finalVariables = {
      senderName: email.fromName || "Usuario",
      originalSubject: email.subject || "(Sin asunto)",
      ...variables,
    };

    // Replace variables in template
    const subject = replaceVariables(template.subject, finalVariables);
    const body = replaceVariables(template.body, finalVariables);

    // Create Gmail draft
    const gmailDraft = await createGmailDraft(
      userId,
      email.fromEmail || "",
      subject,
      body
    );

    // Log action
    await db.insert(schema.agentLogs).values({
      userId,
      action: "template-apply",
      inputSummary: `template: ${template.id} | email: ${emailId}`,
      outputSummary: `Draft creado (${body.length} chars)`,
      durationMs: Date.now() - startTime,
      success: true,
    });

    return NextResponse.json({
      emailId,
      to: email.fromEmail || "",
      subject,
      body,
      gmailDraftId: gmailDraft.id,
    } as ApplyTemplateResponse);
  } catch (e) {
    await db.insert(schema.agentLogs).values({
      userId,
      action: "template-apply",
      inputSummary: `template: ${templateId} | email: ${emailId}`,
      durationMs: Date.now() - startTime,
      success: false,
      error: e instanceof Error ? e.message : "Unknown",
    });

    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Error aplicando template",
      },
      { status: 500 }
    );
  }
}
