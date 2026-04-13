import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { createDraft as createGmailDraft } from "@/lib/gmail";

interface Template {
  id: string;
  category: "CLIENTE" | "PROVEEDOR" | "FACTURA";
  name: string;
  subject: string;
  body: string;
}

interface TemplatesResponse {
  templates: Template[];
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

const TEMPLATES: Template[] = [
  {
    id: "factura-recibida",
    category: "FACTURA",
    name: "Acuse de recibo de factura",
    subject: "Re: {{originalSubject}}",
    body: "Estimado/a {{senderName}},\n\nAcusamos recibo de su factura {{invoiceRef}}. Procedemos a su revisión y tramitación.\n\nPara cualquier consulta, no dude en contactarnos.\n\nUn cordial saludo,\nSomos Sinergia",
  },
  {
    id: "solicitud-presupuesto",
    category: "PROVEEDOR",
    name: "Solicitud de presupuesto",
    subject: "Solicitud de presupuesto - Somos Sinergia",
    body: "Estimado/a {{senderName}},\n\nDesde Somos Sinergia, nos ponemos en contacto para solicitar presupuesto de los siguientes servicios:\n\n{{details}}\n\nQuedamos a la espera de su propuesta.\n\nUn cordial saludo,\nDavid Miquel Jordá\nSomos Sinergia",
  },
  {
    id: "confirmacion-pago",
    category: "FACTURA",
    name: "Confirmación de pago realizado",
    subject: "Re: {{originalSubject}} - Pago realizado",
    body: "Estimado/a {{senderName}},\n\nLe confirmamos que hemos realizado el pago correspondiente a la factura {{invoiceRef}} por importe de {{amount}}.\n\nAdjuntamos justificante de transferencia.\n\nUn cordial saludo,\nSomos Sinergia",
  },
  {
    id: "respuesta-cliente",
    category: "CLIENTE",
    name: "Respuesta a consulta de cliente",
    subject: "Re: {{originalSubject}}",
    body: "Estimado/a {{senderName}},\n\nGracias por contactar con Somos Sinergia.\n\n{{response}}\n\nQuedamos a su disposición para cualquier consulta adicional.\n\nUn cordial saludo,\nDavid Miquel Jordá\nGerente - Somos Sinergia\nTel: 965 369 000",
  },
  {
    id: "seguimiento-proveedor",
    category: "PROVEEDOR",
    name: "Seguimiento a proveedor",
    subject: "Seguimiento - {{originalSubject}}",
    body: "Estimado/a {{senderName}},\n\nNos ponemos en contacto para hacer seguimiento de nuestra última comunicación referente a {{topic}}.\n\nAgradecemos su respuesta a la mayor brevedad.\n\nUn cordial saludo,\nSomos Sinergia",
  },
  {
    id: "reclamacion",
    category: "PROVEEDOR",
    name: "Reclamación / Incidencia",
    subject: "Incidencia - {{originalSubject}}",
    body: "Estimado/a {{senderName}},\n\nNos ponemos en contacto para comunicarles la siguiente incidencia:\n\n{{details}}\n\nSolicitamos su atención y resolución lo antes posible.\n\nUn cordial saludo,\nSomos Sinergia",
  },
  {
    id: "agradecimiento",
    category: "CLIENTE",
    name: "Agradecimiento",
    subject: "Re: {{originalSubject}}",
    body: "Estimado/a {{senderName}},\n\nMuchas gracias por su confianza en Somos Sinergia.\n\n{{message}}\n\nEsperamos seguir colaborando con ustedes.\n\nUn cordial saludo,\nDavid Miquel Jordá\nSomos Sinergia",
  },
];

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

/** GET /api/agent/templates — Return predefined response templates */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return NextResponse.json({
    templates: TEMPLATES,
  } as TemplatesResponse);
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

    // Find template
    const template = TEMPLATES.find((t) => t.id === templateId);
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
