/**
 * Import Module — Shared Types
 * MVP: empresas, contactos, puntos de suministro
 */

export type ImportEntity = "companies" | "contacts" | "supplyPoints";

export type ClientType = "particular" | "autonomo" | "empresa";

export interface ImportFieldMapping {
  /** Alias aceptados para este campo (lowercase, sin tildes) */
  aliases: string[];
  /** Nombre del campo destino en DB */
  dbField: string;
  /** Es obligatorio */
  required: boolean;
  /** Función de transformación */
  transform?: (value: string) => unknown;
  /** Función de validación — devuelve string de error o null */
  validate?: (value: unknown) => string | null;
}

export interface ImportEntityConfig {
  entity: ImportEntity;
  /** Clave(s) de deduplicación */
  dedupKeys: string[];
  /** Mapeo de campos */
  fields: ImportFieldMapping[];
  /** Campos que se autogeneran (no importar) */
  autoFields: string[];
}

export interface ParsedRow {
  /** Índice de fila original (1-based, excluyendo header) */
  rowIndex: number;
  /** Datos mapeados a campos destino */
  data: Record<string, unknown>;
  /** Campos raw originales (para debug) */
  raw: Record<string, string>;
}

export interface RowValidationError {
  rowIndex: number;
  field: string;
  value: unknown;
  message: string;
}

export interface ImportRowResult {
  rowIndex: number;
  action: "inserted" | "updated" | "skipped" | "error";
  entityId?: number;
  errors?: RowValidationError[];
  /** Datos raw para referencia */
  rawPreview?: Record<string, string>;
}

export interface ImportResult {
  entity: ImportEntity;
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  rows: ImportRowResult[];
  /** Mapeo de headers detectado: headerOriginal → campoDestino */
  headerMapping: Record<string, string>;
  /** Headers que no se pudieron mapear */
  unmappedHeaders: string[];
  /** Duración en ms */
  durationMs: number;
}

export interface ImportOptions {
  /** userId del usuario que importa */
  userId: string;
  /** Si true, solo valida sin insertar */
  dryRun?: boolean;
  /** Máximo de filas a procesar (default: 5000) */
  maxRows?: number;
}
