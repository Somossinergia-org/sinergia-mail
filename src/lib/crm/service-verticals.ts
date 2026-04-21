/**
 * Service Verticals — Type-safe definitions for each Sinergia service vertical.
 *
 * Each vertical uses the shared `services` table columns for common data
 * (type, status, currentProvider, currentSpendEur, offeredPriceEur,
 *  estimatedSavings, contractDate, expiryDate, notes)
 * and stores extra detail in the JSONB `data` column.
 *
 * This module provides:
 *  - TypeScript interfaces for each vertical's `data` shape
 *  - Vertical metadata (labels, descriptions, icons)
 *  - Validation helpers
 *  - Portfolio summary builder
 */

// ─── Vertical Types ──────────────────────────────────────────────────

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

export const SERVICE_STATUSES = [
  "prospecting",
  "offered",
  "contracted",
  "cancelled",
] as const;

export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

// ─── Per-Vertical Data Shapes ────────────────────────────────────────

/** Telecomunicaciones: fibra, móvil, fijo */
export interface TelecomData {
  /** fibra | movil | fijo | convergente */
  lineType?: string;
  /** Número de líneas */
  lineCount?: number;
  /** Velocidad fibra (Mbps) */
  fiberSpeedMbps?: number;
  /** Datos móviles (GB) */
  mobileDataGb?: number;
  /** Tiene permanencia vigente */
  hasPermanencia?: boolean;
  /** Fecha fin permanencia */
  permanenciaEnd?: string;
}

/** Alarmas: sistemas de seguridad */
export interface AlarmasData {
  /** Tipo: alarma_conectada | videovigilancia | control_accesos | mixto */
  serviceType?: string;
  /** Número de dispositivos */
  deviceCount?: number;
  /** Tiene permanencia */
  hasPermanencia?: boolean;
  /** Fecha fin permanencia */
  permanenciaEnd?: string;
  /** Incluye mantenimiento */
  includesMaintenance?: boolean;
}

/** Seguros: pólizas empresariales */
export interface SegurosData {
  /** Tipo: responsabilidad_civil | multirriesgo | vida | salud | vehiculos | cyber | otro */
  insuranceType?: string;
  /** Aseguradora actual */
  insurer?: string;
  /** Prima anual EUR */
  annualPremiumEur?: number;
  /** Fecha vencimiento póliza */
  policyExpiryDate?: string;
  /** Coberturas principales */
  coverages?: string[];
}

/** Agentes IA: soluciones de inteligencia artificial */
export interface AgentesIaData {
  /** Tipo: chatbot | asistente_ventas | automatizacion | analisis | custom */
  solutionType?: string;
  /** Alcance / descripción de la solución */
  scope?: string;
  /** Cuota mensual EUR */
  monthlyFeeEur?: number;
  /** Nº de agentes/bots */
  agentCount?: number;
  /** Incluye mantenimiento */
  includesMaintenance?: boolean;
}

/** Web: diseño y desarrollo web */
export interface WebData {
  /** Tipo: web_corporativa | ecommerce | landing | webapp | rediseno */
  projectType?: string;
  /** Presupuesto total EUR */
  budgetEur?: number;
  /** Cuota mantenimiento mensual EUR */
  maintenanceFeeEur?: number;
  /** Dominio asociado */
  domain?: string;
  /** Hosting incluido */
  includesHosting?: boolean;
}

/** CRM: implantación de CRM */
export interface CrmData {
  /** Tipo: implantacion | migracion | personalizacion | formacion */
  implType?: string;
  /** Nº usuarios */
  userCount?: number;
  /** Cuota mensual EUR */
  monthlyFeeEur?: number;
  /** Plataforma: sinergia | hubspot | salesforce | zoho | otro */
  platform?: string;
}

/** Aplicaciones: desarrollo de apps */
export interface AplicacionesData {
  /** Tipo: app_movil | app_web | integracion | automatizacion | custom */
  appType?: string;
  /** Presupuesto total EUR */
  budgetEur?: number;
  /** Cuota mantenimiento mensual EUR */
  maintenanceFeeEur?: number;
  /** Plataformas: ios | android | web | multiplataforma */
  platforms?: string[];
}

/** Energía: ya se gestiona vía supply_points y energy_bills, pero el servicio necesita mínimos */
export interface EnergiaData {
  /** CUPS vinculado principal */
  mainCups?: string;
  /** Tarifa actual */
  tariff?: string;
  /** Potencia contratada (kW) */
  contractedPowerKw?: number;
}

/** Union de todos los verticales */
export type VerticalData =
  | TelecomData
  | AlarmasData
  | SegurosData
  | AgentesIaData
  | WebData
  | CrmData
  | AplicacionesData
  | EnergiaData;

// ─── Vertical Metadata ───────────────────────────────────────────────

export interface VerticalMeta {
  type: ServiceType;
  label: string;
  labelShort: string;
  description: string;
  icon: string; // emoji for UI
  color: string; // tailwind color class
}

