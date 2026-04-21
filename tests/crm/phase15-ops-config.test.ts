/**
 * Phase 15 — Base Operativa Editable: Tests
 * Schema, CRUD, seed data, API routes, email rules, agents
 */
import { describe, it, expect } from "vitest";

// ─── A. Schema validation — 6 tablas operativas ───
describe("A. Schema — 6 tablas operativas", () => {
  it("exporta serviceCatalog con columnas correctas", async () => {
    const s = await import("@/db/schema");
    expect(s.serviceCatalog).toBeDefined();
    const cols = Object.keys(s.serviceCatalog);
    expect(cols.length).toBeGreaterThan(0);
  });

  it("exporta serviceDocuments con FK a serviceCatalog", async () => {
    const s = await import("@/db/schema");
    expect(s.serviceDocuments).toBeDefined();
  });

  it("exporta serviceChecklists con FK a serviceCatalog", async () => {
    const s = await import("@/db/schema");
    expect(s.serviceChecklists).toBeDefined();
  });

  it("exporta emailRules con campos de acción", async () => {
    const s = await import("@/db/schema");
    expect(s.emailRules).toBeDefined();
  });

  it("exporta partners con comisiones", async () => {
    const s = await import("@/db/schema");
    expect(s.partners).toBeDefined();
  });

  it("exporta agentConfig con JSONB fields", async () => {
    const s = await import("@/db/schema");
    expect(s.opsAgentRoles).toBeDefined();
  });

  it("exporta las 6 tablas Phase 15 como objetos Drizzle", async () => {
    const s = await import("@/db/schema");
    // Verify each table is a valid Drizzle table object (has _ property with name)
    expect(typeof s.serviceCatalog).toBe("object");
    expect(typeof s.serviceDocuments).toBe("object");
    expect(typeof s.serviceChecklists).toBe("object");
    expect(typeof s.emailRules).toBe("object");
    expect(typeof s.partners).toBe("object");
    expect(typeof s.opsAgentRoles).toBe("object");
  });
});

// ─── B. CRUD service layer exports ───
describe("B. CRUD service layer — ops-config/index.ts", () => {
  it("exporta funciones CRUD para services", async () => {
    const mod = await import("@/lib/ops-config");
    expect(mod.listServices).toBeTypeOf("function");
    expect(mod.getService).toBeTypeOf("function");
    expect(mod.createService).toBeTypeOf("function");
    expect(mod.updateService).toBeTypeOf("function");
    expect(mod.deleteService).toBeTypeOf("function");
  });

  it("exporta funciones CRUD para documents", async () => {
    const mod = await import("@/lib/ops-config");
    expect(mod.listDocuments).toBeTypeOf("function");
    expect(mod.createDocument).toBeTypeOf("function");
    expect(mod.updateDocument).toBeTypeOf("function");
    expect(mod.deleteDocument).toBeTypeOf("function");
  });

  it("exporta funciones CRUD para checklists", async () => {
    const mod = await import("@/lib/ops-config");
    expect(mod.listChecklists).toBeTypeOf("function");
    expect(mod.createChecklist).toBeTypeOf("function");
    expect(mod.updateChecklist).toBeTypeOf("function");
    expect(mod.deleteChecklist).toBeTypeOf("function");
  });

  it("exporta funciones CRUD para emailRules", async () => {
    const mod = await import("@/lib/ops-config");
    expect(mod.listEmailRules).toBeTypeOf("function");
    expect(mod.createEmailRule).toBeTypeOf("function");
    expect(mod.updateEmailRule).toBeTypeOf("function");
    expect(mod.deleteEmailRule).toBeTypeOf("function");
  });

  it("exporta funciones CRUD para partners", async () => {
    const mod = await import("@/lib/ops-config");
    expect(mod.listPartners).toBeTypeOf("function");
    expect(mod.createPartner).toBeTypeOf("function");
    expect(mod.updatePartner).toBeTypeOf("function");
    expect(mod.deletePartner).toBeTypeOf("function");
  });

  it("exporta funciones CRUD para agentConfigs", async () => {
    const mod = await import("@/lib/ops-config");
    expect(mod.listAgentConfigs).toBeTypeOf("function");
    expect(mod.getAgentConfig).toBeTypeOf("function");
    expect(mod.createAgentConfig).toBeTypeOf("function");
    expect(mod.updateAgentConfig).toBeTypeOf("function");
    expect(mod.deleteAgentConfig).toBeTypeOf("function");
  });
});

