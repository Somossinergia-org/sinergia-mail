/**
 * Import Module — File Parser
 * Parses xlsx/csv files into normalized rows using ExcelJS.
 * Handles header autodetection via alias dictionaries.
 */

import ExcelJS from "exceljs";
import { detectHeaderMapping, ENTITY_CONFIGS } from "./aliases";
import type { ImportEntity, ParsedRow, ImportEntityConfig, RowValidationError } from "./types";

/** Max file size: 10MB */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Max rows per import */
export const DEFAULT_MAX_ROWS = 5000;

/**
 * Parse un Buffer (xlsx o csv) y devuelve filas normalizadas + mapeo de headers.
 */
export async function parseFile(
  buffer: Buffer,
  entity: ImportEntity,
  options?: { maxRows?: number; fileName?: string }
): Promise<{
  rows: ParsedRow[];
  headerMapping: Record<string, string>;
  unmappedHeaders: string[];
  errors: RowValidationError[];
}> {
  const config = ENTITY_CONFIGS[entity];
  if (!config) throw new Error(`Entidad desconocida: ${entity}`);

  const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
  const fileName = options?.fileName ?? "";
  const isCSV = fileName.toLowerCase().endsWith(".csv");

  const workbook = new ExcelJS.Workbook();

  if (isCSV) {
    // Para CSV, ExcelJS necesita un stream — usamos Buffer como string
    const csvText = buffer.toString("utf-8");
    const lines = csvText.split(/\r?\n/);
    // Detectar separador: ; o ,
    const firstLine = lines[0] || "";
    const separator = firstLine.includes(";") ? ";" : ",";

    // Crear workbook manual
    const ws = workbook.addWorksheet("Import");
    for (const line of lines) {
      if (!line.trim()) continue;
      const cells = parseCSVLine(line, separator);
      ws.addRow(cells);
    }
  } else {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("No se encontró ninguna hoja en el archivo");

  // Leer headers (primera fila)
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").trim();
  });

  // Eliminar headers vacíos del final
  while (headers.length > 0 && !headers[headers.length - 1]) {
    headers.pop();
  }

  if (headers.length === 0) throw new Error("No se encontraron headers en la primera fila");

  // Detectar mapeo
  const { mapping, unmapped } = detectHeaderMapping(headers, config);

  // Crear mapeo legible: headerOriginal → campoDestino
  const headerMappingReadable: Record<string, string> = {};
  for (const [idx, dbField] of Object.entries(mapping)) {
    headerMappingReadable[headers[parseInt(idx)]] = dbField;
  }

  // Verificar campos obligatorios
  const mappedFields = new Set(Object.values(mapping));
  const missingRequired = config.fields
    .filter((f) => f.required && !mappedFields.has(f.dbField))
    .map((f) => f.dbField);

  const errors: RowValidationError[] = [];
  if (missingRequired.length > 0) {
    errors.push({
      rowIndex: 0,
      field: missingRequired.join(", "),
      value: null,
      message: `Campos obligatorios no encontrados en headers: ${missingRequired.join(", ")}. Headers detectados: ${headers.join(", ")}`,
    });
  }

  // Parsear filas
  const rows: ParsedRow[] = [];
  let rowCount = 0;

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    if (rowCount >= maxRows) return;
    rowCount++;

    const raw: Record<string, string> = {};
    const data: Record<string, unknown> = {};

    // Leer valores raw
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const idx = colNumber - 1;
      const headerName = headers[idx];
      if (headerName) {
        raw[headerName] = cellToString(cell);
      }
    });

    // Mapear y transformar
    for (const [idxStr, dbField] of Object.entries(mapping)) {
      const idx = parseInt(idxStr);
      const rawValue = cellToString(row.getCell(idx + 1));

      if (!rawValue) continue;

      const fieldConfig = config.fields.find((f) => f.dbField === dbField);
      if (!fieldConfig) continue;

      try {
        const transformed = fieldConfig.transform
          ? fieldConfig.transform(rawValue)
          : rawValue.trim();
        data[dbField] = transformed;
      } catch {
        errors.push({
          rowIndex: rowNumber - 1,
          field: dbField,
          value: rawValue,
          message: `Error transformando valor`,
        });
      }
    }

    // Validar campos
    for (const field of config.fields) {
      if (!field.validate) continue;
      const value = data[field.dbField];

      // Solo validar si el campo existe en los datos o es requerido
      if (value === undefined && !field.required) continue;

      const error = field.validate(value);
      if (error) {
        errors.push({
          rowIndex: rowNumber - 1,
          field: field.dbField,
          value,
          message: error,
        });
      }
    }

    rows.push({
      rowIndex: rowNumber - 1,
      data,
      raw,
    });
  });

  return {
    rows,
    headerMapping: headerMappingReadable,
    unmappedHeaders: unmapped,
    errors,
  };
}

/** Convierte el valor de una celda ExcelJS a string */
function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) {
    return v.toISOString().split("T")[0]; // YYYY-MM-DD
  }
  // ExcelJS rich text
  if (typeof v === "object" && "richText" in v) {
    return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  }
  // Formula result
  if (typeof v === "object" && "result" in v) {
    return String((v as { result: unknown }).result ?? "");
  }
  return String(v);
}

/**
 * Parsea una línea CSV respetando comillas.
 */
function parseCSVLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === separator) {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  cells.push(current);
  return cells;
}
