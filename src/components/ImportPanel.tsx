"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Loader2, Info } from "lucide-react";

type ImportEntity = "companies" | "contacts" | "supplyPoints";

interface ImportRowResult {
  rowIndex: number;
  action: "inserted" | "updated" | "skipped" | "error";
  entityId?: number;
  errors?: { field: string; message: string; value: unknown }[];
  rawPreview?: Record<string, string>;
}

interface ImportResponse {
  success: boolean;
  dryRun: boolean;
  entity: ImportEntity;
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  rows: ImportRowResult[];
  headerMapping: Record<string, string>;
  unmappedHeaders: string[];
  durationMs: number;
  error?: string;
}

const ENTITY_OPTIONS: { value: ImportEntity; label: string; desc: string }[] = [
  { value: "companies", label: "Empresas", desc: "Dedup por NIF. Campos: nombre, NIF, dirección, teléfono, email, tipo cliente..." },
  { value: "contacts", label: "Contactos", desc: "Dedup por email. Campos: nombre, email, teléfono, empresa, categoría..." },
  { value: "supplyPoints", label: "Puntos de suministro", desc: "Dedup por CUPS+empresa. Campos: CUPS, empresa, tarifa, potencias, consumo..." },
];

export default function ImportPanel() {
  const [entity, setEntity] = useState<ImportEntity>("companies");
  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
      setErrorMsg(null);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entity", entity);
      formData.append("dryRun", String(dryRun));

      const res = await fetch("/api/import", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Error desconocido");
        return;
      }

      setResult(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [file, entity, dryRun]);

  const errorRows = result?.rows.filter((r) => r.action === "error") ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Importar datos
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Carga empresas, contactos o puntos de suministro desde archivos Excel (.xlsx) o CSV.
        </p>
      </div>

      {/* Orden de importación */}
      <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
        <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
          <strong>Orden obligatorio:</strong> 1) Empresas, 2) Contactos (se vinculan a empresas), 3) Puntos de suministro (requieren empresa existente).
        </div>
      </div>

      {/* Selector de entidad */}
      <div className="space-y-2">
        <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Tipo de datos
        </label>
        <div className="grid gap-2">
          {ENTITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setEntity(opt.value); setResult(null); }}
              className="text-left p-3 rounded-lg transition-colors"
              style={{
                background: entity === opt.value ? "var(--accent-subtle)" : "var(--bg-card)",
                border: `1px solid ${entity === opt.value ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {opt.label}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {opt.desc}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Upload */}
      <div className="space-y-2">
        <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Archivo
        </label>
        <div
          onClick={() => fileRef.current?.click()}
          className="flex items-center justify-center gap-2 p-6 rounded-lg cursor-pointer transition-colors hover:opacity-80"
          style={{
            background: "var(--bg-card)",
            border: "2px dashed var(--border)",
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />
          {file ? (
            <>
              <FileSpreadsheet className="w-5 h-5" style={{ color: "var(--accent)" }} />
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </span>
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Arrastra o haz clic para seleccionar archivo (.xlsx, .csv)
              </span>
            </>
          )}
        </div>
      </div>

      {/* Modo */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
            Simulación (no guarda datos — solo valida)
          </span>
        </label>
      </div>

      {/* Botón */}
      <button
        onClick={handleImport}
        disabled={!file || loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        style={{
          background: dryRun ? "var(--bg-hover)" : "var(--accent)",
          color: dryRun ? "var(--text-primary)" : "#fff",
          border: `1px solid ${dryRun ? "var(--border)" : "var(--accent)"}`,
        }}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        {loading ? "Procesando..." : dryRun ? "Validar archivo" : "Importar datos"}
      </button>

      {/* Error global */}
      {errorMsg && (
        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
          <span className="text-sm text-red-400">{errorMsg}</span>
        </div>
      )}

      {/* Resultados */}
      {result && (
        <div className="space-y-4">
          {/* Resumen */}
          <div className="p-4 rounded-lg space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2">
              {result.errors === 0 ? (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
              )}
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {result.dryRun ? "Simulación completada" : "Importación completada"}
              </span>
              <span className="text-xs ml-auto" style={{ color: "var(--text-secondary)" }}>
                {result.durationMs}ms
              </span>
            </div>

            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{result.totalRows}</div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Total</div>
              </div>
              <div>
                <div className="text-lg font-bold text-green-400">{result.inserted}</div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Nuevos</div>
              </div>
              <div>
                <div className="text-lg font-bold text-blue-400">{result.updated}</div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Actualizados</div>
              </div>
              <div>
                <div className="text-lg font-bold text-red-400">{result.errors}</div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>Errores</div>
              </div>
            </div>
          </div>

          {/* Mapeo de headers */}
          {Object.keys(result.headerMapping).length > 0 && (
            <details className="rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <summary className="p-3 cursor-pointer text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Mapeo de columnas detectado ({Object.keys(result.headerMapping).length} campos)
              </summary>
              <div className="px-3 pb-3 space-y-1">
                {Object.entries(result.headerMapping).map(([header, field]) => (
                  <div key={header} className="flex items-center gap-2 text-xs">
                    <span style={{ color: "var(--text-secondary)" }}>{header}</span>
                    <span style={{ color: "var(--text-secondary)" }}>→</span>
                    <span className="font-mono" style={{ color: "var(--accent)" }}>{field}</span>
                  </div>
                ))}
                {result.unmappedHeaders.length > 0 && (
                  <div className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                    Columnas ignoradas: {result.unmappedHeaders.join(", ")}
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Errores por fila */}
          {errorRows.length > 0 && (
            <details open className="rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <summary className="p-3 cursor-pointer text-sm font-medium text-red-400">
                Errores ({errorRows.length} filas)
              </summary>
              <div className="px-3 pb-3 space-y-2 max-h-60 overflow-y-auto">
                {errorRows.slice(0, 50).map((row) => (
                  <div key={row.rowIndex} className="text-xs p-2 rounded" style={{ background: "var(--bg-hover)" }}>
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                      Fila {row.rowIndex}:
                    </span>{" "}
                    {row.errors?.map((e, i) => (
                      <span key={i} className="text-red-400">
                        {e.field}: {e.message}
                        {i < (row.errors?.length ?? 0) - 1 ? " | " : ""}
                      </span>
                    ))}
                    {row.rawPreview && (
                      <div className="mt-1" style={{ color: "var(--text-secondary)" }}>
                        {Object.entries(row.rawPreview).map(([k, v]) => `${k}=${v}`).join(", ")}
                      </div>
                    )}
                  </div>
                ))}
                {errorRows.length > 50 && (
                  <div className="text-xs text-center" style={{ color: "var(--text-secondary)" }}>
                    ... y {errorRows.length - 50} errores más
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Acción post-validación */}
          {result.dryRun && result.errors === 0 && result.totalRows > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">
                Validación correcta. Desmarca "Simulación" y vuelve a importar para guardar los datos.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