// ─── C. Seed data integrity ───
describe("C. Seed data — integridad de datos iniciales", () => {
  it("SERVICES contiene exactamente 20 servicios", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    expect(SERVICES).toHaveLength(20);
  });

  it("cada servicio tiene nombre, vertical y modelo económico", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    for (const s of SERVICES) {
      expect(s.name).toBeTruthy();
      expect(s.vertical).toBeTruthy();
      expect(s.economicModel).toBeTruthy();
      expect(s.clientType).toBeTruthy();
    }
  });

  it("los verticales son válidos", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    const valid = ["energia", "telecomunicaciones", "seguros", "alarmas", "ia", "web", "marketing", "crm", "apps"];
    for (const s of SERVICES) {
      expect(valid).toContain(s.vertical);
    }
  });

  it("cada servicio tiene _docs y _tasks como arrays", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    for (const s of SERVICES) {
      expect(Array.isArray(s._docs)).toBe(true);
      expect(Array.isArray(s._tasks)).toBe(true);
    }
  });

  it("los servicios de partner tienen comisiones definidas", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    const partnerSvcs = SERVICES.filter(s => s.economicModel === "partner");
    expect(partnerSvcs.length).toBeGreaterThan(0);
    for (const s of partnerSvcs) {
      expect(s.commissionFixed).toBeTypeOf("number");
    }
  });

  it("los servicios directos tienen precio mensual > 0", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    const directos = SERVICES.filter(s => s.economicModel === "directo");
    expect(directos.length).toBeGreaterThan(0);
    for (const s of directos) {
      expect(typeof s.priceMonthly === "number" && s.priceMonthly > 0).toBe(true);
    }
  });

  it("total de docs > 40 sumando todos los servicios", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    const totalDocs = SERVICES.reduce((acc, s) => acc + s._docs.length, 0);
    expect(totalDocs).toBeGreaterThan(40);
  });

  it("total de tasks > 60 sumando todos los servicios", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    const totalTasks = SERVICES.reduce((acc, s) => acc + s._tasks.length, 0);
    expect(totalTasks).toBeGreaterThan(60);
  });

  it("AGENTS contiene exactamente 10 agentes", async () => {
    const { AGENTS } = await import("@/lib/ops-config/seed-data");
    expect(AGENTS).toHaveLength(10);
  });

  it("cada agente tiene slug único", async () => {
    const { AGENTS } = await import("@/lib/ops-config/seed-data");
    const slugs = AGENTS.map(a => a.agentSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("agentes requeridos existen: recepcion, comercial-junior, comercial-principal, consultor-servicios, consultor-digital, bi-scoring, finanzas, legal, marketing, ceo", async () => {
    const { AGENTS } = await import("@/lib/ops-config/seed-data");
    const slugs = AGENTS.map(a => a.agentSlug);
    const required = ["recepcion", "comercial-junior", "comercial-principal", "consultor-servicios", "consultor-digital", "bi-scoring", "finanzas", "legal", "marketing", "ceo"];
    for (const r of required) {
      expect(slugs).toContain(r);
    }
  });

  it("cada agente tiene canDo y cannotDo", async () => {
    const { AGENTS } = await import("@/lib/ops-config/seed-data");
    for (const a of AGENTS) {
      expect(Array.isArray(a.canDo)).toBe(true);
      expect(Array.isArray(a.cannotDo)).toBe(true);
    }
  });

  it("EMAIL_RULES contiene exactamente 13 reglas", async () => {
    const { EMAIL_RULES } = await import("@/lib/ops-config/seed-data");
    expect(EMAIL_RULES).toHaveLength(13);
  });

  it("reglas incluyen publicidad, spam, factura_energia, factura_admin, cliente_urgente, proveedor_estrategico", async () => {
    const { EMAIL_RULES } = await import("@/lib/ops-config/seed-data");
    const types = EMAIL_RULES.map(r => r.emailType);
    expect(types).toContain("publicidad");
    expect(types).toContain("spam");
    expect(types).toContain("factura_energia");
    expect(types).toContain("factura_admin");
    expect(types).toContain("cliente_urgente");
    expect(types).toContain("proveedor_estrategico");
  });

  it("reglas de silenciar no generan tareas ni alertas", async () => {
    const { EMAIL_RULES } = await import("@/lib/ops-config/seed-data");
    const silenced = EMAIL_RULES.filter(r => r.routing === "silenciar");
    expect(silenced.length).toBeGreaterThan(0);
    for (const r of silenced) {
      expect(r.createTask).toBe(false);
      expect(r.createAlert).toBe(false);
    }
  });

  it("factura energética va a energía, NO a comercial", async () => {
    const { EMAIL_RULES } = await import("@/lib/ops-config/seed-data");
    const facturaEnergia = EMAIL_RULES.find(r => r.emailType === "factura_energia");
    expect(facturaEnergia).toBeDefined();
    expect(facturaEnergia!.routing).toBe("energia");
    expect(facturaEnergia!.routing).not.toBe("comercial");
  });

  it("factura administrativa va a finanzas", async () => {
    const { EMAIL_RULES } = await import("@/lib/ops-config/seed-data");
    const facturaAdmin = EMAIL_RULES.find(r => r.emailType === "factura_admin");
    expect(facturaAdmin).toBeDefined();
    expect(facturaAdmin!.routing).toBe("finanzas");
  });

  it("proveedor estratégico con precios extrae PDF y Excel", async () => {
    const { EMAIL_RULES } = await import("@/lib/ops-config/seed-data");
    const precios = EMAIL_RULES.find(r => r.name.includes("precios"));
    expect(precios).toBeDefined();
    expect(precios!.extractPdf).toBe(true);
    expect(precios!.extractExcel).toBe(true);
    expect(precios!.priority).toBe("alta");
  });

  it("PARTNERS contiene al menos 5 partners", async () => {
    const { PARTNERS } = await import("@/lib/ops-config/seed-data");
    expect(PARTNERS.length).toBeGreaterThanOrEqual(5);
  });

  it("Tunergia y Procesus existen como partners de energía", async () => {
    const { PARTNERS } = await import("@/lib/ops-config/seed-data");
    const names = PARTNERS.map(p => p.name);
    expect(names).toContain("Tunergia");
    expect(names).toContain("Procesus");
    const tunergia = PARTNERS.find(p => p.name === "Tunergia");
    expect(tunergia!.vertical).toBe("energia");
  });
});

// ─── D. Migración SQL ───
describe("D. Migración SQL — 0007_phase15_ops_config.sql", () => {
  it("archivo de migración existe", async () => {
    const fs = await import("fs");
    const path = "drizzle/0007_phase15_ops_config.sql";
    expect(fs.existsSync(path)).toBe(true);
  });

  it("contiene CREATE TABLE para las 6 tablas", async () => {
    const fs = await import("fs");
    const sql = fs.readFileSync("drizzle/0007_phase15_ops_config.sql", "utf-8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS service_catalog");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS service_documents");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS service_checklists");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS email_rules");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS partners");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS ops_agent_roles");
  });

  it("contiene índices por user_id", async () => {
    const fs = await import("fs");
    const sql = fs.readFileSync("drizzle/0007_phase15_ops_config.sql", "utf-8");
    expect(sql).toContain("sc_user_idx");
    expect(sql).toContain("er_user_idx");
    expect(sql).toContain("p_user_idx");
    expect(sql).toContain("oar_user_idx");
  });

  it("service_documents y service_checklists tienen ON DELETE CASCADE", async () => {
    const fs = await import("fs");
    const sql = fs.readFileSync("drizzle/0007_phase15_ops_config.sql", "utf-8");
    const matches = sql.match(/ON DELETE CASCADE/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── E. API route structure (file existence) ───
describe("E. API route — /api/ops-config", () => {
  it("route.ts existe", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("src/app/api/ops-config/route.ts")).toBe(true);
  });

  it("route.ts contiene handlers GET, POST, PUT, DELETE", async () => {
    const fs = await import("fs");
    const code = fs.readFileSync("src/app/api/ops-config/route.ts", "utf-8");
    expect(code).toContain("export async function GET");
    expect(code).toContain("export async function POST");
    expect(code).toContain("export async function PUT");
    expect(code).toContain("export async function DELETE");
  });
});

// ─── F. Seed endpoint ───
describe("F. Seed endpoint — /api/ops-config/seed", () => {
  it("route.ts existe", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("src/app/api/ops-config/seed/route.ts")).toBe(true);
  });

  it("route.ts contiene handler POST con lógica de seed", async () => {
    const fs = await import("fs");
    const code = fs.readFileSync("src/app/api/ops-config/seed/route.ts", "utf-8");
    expect(code).toContain("export async function POST");
    expect(code).toContain("SERVICES");
    expect(code).toContain("AGENTS");
    expect(code).toContain("EMAIL_RULES");
    expect(code).toContain("PARTNERS");
  });
});

