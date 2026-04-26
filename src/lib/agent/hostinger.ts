/**
 * Hostinger API Client
 *
 * Acceso programático a la cuenta Hostinger del usuario para:
 *   - Listar y administrar dominios
 *   - Leer y editar registros DNS (crítico para migración a Vercel)
 *   - Info read-only de VPS (sin SSH ni control)
 *   - Snapshots, billing read-only
 *
 * Auth: Bearer token via env var HOSTINGER_API_TOKEN
 *   Generar en: https://hpanel.hostinger.com → Developer → API
 *
 * Docs: https://developers.hostinger.com/
 *
 * NO tiene capacidad de:
 *   - SSH al VPS (intencionado, decisión usuario)
 *   - Eliminar dominios o VPS (no expuesto)
 *   - Cargar a tarjeta (billing solo lectura)
 */

import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "hostinger" });

const BASE_URL = "https://developers.hostinger.com/api";

interface HostingerError {
  message: string;
  status?: number;
}

class HostingerClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Hostinger API ${init.method || "GET"} ${path} → ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Domains ──────────────────────────────────────────────────────────

  domains = {
    /** Lista todos los dominios del portafolio */
    list: () => this.request<Array<{
      domain: string;
      status: string;
      type?: string;
      registered_at?: string;
      expires_at?: string;
      auto_renew?: boolean;
    }>>("/domains/v1/portfolio"),

    /** Verifica disponibilidad y precio de un dominio */
    checkAvailability: (domain: string, tlds?: string[]) =>
      this.request<{
        domain: string;
        is_available: boolean;
        is_alternative?: boolean;
        prices?: Array<{ tld: string; price: number; currency: string; period: number }>;
      }>(`/domains/v1/availability`, {
        method: "POST",
        body: JSON.stringify({ domain, tlds: tlds || ["com", "es", "net"] }),
      }),
  };

  // ── DNS ──────────────────────────────────────────────────────────────

  dns = {
    /** Lista registros DNS de un dominio (zone records) */
    list: (domain: string) =>
      this.request<Array<{
        name: string;
        type: string;
        ttl: number;
        records: Array<{ content: string; disabled?: boolean }>;
      }>>(`/dns/v1/zones/${encodeURIComponent(domain)}`),

    /**
     * Actualiza la zone completa (PUT). PRECAUCION: reemplaza toda la zona.
     * Usar dns.upsertRecord() para cambios puntuales (más seguro).
     */
    replaceZone: (domain: string, zone: Array<{ name: string; type: string; ttl: number; records: Array<{ content: string }> }>) =>
      this.request<{ message: string }>(`/dns/v1/zones/${encodeURIComponent(domain)}`, {
        method: "PUT",
        body: JSON.stringify({ zone, overwrite: true }),
      }),

    /**
     * Upsert seguro: actualiza un registro específico sin tocar el resto.
     * Lee la zona, modifica/añade el registro indicado, y la escribe.
     * Si no existe registro con ese name+type, lo CREA.
     */
    upsertRecord: async (domain: string, name: string, type: string, content: string, ttl = 3600) => {
      const zone = await this.dns.list(domain);
      const idx = zone.findIndex((r) => r.name === name && r.type === type);
      if (idx >= 0) {
        zone[idx] = { name, type, ttl, records: [{ content }] };
      } else {
        zone.push({ name, type, ttl, records: [{ content }] });
      }
      await this.request<{ message: string }>(`/dns/v1/zones/${encodeURIComponent(domain)}`, {
        method: "PUT",
        body: JSON.stringify({ zone, overwrite: true }),
      });
      return { name, type, content, ttl, action: idx >= 0 ? "updated" : "created" };
    },

    /** Resetea DNS a valores por defecto de Hostinger */
    reset: (domain: string) =>
      this.request<{ message: string }>(`/dns/v1/zones/${encodeURIComponent(domain)}/reset`, { method: "POST" }),
  };

  // ── VPS (read-only) ──────────────────────────────────────────────────

  vps = {
    /** Lista VPS asociados a la cuenta */
    list: () => this.request<Array<{
      id: number;
      hostname: string;
      state: string;
      ipv4?: string;
      ipv6?: string;
      template?: string;
      cpus?: number;
      memory?: number;
      disk?: number;
      datacenter?: string;
    }>>("/vps/v1/virtual-machines"),

    /** Detalles de un VPS específico (por ID) */
    get: (id: number) => this.request<unknown>(`/vps/v1/virtual-machines/${id}`),

    /** Estadísticas de uso (CPU, RAM, disco) */
    metrics: (id: number) => this.request<unknown>(`/vps/v1/virtual-machines/${id}/metrics`),
  };
}

