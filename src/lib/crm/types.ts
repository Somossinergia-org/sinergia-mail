/**
 * CRM Types — Phase 1 Unification
 * Shared types for the CRM service layer.
 */

// ── Pipeline states (ordered) ──
export const PIPELINE_STATUSES = [
  "pendiente",
  "contactado",
  "interesado",
  "visita_programada",
  "visitado",
  "oferta_enviada",
  "negociacion",
  "contrato_firmado",
  "cliente_activo",
  "perdido",
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

// ── Service types (8 products) ──
export const SERVICE_TYPES = [
  "energia",
  "telecomunicaciones",
  "alarmas",
  "seguros",
  "agentes_ia",
  "web",
  "crm",
  "aplicaciones",
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

// ── Service statuses ──
export const SERVICE_STATUSES = [
  "prospecting",
  "offered",
  "contracted",
  "cancelled",
] as const;

export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

// ── Temperature ──
export type Temperature = "frio" | "tibio" | "caliente";

// ── Priority ──
export type Priority = "alta" | "media" | "baja";

// ── Document types ──
export const DOCUMENT_TYPES = [
  "contrato",
  "factura",
  "oferta",
  "propuesta",
  "dni",
  "otro",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// ── Common query options ──
export interface ListOptions {
  limit?: number;
  offset?: number;
}

export interface CompanyFilters extends ListOptions {
  userId: string;
  search?: string;
  province?: string;
  source?: string;
}

export interface OpportunityFilters extends ListOptions {
  userId: string;
  companyId?: number;
  status?: PipelineStatus;
  temperature?: Temperature;
  priority?: Priority;
}