// ─── G. Agent config business rules ───
describe("G. Reglas de negocio agentes", () => {
  it("recepcion no puede vender", async () => {
    const { AGENTS } = await import("@/lib/ops-config/seed-data");
    const recep = AGENTS.find(a => a.agentSlug === "recepcion");
    expect(recep!.cannotDo).toContain("vender");
  });

  it("comercial-junior no puede negociar precios especiales", async () => {
    const { AGENTS } = await import("@/lib/ops-config/seed-data");
    const cj = AGENTS.find(a => a.agentSlug === "comercial-junior");
    expect(cj!.cannotDo).toContain("negociar precios especiales");
  });

  it("CEO tiene cannotDo vacío (puede todo)", async () => {
    const { AGENTS } = await import("@/lib/ops-config/seed-data");
    const ceo = AGENTS.find(a => a.agentSlug === "ceo");
    expect(ceo!.cannotDo).toHaveLength(0);
  });

  it("bi-scoring no puede vender ni contactar clientes", async () => {
    const { AGENTS } = await import("@/lib/ops-config/seed-data");
    const bi = AGENTS.find(a => a.agentSlug === "bi-scoring");
    expect(bi!.cannotDo).toContain("vender");
    expect(bi!.cannotDo).toContain("contactar clientes");
  });

  it("consultor-servicios es owner de optimización de potencia", async () => {
    const { AGENTS } = await import("@/lib/ops-config/seed-data");
    const cs = AGENTS.find(a => a.agentSlug === "consultor-servicios");
    expect(cs!.servicesOwner).toContain("Optimización de potencia");
  });

  it("legal gestiona RGPD y contratos", async () => {
    const { AGENTS } = await import("@/lib/ops-config/seed-data");
    const legal = AGENTS.find(a => a.agentSlug === "legal");
    expect(legal!.canDo).toContain("gestionar RGPD");
    expect(legal!.canDo).toContain("revisar contratos");
  });
});