// ── Client factory ───────────────────────────────────────────────────────

let _client: HostingerClient | null = null;

export function getHostingerClient(): HostingerClient {
  if (!_client) {
    const token = process.env.HOSTINGER_API_TOKEN;
    if (!token) {
      throw new Error(
        "HOSTINGER_API_TOKEN no configurado. Generar en hpanel.hostinger.com → Developer → API y añadir como env var en Vercel.",
      );
    }
    _client = new HostingerClient(token);
  }
  return _client;
}

export function isHostingerAvailable(): boolean {
  return !!process.env.HOSTINGER_API_TOKEN;
}

// ── Tool handlers (para registrar en super-tools.ts) ────────────────────

import type { ToolHandlerResult } from "./tools";

export async function hostingerListDomainsHandler(_userId: string, _args: Record<string, unknown>): Promise<ToolHandlerResult> {
  if (!isHostingerAvailable()) {
    return { ok: false, error: "Hostinger API no configurada (falta HOSTINGER_API_TOKEN en Vercel env)" };
  }
  try {
    const wp = getHostingerClient();
    const domains = await wp.domains.list();
    return { ok: true, domains, count: domains.length };
  } catch (err) {
    logError(log, err, {}, "hostinger_list_domains failed");
    return { ok: false, error: String(err) };
  }
}

export async function hostingerListDnsHandler(_userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const domain = args.domain as string;
  if (!domain) return { ok: false, error: "domain es obligatorio" };
  if (!isHostingerAvailable()) return { ok: false, error: "Hostinger API no configurada" };
  try {
    const wp = getHostingerClient();
    const records = await wp.dns.list(domain);
    return { ok: true, domain, records, count: records.length };
  } catch (err) {
    logError(log, err, { domain }, "hostinger_list_dns failed");
    return { ok: false, error: String(err) };
  }
}

export async function hostingerUpsertDnsHandler(_userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const domain = args.domain as string;
  const name = args.name as string;
  const type = args.type as string;
  const content = args.content as string;
  const ttl = (args.ttl as number) || 3600;
  if (!domain || !name || !type || !content) {
    return { ok: false, error: "domain, name, type, content son obligatorios" };
  }
  if (!["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV"].includes(type)) {
    return { ok: false, error: `type inválido: ${type}` };
  }
  if (!isHostingerAvailable()) return { ok: false, error: "Hostinger API no configurada" };
  try {
    const wp = getHostingerClient();
    const result = await wp.dns.upsertRecord(domain, name, type, content, ttl);
    log.info({ domain, name, type, action: result.action }, "DNS record upserted");
    return { ok: true, ...result };
  } catch (err) {
    logError(log, err, { domain, name, type }, "hostinger_upsert_dns failed");
    return { ok: false, error: String(err) };
  }
}

export async function hostingerListVpsHandler(_userId: string, _args: Record<string, unknown>): Promise<ToolHandlerResult> {
  if (!isHostingerAvailable()) return { ok: false, error: "Hostinger API no configurada" };
  try {
    const wp = getHostingerClient();
    const vps = await wp.vps.list();
    return { ok: true, vps, count: vps.length };
  } catch (err) {
    logError(log, err, {}, "hostinger_list_vps failed");
    return { ok: false, error: String(err) };
  }
}