export const VERTICAL_META: Record<ServiceType, VerticalMeta> = {
  energia: {
    type: "energia",
    label: "Energía",
    labelShort: "Energía",
    description: "Suministro eléctrico, gas, optimización energética",
    icon: "⚡",
    color: "yellow",
  },
  telecomunicaciones: {
    type: "telecomunicaciones",
    label: "Telecomunicaciones",
    labelShort: "Telecom",
    description: "Fibra, móvil, fijo, convergente",
    icon: "📡",
    color: "blue",
  },
  alarmas: {
    type: "alarmas",
    label: "Alarmas",
    labelShort: "Alarmas",
    description: "Seguridad, videovigilancia, control de accesos",
    icon: "🔒",
    color: "red",
  },
  seguros: {
    type: "seguros",
    label: "Seguros",
    labelShort: "Seguros",
    description: "Pólizas empresariales, responsabilidad civil, multirriesgo",
    icon: "🛡️",
    color: "green",
  },
  agentes_ia: {
    type: "agentes_ia",
    label: "Agentes IA",
    labelShort: "IA",
    description: "Chatbots, asistentes de ventas, automatización IA",
    icon: "🤖",
    color: "purple",
  },
  web: {
    type: "web",
    label: "Web",
    labelShort: "Web",
    description: "Diseño web, ecommerce, landing pages",
    icon: "🌐",
    color: "indigo",
  },
  crm: {
    type: "crm",
    label: "CRM",
    labelShort: "CRM",
    description: "Implantación y personalización de CRM",
    icon: "📊",
    color: "teal",
  },
  aplicaciones: {
    type: "aplicaciones",
    label: "Aplicaciones",
    labelShort: "Apps",
    description: "Desarrollo de apps móviles y web",
    icon: "📱",
    color: "orange",
  },
};

export function getVerticalMeta(type: string): VerticalMeta | undefined {
  return VERTICAL_META[type as ServiceType];
}

// ─── Client Types per Vertical ──────────────────────────────────────
// "particular" ONLY exists for physical-service verticals (energy, telecom, alarms, insurance).
// Digital-service verticals (IA, web, CRM, apps) are B2B-only: autónomo or empresa.

export const CLIENT_TYPES = ["particular", "autonomo", "empresa"] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  particular: "Particular",
  autonomo: "Autónomo",
  empresa: "Empresa",
};

/** Verticals that accept "particular" as client type */
export const VERTICALS_WITH_PARTICULAR: readonly ServiceType[] = [
  "energia",
  "telecomunicaciones",
  "alarmas",
  "seguros",
] as const;

/** Verticals that are B2B only (autónomo + empresa) */
export const VERTICALS_B2B_ONLY: readonly ServiceType[] = [
  "agentes_ia",
  "web",
  "crm",
  "aplicaciones",
] as const;

/**
 * Returns the valid client types for a given vertical.
 * Physical-service verticals: particular | autónomo | empresa
 * Digital-service verticals: autónomo | empresa
 */
export function getClientTypesForVertical(type: ServiceType): ClientType[] {
  if ((VERTICALS_WITH_PARTICULAR as readonly string[]).includes(type)) {
    return ["particular", "autonomo", "empresa"];
  }
  return ["autonomo", "empresa"];
}

/**
 * Validates if a client type is valid for a given vertical.
 */
export function isValidClientTypeForVertical(clientType: string, vertical: ServiceType): boolean {
  return getClientTypesForVertical(vertical).includes(clientType as ClientType);
}

// ─── Status Metadata ─────────────────────────────────────────────────

export const STATUS_META: Record<ServiceStatus, { label: string; color: string }> = {
  prospecting: { label: "Prospección", color: "gray" },
  offered: { label: "Ofertado", color: "blue" },
  contracted: { label: "Contratado", color: "green" },
  cancelled: { label: "Cancelado", color: "red" },
};

// ─── Validation ──────────────────────────────────────────────────────

export function isValidServiceType(type: string): type is ServiceType {
  return SERVICE_TYPES.includes(type as ServiceType);
}

export function isValidServiceStatus(status: string): status is ServiceStatus {
  return SERVICE_STATUSES.includes(status as ServiceStatus);
}

// ─── Portfolio Summary ───────────────────────────────────────────────

export interface PortfolioSummary {
  totalServices: number;
  byType: Record<ServiceType, { count: number; contracted: number; offered: number; prospecting: number }>;
  activeVerticals: ServiceType[];
  missingVerticals: ServiceType[];
  totalCurrentSpend: number;
  totalEstimatedSavings: number;
}

/**
 * Build a portfolio summary from a list of services.
 * Used by agents and UI to understand a company's service landscape.
 */
export function buildPortfolioSummary(
  services: Array<{
    type: string;
    status: string | null;
    currentSpendEur: number | null;
    estimatedSavings: number | null;
  }>,
): PortfolioSummary {
  const byType = {} as PortfolioSummary["byType"];

  for (const t of SERVICE_TYPES) {
    byType[t] = { count: 0, contracted: 0, offered: 0, prospecting: 0 };
  }

  let totalCurrentSpend = 0;
  let totalEstimatedSavings = 0;

  for (const svc of services) {
    const t = svc.type as ServiceType;
    if (!byType[t]) continue;
    byType[t].count++;
    if (svc.status === "contracted") byType[t].contracted++;
    else if (svc.status === "offered") byType[t].offered++;
    else if (svc.status === "prospecting") byType[t].prospecting++;
    totalCurrentSpend += svc.currentSpendEur ?? 0;
    totalEstimatedSavings += svc.estimatedSavings ?? 0;
  }

  const activeVerticals = SERVICE_TYPES.filter((t) => byType[t].count > 0) as ServiceType[];
  const missingVerticals = SERVICE_TYPES.filter((t) => byType[t].count === 0) as ServiceType[];

  return {
    totalServices: services.length,
    byType,
    activeVerticals,
    missingVerticals,
    totalCurrentSpend,
    totalEstimatedSavings,
  };
}