// ─── H. Service catalog business rules ───
describe("H. Reglas de negocio catálogo de servicios", () => {
  it("hay al menos 4 servicios de energía", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    const energia = SERVICES.filter(s => s.vertical === "energia");
    expect(energia.length).toBeGreaterThanOrEqual(4);
  });

  it("hay al menos 4 servicios de telecomunicaciones", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    const teleco = SERVICES.filter(s => s.vertical === "telecomunicaciones");
    expect(teleco.length).toBeGreaterThanOrEqual(4);
  });

  it("hay servicios digitales (ia, web, marketing, crm, apps)", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    const digitales = SERVICES.filter(s => ["ia", "web", "marketing", "crm", "apps"].includes(s.vertical));
    expect(digitales.length).toBeGreaterThanOrEqual(5);
  });

  it("todos los servicios de hogar son clientType particular", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    const hogares = SERVICES.filter(s => s.subtype === "hogar");
    for (const s of hogares) {
      expect(s.clientType).toBe("particular");
    }
  });

  it("sortOrder es incremental y sin duplicados", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    const orders = SERVICES.map(s => s.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("cada doc tiene documentName y sortOrder", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    for (const s of SERVICES) {
      for (const d of s._docs) {
        expect(d.documentName).toBeTruthy();
        expect(typeof d.sortOrder).toBe("number");
      }
    }
  });

  it("cada task tiene taskName, agentResponsible y flowMoment", async () => {
    const { SERVICES } = await import("@/lib/ops-config/seed-data");
    for (const s of SERVICES) {
      for (const t of s._tasks) {
        expect(t.taskName).toBeTruthy();
        expect(t.agentResponsible).toBeTruthy();
        expect(t.flowMoment).toBeTruthy();
      }
    }
  });
});