export async function hostingerVpsMetricsHandler(_userId: string, args: Record<string, unknown>): Promise<ToolHandlerResult> {
  const id = Number(args.id);
  if (!id || isNaN(id)) return { ok: false, error: "id numérico obligatorio" };
  if (!isHostingerAvailable()) return { ok: false, error: "Hostinger API no configurada" };
  try {
    const wp = getHostingerClient();
    const metrics = await wp.vps.metrics(id);
    return { ok: true, id, metrics };
  } catch (err) {
    logError(log, err, { id }, "hostinger_vps_metrics failed");
    return { ok: false, error: String(err) };
  }
}

// ── Registry para super-tools.ts ─────────────────────────────────────────

import type { SuperToolDefinition } from "./super-tools";

export const HOSTINGER_TOOLS: SuperToolDefinition[] = [
  {
    name: "hostinger_list_domains",
    openaiTool: {
      type: "function",
      function: {
        name: "hostinger_list_domains",
        description: "Lista todos los dominios registrados en la cuenta Hostinger del usuario, con estado, fecha de registro y vencimiento. Usar para inventario, alertas de renovación, o antes de cambiar DNS.",
        parameters: { type: "object", properties: {} },
      },
    },
    handler: hostingerListDomainsHandler,
  },
  {
    name: "hostinger_list_dns",
    openaiTool: {
      type: "function",
      function: {
        name: "hostinger_list_dns",
        description: "Lista los registros DNS de un dominio (A, AAAA, CNAME, MX, TXT, NS). Útil para diagnosticar a dónde apunta un dominio antes de modificarlo.",
        parameters: {
          type: "object",
          properties: {
            domain: { type: "string", description: "Dominio (ej: somossinergia.es)" },
          },
          required: ["domain"],
        },
      },
    },
    handler: hostingerListDnsHandler,
  },
  {
    name: "hostinger_upsert_dns",
    openaiTool: {
      type: "function",
      function: {
        name: "hostinger_upsert_dns",
        description: "Crea o actualiza un registro DNS de forma segura (lee zona, modifica solo el registro indicado, escribe). Caso típico: apuntar dominio a Vercel (CNAME @ → cname.vercel-dns.com). PRECAUCIÓN: cambios DNS tardan 5-30 min en propagar.",
        parameters: {
          type: "object",
          properties: {
            domain: { type: "string", description: "Dominio raíz (ej: somossinergia.es)" },
            name: { type: "string", description: "Nombre del registro (@ para raíz, www, mail, etc.)" },
            type: { type: "string", enum: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV"] },
            content: { type: "string", description: "Valor del registro (IP, hostname, etc.)" },
            ttl: { type: "number", description: "TTL en segundos. Default 3600" },
          },
          required: ["domain", "name", "type", "content"],
        },
      },
    },
    handler: hostingerUpsertDnsHandler,
  },
  {
    name: "hostinger_list_vps",
    openaiTool: {
      type: "function",
      function: {
        name: "hostinger_list_vps",
        description: "Lista VPS asociados a la cuenta Hostinger (read-only). Devuelve hostname, IP, estado, recursos. NO permite SSH ni control del servidor — solo info.",
        parameters: { type: "object", properties: {} },
      },
    },
    handler: hostingerListVpsHandler,
  },
  {
    name: "hostinger_vps_metrics",
    openaiTool: {
      type: "function",
      function: {
        name: "hostinger_vps_metrics",
        description: "Métricas de uso (CPU, RAM, disco, red) de un VPS específico. Útil para detectar si está infrautilizado (candidato a apagar) o saturado.",
        parameters: {
          type: "object",
          properties: { id: { type: "number", description: "ID del VPS (de hostinger_list_vps)" } },
          required: ["id"],
        },
      },
    },
    handler: hostingerVpsMetricsHandler,
  },
];
