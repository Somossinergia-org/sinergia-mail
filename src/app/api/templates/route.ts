import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";

/**
 * Templates API — stores templates as memorySources with kind="template".
 *
 * Template data (name, subject, body, variables, category) lives in the
 * metadata JSONB field to avoid creating a new table.
 *
 * GET  — list templates for the current user
 * POST — create / save a template
 * DELETE — delete a template by id (query param)
 */

interface TemplateMetadata {
  name: string;
  subject: string;
  body: string;
  variables: string[];
  category: string;
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

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;

  // Fetch user templates from memorySources with kind="template"
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

  // Merge defaults with user templates (defaults first, user templates after)
  const defaults = DEFAULT_TEMPLATES.map((t, i) => ({
    id: `default-${i}`,
    ...t,
    isCustom: false,
  }));

  return NextResponse.json({ templates: [...defaults, ...userTemplates] });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await req.json();

  const { name, subject, body: templateBody, variables, category } = body as {
    name?: string;
    subject?: string;
    body?: string;
    variables?: string[];
    category?: string;
  };

  if (!name || !subject || !templateBody) {
    return NextResponse.json(
      { error: "Faltan campos obligatorios: name, subject, body" },
      { status: 400 }
    );
  }

  const metadata: TemplateMetadata = {
    name,
    subject,
    body: templateBody,
    variables: variables ?? [],
    category: category ?? "General",
  };

  const [inserted] = await db
    .insert(schema.memorySources)
    .values({
      userId,
      kind: "template",
      title: name,
      content: templateBody,
      summary: subject,
      metadata: metadata as unknown as Record<string, unknown>,
    })
    .returning();

  return NextResponse.json({
    template: {
      id: String(inserted.id),
      ...metadata,
      isCustom: true,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const templateId = req.nextUrl.searchParams.get("id");

  if (!templateId || templateId.startsWith("default-")) {
    return NextResponse.json(
      { error: "No se puede eliminar un template por defecto o sin ID" },
      { status: 400 }
    );
  }

  const numericId = parseInt(templateId, 10);
  if (isNaN(numericId)) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  await db
    .delete(schema.memorySources)
    .where(
      and(
        eq(schema.memorySources.id, numericId),
        eq(schema.memorySources.userId, userId),
        eq(schema.memorySources.kind, "template")
      )
    );

  return NextResponse.json({ ok: true });
}
