import { addSource, searchMemory } from "@/lib/memory";
import { db, schema } from "@/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "knowledge-base" });

/* ------------------------------------------------------------------ */
/*  Pre-built business knowledge for Somos Sinergia                   */
/* ------------------------------------------------------------------ */

const SINERGIA_KNOWLEDGE = [
  {
    title: "Sobre Somos Sinergia",
    content: `Somos Sinergia Buen Fin de Mes SL (CIF B10730505) es una consultoria energetica y tecnologica con sede en Orihuela, Alicante, Espana.
    Gerente: David Miquel Jorda. Email: orihuela@somossinergia.es.
    Servicios: consultoria energetica, optimizacion de tarifas electricas, gestion de facturas de clientes,
    auditorias energeticas, instalaciones fotovoltaicas, tramitacion de subvenciones,
    gestion administrativa integral, transformacion digital para PYMEs.
    Zona de operacion: Vega Baja del Segura, Alicante, Comunidad Valenciana.
    Horario: Lunes a Viernes 9:00-14:00 y 16:00-19:00.
    IMPORTANTE: Las facturas electricas que llegan al email son de CLIENTES (material de trabajo para analisis), NO gastos propios de la empresa. Sinergia es consultoria, no consumidora de energia. Los gastos propios son: alquiler, software, telefonia, etc.`,
    kind: "note" as const,
    tags: ["empresa", "info-general", "knowledge-base"],
  },
  {
    title: "Servicios y tarifas de Somos Sinergia",
    content: `Servicios principales:
    1. Consultoria energetica: analisis de consumo, comparativa de comercializadoras, optimizacion de potencia contratada
    2. Auditoria energetica: revision completa de instalaciones, propuestas de ahorro
    3. Gestion de facturas: revision mensual de facturas electricas, deteccion de errores de facturacion
    4. Instalaciones fotovoltaicas: dimensionamiento, tramitacion, instalacion y mantenimiento
    5. Tramitacion de subvenciones: ayudas de eficiencia energetica, Next Generation EU
    6. Gestion administrativa: facturacion, contabilidad basica, RGPD, correspondencia
    7. Transformacion digital: implementacion de herramientas digitales para PYMEs
    Tarifas reguladas espanolas: 2.0TD (<=15kW), 3.0TD (>15kW), 6.1TD (alta tension)
    Comercializadoras frecuentes: Iberdrola, Endesa, Naturgy, Holaluz, Repsol, TotalEnergies`,
    kind: "note" as const,
    tags: ["servicios", "tarifas", "knowledge-base"],
  },
  {
    title: "Procesos internos de Somos Sinergia",
    content: `Proceso de captacion de cliente:
    1. Contacto inicial (email, telefono, visita)
    2. Solicitud de factura electrica para analisis
    3. Elaboracion de informe con propuesta de ahorro
    4. Presentacion al cliente (visita o videollamada)
    5. Firma de contrato de servicios
    6. Alta en sistema de gestion y seguimiento mensual

    Proceso de gestion de facturas:
    1. Recepcion de factura (email o portal)
    2. Extraccion automatica con IA (Sinergia Mail)
    3. Verificacion de datos (NIF, importes, IVA)
    4. Clasificacion por proveedor y categoria
    5. Contabilizacion y archivo en Drive
    6. Alerta de vencimiento de pago

    Respuestas estandar:
    - Primer contacto: agradecer y solicitar factura para analisis gratuito
    - Seguimiento: recordar propuesta enviada y ofrecer aclaracion
    - Factura recibida: confirmar recepcion y plazo de revision (48h)
    - Reclamacion: acusar recibo y dar plazo maximo de resolucion (5 dias laborables)`,
    kind: "note" as const,
    tags: ["procesos", "workflow", "knowledge-base"],
  },
  {
    title: "Normativa y regulacion energetica Espana",
    content: `Normativa clave:
    - RD 244/2019: autoconsumo fotovoltaico, compensacion de excedentes
    - RD 1164/2001: tarifas de acceso
    - Circular 3/2020 CNMC: peajes de transporte y distribucion
    - IVA facturas electricas: 21% (general), 10% reducido temporal hasta 2026
    - Impuesto Electricidad: 5.11269632% sobre base (exento temporal hasta 2026)
    - Modelo 303 IVA trimestral: enero(4T), abril(1T), julio(2T), octubre(3T)
    - Modelo 390 resumen anual IVA: enero
    - RGPD: obligatorio registro de actividades de tratamiento, DPD si >250 empleados
    - Factura electronica obligatoria: Ley Crea y Crece (2026 para PYMEs)`,
    kind: "note" as const,
    tags: ["normativa", "legal", "energia", "knowledge-base"],
  },
  {
    title: "Politica de comunicacion de Somos Sinergia",
    content: `Tono: profesional pero cercano. Nunca frio ni excesivamente formal.
    Tratamiento: "usted" para primer contacto, "tu" cuando el cliente lo inicie.
    Firma: "Un saludo cordial, David Miquel Jorda - Somos Sinergia - orihuela@somossinergia.es"
    Idioma: siempre espanol. Si el email llega en ingles, responder en ingles mencionando que operamos en espanol.
    Urgencias: facturas a punto de vencer, cortes de suministro, reclamaciones. Respuesta maxima 4 horas.
    Newsletters: no enviamos spam. Solo comunicaciones relevantes con consentimiento.
    RGPD: nunca compartir datos de clientes sin consentimiento expreso.`,
    kind: "note" as const,
    tags: ["comunicacion", "politica", "knowledge-base"],
  },
];

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface KnowledgeEntry {
  id: number;
  title: string;
  content: string;
  tags: string[] | null;
  createdAt: Date | null;
  starred: boolean;
}

