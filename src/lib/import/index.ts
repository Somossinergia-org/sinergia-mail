/**
 * Import Module — Public API
 * MVP: empresas, contactos, puntos de suministro
 */

export { importFile } from "./importer";
export { parseFile, MAX_FILE_SIZE, DEFAULT_MAX_ROWS } from "./parser";
export { ENTITY_CONFIGS, detectHeaderMapping, normalizeHeader } from "./aliases";
export type {
  ImportEntity,
  ImportResult,
  ImportRowResult,
  ImportOptions,
  ParsedRow,
  RowValidationError,
  ImportFieldMapping,
  ImportEntityConfig,
  ClientType,
} from "./types";
