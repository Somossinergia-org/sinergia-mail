/**
 * Validadores zod para inputs de los endpoints CRM.
 *
 * Cada endpoint POST/PATCH parsea body con .strict() (rechaza campos extra)
 * y devuelve 400 con mensaje claro si falla. Esto previene:
 *   - Inyección de campos no esperados (userId, id, createdAt, …)
 *   - Body gigantes que llegarían al swarm/DB
 *   - Tipo inválido (number string)
 */

import { z } from "zod";
import { PIPELINE_STATUSES, SERVICE_TYPES } from "@/lib/crm/types";

const NIF_RE = /^[A-Z0-9]{8,12}$/i;
const PHONE_RE = /^[+0-9\s\-()]{6,20}$/;

// ── Companies ────────────────────────────────────────────────────────
export const CompanyCreateSchema = z.object({
  name: z.string().trim().min(1, "name requerido").max(200),
  legalName: z.string().trim().max(200).optional().nullable(),
  nif: z.string().trim().regex(NIF_RE, "NIF/CIF inválido").max(20).optional().nullable(),
  sector: z.string().trim().max(50).optional().nullable(),
  cnae: z.string().trim().max(10).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  province: z.string().trim().max(50).optional().nullable(),
  postalCode: z.string().trim().regex(/^\d{4,5}$/, "CP inválido").max(10).optional().nullable(),
  phone: z.string().regex(PHONE_RE, "teléfono inválido").max(30).optional().nullable(),
  email: z.string().email("email inválido").max(200).optional().nullable(),
  website: z.string().url().max(500).optional().nullable(),
  clientType: z.enum(["particular", "autonomo", "empresa"]).optional(),
  iban: z.string().trim().max(40).optional().nullable(),
  source: z.string().trim().max(30).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  tags: z.array(z.string().trim().max(50)).max(20).optional(),
}).strict();

export type CompanyCreate = z.infer<typeof CompanyCreateSchema>;

// ── Opportunities ────────────────────────────────────────────────────
export const OpportunityCreateSchema = z.object({
  companyId: z.number().int().positive("companyId requerido"),
  title: z.string().trim().min(1, "title requerido").max(200),
  status: z.enum(PIPELINE_STATUSES).optional(),
  temperature: z.enum(["caliente", "tibio", "frio"]).optional(),
  priority: z.enum(["alta", "media", "baja"]).optional(),
  estimatedValueEur: z.number().nonnegative().max(99_999_999).optional().nullable(),
  serviceType: z.enum(SERVICE_TYPES).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  expectedCloseDate: z.string().datetime().optional().nullable(),
  source: z.string().trim().max(30).optional().nullable(),
}).strict();

export type OpportunityCreate = z.infer<typeof OpportunityCreateSchema>;

// ── Tasks ────────────────────────────────────────────────────────────
export const TaskCreateSchema = z.object({
  title: z.string().trim().min(1, "title requerido").max(200),
  companyId: z.number().int().positive().optional().nullable(),
  opportunityId: z.number().int().positive().optional().nullable(),
  caseId: z.number().int().positive().optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(["alta", "media", "baja"]).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  source: z.enum(["manual", "suggested", "followup", "renewal", "case"]).optional(),
}).strict();

export type TaskCreate = z.infer<typeof TaskCreateSchema>;

// ── Contacts ─────────────────────────────────────────────────────────
export const ContactCreateSchema = z.object({
  email: z.string().email("email inválido").max(200),
  name: z.string().trim().max(200).optional().nullable(),
  phone: z.string().regex(PHONE_RE).max(30).optional().nullable(),
  phone2: z.string().regex(PHONE_RE).max(30).optional().nullable(),
  company: z.string().trim().max(200).optional().nullable(),
  companyId: z.number().int().positive().optional().nullable(),
  nif: z.string().trim().regex(NIF_RE).max(20).optional().nullable(),
  category: z.string().trim().max(50).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
}).strict();

export type ContactCreate = z.infer<typeof ContactCreateSchema>;

// ── Helper para devolver error 400 estándar ─────────────────────────
export function zodErrorResponse(err: z.ZodError): { error: string; details: Array<{ path: string; message: string }> } {
  return {
    error: "Validación fallida",
    details: err.issues.slice(0, 10).map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  };
}