export interface KnowledgeResult {
  id: number;
  title: string;
  content: string;
  tags: string[] | null;
  similarity: number;
  createdAt: Date | null;
}

export interface KnowledgeStats {
  total: number;
  byTag: Record<string, number>;
  lastUpdated: Date | null;
}

/* ------------------------------------------------------------------ */
/*  seedKnowledgeBase                                                  */
/* ------------------------------------------------------------------ */

/**
 * Seeds the default Somos Sinergia business knowledge into the memory store.
 * Skips if knowledge already exists (checks for "empresa" tag).
 */
export async function seedKnowledgeBase(
  userId: string,
): Promise<{ seeded: number }> {
  // Check if already seeded by looking for the "empresa" tag
  const existing = await db.execute<{ cnt: string }>(sql`
    SELECT COUNT(*)::text AS cnt
    FROM memory_sources
    WHERE user_id = ${userId}
      AND kind = 'note'
      AND 'empresa' = ANY(tags)
  `);
  const count = Number(
    (existing as unknown as { cnt: string }[])[0]?.cnt ?? "0",
  );
  if (count > 0) {
    log.info({ userId }, "knowledge base already seeded, skipping");
    return { seeded: 0 };
  }

  let seeded = 0;
  for (const entry of SINERGIA_KNOWLEDGE) {
    try {
      await addSource({
        userId,
        kind: entry.kind,
        title: entry.title,
        content: entry.content,
        tags: entry.tags,
        metadata: { source: "knowledge-base-seed" },
      });
      seeded++;
    } catch (err) {
      log.error({ err, title: entry.title }, "failed to seed knowledge entry");
    }
  }

  log.info({ userId, seeded }, "knowledge base seeded");
  return { seeded };
}

/* ------------------------------------------------------------------ */
/*  addKnowledge                                                       */
/* ------------------------------------------------------------------ */

/**
 * Add a custom knowledge entry to the business knowledge base.
 */
export async function addKnowledge(
  userId: string,
  title: string,
  content: string,
  tags?: string[],
): Promise<{ id: number }> {
  const finalTags = [...(tags || []), "knowledge-base", "custom"];
  const result = await addSource({
    userId,
    kind: "note",
    title,
    content,
    tags: finalTags,
    metadata: { source: "knowledge-base-manual" },
  });
  const id = result.ids[0];
  if (!id) throw new Error("Failed to create knowledge entry");
  log.info({ userId, id, title }, "knowledge entry added");
  return { id };
}

