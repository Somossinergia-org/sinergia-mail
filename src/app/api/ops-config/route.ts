/**
 * /api/ops-config — Unified CRUD for all operational config entities.
 *
 * GET    ?entity=services|documents|checklists|email-rules|partners|agents[&serviceId=N]
 * POST   { entity, data }
 * PUT    { entity, id, data }
 * DELETE { entity, id }
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listServices, getService, createService, updateService, deleteService,
  listDocuments, createDocument, updateDocument, deleteDocument,
  listChecklists, createChecklist, updateChecklist, deleteChecklist,
  listEmailRules, createEmailRule, updateEmailRule, deleteEmailRule,
  listPartners, createPartner, updatePartner, deletePartner,
  listAgentConfigs, createAgentConfig, updateAgentConfig, deleteAgentConfig,
} from "@/lib/ops-config";

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return err("No autorizado", 401);
  const userId = session.user.id;

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity");
  const serviceId = searchParams.get("serviceId");

  switch (entity) {
    case "services":
      return NextResponse.json(await listServices(userId));
    case "documents":
      if (!serviceId) return err("serviceId requerido");
      return NextResponse.json(await listDocuments(Number(serviceId)));
    case "checklists":
      if (!serviceId) return err("serviceId requerido");
      return NextResponse.json(await listChecklists(Number(serviceId)));
    case "email-rules":
      return NextResponse.json(await listEmailRules(userId));
    case "partners":
      return NextResponse.json(await listPartners(userId));
    case "agents":
      return NextResponse.json(await listAgentConfigs(userId));
    default:
      return err("entity inválida: services|documents|checklists|email-rules|partners|agents");
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return err("No autorizado", 401);
  const userId = session.user.id;
  const body = await req.json();
  const { entity, data } = body;

  if (!entity || !data) return err("entity y data requeridos");

  try {
    switch (entity) {
      case "services":
        return NextResponse.json(await createService({ ...data, userId }));
      case "documents":
        return NextResponse.json(await createDocument(data));
      case "checklists":
        return NextResponse.json(await createChecklist(data));
      case "email-rules":
        return NextResponse.json(await createEmailRule({ ...data, userId }));
      case "partners":
        return NextResponse.json(await createPartner({ ...data, userId }));
      case "agents":
        return NextResponse.json(await createAgentConfig({ ...data, userId }));
      default:
        return err("entity inválida");
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "Error al crear", 500);
  }
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return err("No autorizado", 401);
  const body = await req.json();
  const { entity, id, data } = body;

  if (!entity || !id || !data) return err("entity, id y data requeridos");

  try {
    switch (entity) {
      case "services":
        return NextResponse.json(await updateService(id, data));
      case "documents":
        return NextResponse.json(await updateDocument(id, data));
      case "checklists":
        return NextResponse.json(await updateChecklist(id, data));
      case "email-rules":
        return NextResponse.json(await updateEmailRule(id, data));
      case "partners":
        return NextResponse.json(await updatePartner(id, data));
      case "agents":
        return NextResponse.json(await updateAgentConfig(id, data));
      default:
        return err("entity inválida");
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "Error al actualizar", 500);
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return err("No autorizado", 401);
  const body = await req.json();
  const { entity, id } = body;

  if (!entity || !id) return err("entity y id requeridos");

  try {
    switch (entity) {
      case "services":
        return NextResponse.json(await deleteService(id));
      case "documents":
        return NextResponse.json(await deleteDocument(id));
      case "checklists":
        return NextResponse.json(await deleteChecklist(id));
      case "email-rules":
        return NextResponse.json(await deleteEmailRule(id));
      case "partners":
        return NextResponse.json(await deletePartner(id));
      case "agents":
        return NextResponse.json(await deleteAgentConfig(id));
      default:
        return err("entity inválida");
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : "Error al eliminar", 500);
  }
}
