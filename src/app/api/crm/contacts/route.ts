/**
 * CRM Contacts API — list / link / unlink contacts within company context.
 * Phase 2: enables company-centric contact management.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCompany } from "@/lib/crm/companies";
import {
  linkContactToCompany,
  unlinkContactFromCompany,
  listContactsByCompany,
  listUnlinkedContacts,
} from "@/lib/crm/contacts";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const companyId = params.get("companyId");
  const unlinked = params.get("unlinked");

  try {
    if (unlinked === "true") {
      const rows = await listUnlinkedContacts(session.user.id);
      return NextResponse.json({ contacts: rows });
    }
    if (companyId) {
      const id = parseInt(companyId, 10);
      if (isNaN(id))
        return NextResponse.json({ error: "companyId inválido" }, { status: 400 });
      // Ownership check: company must belong to authenticated user
      const company = await getCompany(id);
      if (!company) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
      if (company.userId !== session.user.id)
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
      const rows = await listContactsByCompany(id);
      return NextResponse.json({ contacts: rows });
    }
    return NextResponse.json({ error: "Falta companyId o unlinked=true" }, { status: 400 });
  } catch (err) {
    console.error("[CRM] listContacts error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await req.json();
    const { contactId, companyId, action } = body;

    if (!contactId || typeof contactId !== "number")
      return NextResponse.json({ error: "contactId requerido (number)" }, { status: 400 });

    // SECURITY (auditoría 2026-04-29): verificar ownership del contacto.
    // El user solo puede link/unlink sus propios contactos.
    const { db, schema } = await import("@/db");
    const { eq: drizEq } = await import("drizzle-orm");
    const contact = await db.query.contacts.findFirst({
      where: drizEq(schema.contacts.id, contactId),
      columns: { id: true, userId: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
    }
    if (contact.userId !== session.user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    if (action === "link") {
      if (!companyId || typeof companyId !== "number")
        return NextResponse.json({ error: "companyId requerido para link" }, { status: 400 });
      // SECURITY: verificar también que la company es del mismo user
      const company = await getCompany(companyId);
      if (!company) {
        return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
      }
      if (company.userId !== session.user.id) {
        return NextResponse.json({ error: "Empresa no autorizada" }, { status: 403 });
      }
      const updated = await linkContactToCompany(contactId, companyId);
      if (!updated) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
      return NextResponse.json(updated);
    }

    if (action === "unlink") {
      const updated = await unlinkContactFromCompany(contactId);
      if (!updated) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "action debe ser 'link' o 'unlink'" }, { status: 400 });
  } catch (err) {
    console.error("[CRM] linkContact error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