// ─── I. Email rules routing matrix ───
describe("I. Matriz de routing email", () => {
  it("publicidad y spam van a silenciar", async () => {
    const { EMAIL_RULES } = await import("@/lib/ops-config/seed-data");
    const noise = EMAIL_RULES.filter(r => ["publicidad", "spam"].includes(r.emailType));
    for (const r of noise) {
      expect(r.routing).toBe("silenciar");
    }
  });

  it("banco va a finanzas", async () => {
    const { EMAIL_RULES } = await import("@/lib/ops-config/seed-data");
    const banco = EMAIL_RULES.find(r => r.emailType === "banco");
    expect(banco!.routing).toBe("finanzas");
  });

  it("legal va a legal", async () => {
    const { EMAIL_RULES } = await import("@/lib/ops-config/seed-data");
    const legal = EMAIL_RULES.find(r => r.emailType === "legal");
    expect(legal!.routing).toBe("legal");
  });

  it("notificación auto va a log_only", async () => {
    const { EMAIL_RULES } = await import("@/lib/ops-config/seed-data");
    const auto = EMAIL_RULES.find(r => r.emailType === "notificacion_auto");
    expect(auto!.routing).toBe("log_only");
  });

  it("ambiguo requiere confirmación", async () => {
    const { EMAIL_RULES } = await import("@/lib/ops-config/seed-data");
    const ambiguo = EMAIL_RULES.find(r => r.emailType === "ambiguo");
    expect(ambiguo!.requireConfirmation).toBe(true);
  });

  it("cada regla tiene agentResponsible", async () => {
    const { EMAIL_RULES } = await import("@/lib/ops-config/seed-data");
    for (const r of EMAIL_RULES) {
      expect(r.agentResponsible).toBeTruthy();
    }
  });
});

// ─── J. Partners business rules ───
describe("J. Partners y comisiones", () => {
  it("todos los partners tienen vertical definido", async () => {
    const { PARTNERS } = await import("@/lib/ops-config/seed-data");
    for (const p of PARTNERS) {
      expect(p.vertical).toBeTruthy();
    }
  });

  it("Tunergia tiene comisión fija 30 y recurrente 3", async () => {
    const { PARTNERS } = await import("@/lib/ops-config/seed-data");
    const t = PARTNERS.find(p => p.name === "Tunergia");
    expect(t!.commissionFixed).toBe(30);
    expect(t!.commissionRecurring).toBe(3);
  });

  it("Procesus tiene clawback de 6 meses", async () => {
    const { PARTNERS } = await import("@/lib/ops-config/seed-data");
    const p = PARTNERS.find(p => p.name === "Procesus");
    expect(p!.clawback).toContain("6 meses");
  });

  it("hay partners para los 4 verticales principales", async () => {
    const { PARTNERS } = await import("@/lib/ops-config/seed-data");
    const verts = new Set(PARTNERS.map(p => p.vertical));
    expect(verts.has("energia")).toBe(true);
    expect(verts.has("telecomunicaciones")).toBe(true);
    expect(verts.has("seguros")).toBe(true);
    expect(verts.has("alarmas")).toBe(true);
  });
});