/* ------------------------------------------------------------------ */
/*  searchKnowledge                                                    */
/* ------------------------------------------------------------------ */

/**
 * Semantic search across the business knowledge base.
 */
export async function searchKnowledge(
  userId: string,
  query: string,
  limit = 5,
): Promise<KnowledgeResult[]> {
  const results = await searchMemory(userId, query, { limit, kind: "note" });
  return results.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    tags: null, // searchMemory doesn't return tags; we'll fetch them separately if needed
    similarity: r.similarity,
    createdAt: r.createdAt,
  }));
}

/* ------------------------------------------------------------------ */
/*  listKnowledge                                                      */
/* ------------------------------------------------------------------ */

/**
 * List all knowledge-base entries for the user.
 */
export async function listKnowledge(
  userId: string,
): Promise<KnowledgeEntry[]> {
  const rows = await db.execute<{
    id: number;
    title: string;
    content: string;
    tags: string[] | null;
    created_at: Date | null;
    starred: boolean;
  }>(sql`
    SELECT id, title, content, tags, created_at, starred
    FROM memory_sources
    WHERE user_id = ${userId}
      AND kind = 'note'
      AND 'knowledge-base' = ANY(tags)
    ORDER BY created_at DESC
  `);

  return (rows as unknown as Array<{
    id: number;
    title: string;
    content: string;
    tags: string[] | null;
    created_at: Date | null;
    starred: boolean;
  }>).map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    tags: r.tags,
    createdAt: r.created_at,
    starred: r.starred,
  }));
}

/* ------------------------------------------------------------------ */
/*  deleteKnowledge                                                    */
/* ------------------------------------------------------------------ */

/**
 * Delete a knowledge entry by ID (only if it belongs to the user).
 */
export async function deleteKnowledge(
  userId: string,
  id: number,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM memory_sources
    WHERE id = ${id}
      AND user_id = ${userId}
      AND kind = 'note'
      AND 'knowledge-base' = ANY(tags)
  `);
  log.info({ userId, id }, "knowledge entry deleted");
}

/* ------------------------------------------------------------------ */
/*  getKnowledgeStats                                                  */
/* ------------------------------------------------------------------ */

/**
 * Get aggregate stats for the knowledge base.
 */
export async function getKnowledgeStats(
  userId: string,
): Promise<KnowledgeStats> {
  // Total count
  const totalRows = await db.execute<{ cnt: string }>(sql`
    SELECT COUNT(*)::text AS cnt
    FROM memory_sources
    WHERE user_id = ${userId}
      AND kind = 'note'
      AND 'knowledge-base' = ANY(tags)
  `);
  const total = Number(
    (totalRows as unknown as { cnt: string }[])[0]?.cnt ?? "0",
  );

  // Count by tag (unnest tags array)
  const tagRows = await db.execute<{ tag: string; cnt: string }>(sql`
    SELECT tag, COUNT(*)::text AS cnt
    FROM memory_sources, unnest(tags) AS tag
    WHERE user_id = ${userId}
      AND kind = 'note'
      AND 'knowledge-base' = ANY(tags)
      AND tag != 'knowledge-base'
    GROUP BY tag
    ORDER BY cnt DESC
  `);

  const byTag: Record<string, number> = {};
  for (const row of tagRows as unknown as { tag: string; cnt: string }[]) {
    byTag[row.tag] = Number(row.cnt);
  }

  // Last updated
  const lastRows = await db.execute<{ last: Date | null }>(sql`
    SELECT MAX(created_at) AS last
    FROM memory_sources
    WHERE user_id = ${userId}
      AND kind = 'note'
      AND 'knowledge-base' = ANY(tags)
  `);
  const lastUpdated =
    (lastRows as unknown as { last: Date | null }[])[0]?.last ?? null;

  return { total, byTag, lastUpdated };
}
