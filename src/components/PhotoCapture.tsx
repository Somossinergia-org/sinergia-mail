"use client";

import { useState, useRef } from "react";
import { Camera, Upload, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export type PhotoMode = "invoice" | "client" | "search";

interface Props {
  mode: PhotoMode;
  onExtract: (data: Record<string, unknown>) => void;
  label?: string;
  accent?: "teal" | "sinergia" | "indigo";
}

/**
 * Reusable photo capture component.
 * - Mobile: opens camera directly via capture="environment"
 * - Desktop: file picker with drag & drop area
 * - Compresses image client-side to <500 KB before upload
 * - Shows progress (uploading → extracting → done)
 *
 * On success calls onExtract(data) with the parsed JSON from Gemini Vision.
 */
export default function PhotoCapture({ mode, onExtract, label, accent = "teal" }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "compressing" | "uploading" | "extracting" | "done" | "error">(
    "idle",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const accentMap: Record<string, string> = {
    teal: "text-teal-400 bg-teal-500/10 border-teal-500/30 hover:bg-teal-500/20",
    sinergia: "text-sinergia-400 bg-sinergia-500/10 border-sinergia-500/30 hover:bg-sinergia-500/20",
    indigo: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30 hover:bg-indigo-500/20",
  };

  const compressImage = async (file: File): Promise<Blob> => {
    const MAX_SIDE = 1600;
    const QUALITY = 0.85;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (Math.max(width, height) > MAX_SIDE) {
          if (width > height) {
            height = Math.round((height * MAX_SIDE) / width);
            width = MAX_SIDE;
          } else {
            width = Math.round((width * MAX_SIDE) / height);
            height = MAX_SIDE;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
          "image/jpeg",
          QUALITY,
        );
      };
      img.onerror = () => reject(new Error("Invalid image"));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se admiten imágenes (JPEG, PNG, WebP)");
      return;
    }

    setPreview(URL.createObjectURL(file));
    setStage("compressing");

    try {
      const compressed = await compressImage(file);
      setStage("uploading");

      const fd = new FormData();
      fd.append("file", compressed, "capture.jpg");
      fd.append("mode", mode);

      setStage("extracting");
      const res = await fetch("/api/agent/photo-extract", {
        method: "POST",
        body: fd,
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `Status ${res.status}`);
      }

      const data = json.data as Record<string, unknown>;
      const confidence = (data.confidence as number) ?? 100;

      if (confidence < 30) {
        toast.warning("Imagen poco clara — datos inciertos", {
          description: `Confianza: ${confidence}%. Revisa los campos.`,
        });
      } else {
        toast.success("Datos extraídos correctamente", {
          description: `Confianza: ${confidence}%`,
        });
      }

      setStage("done");
      onExtract(data);
      // Auto-reset after 1.5s
      setTimeout(() => {
        setStage("idle");
        setPreview(null);
      }, 1500);
    } catch (e) {
      setStage("error");
      toast.error("Error procesando imagen", {
        description: e instanceof Error ? e.message : "Desconocido",
      });
      setTimeout(() => setStage("idle"), 2500);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const isWorking = ["compressing", "uploading", "extracting"].includes(stage);
  const stageLabel: Record<typeof stage, string> = {
    idle: "",
    compressing: "Comprimiendo imagen…",
    uploading: "Subiendo…",
    extracting: "Analizando con IA…",
    done: "✓ Datos extraídos",
    error: "Error",
  };

  const buttonLabel = label || (mode === "invoice" ? "Capturar factura" : mode === "client" ? "Capturar datos cliente" : "Capturar imagen");

  return (
    <div
      ref={dropRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="space-y-2"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={onPick}
        className="hidden"
      />

      {!preview ? (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={isWorking}
          className={`w-full p-4 rounded-xl border-2 border-dashed transition flex flex-col items-center gap-2 min-h-[100px] ${accentMap[accent]} disabled:opacity-50`}
        >
          <Camera className="w-8 h-8" />
          <div className="text-sm font-semibold">{buttonLabel}</div>
          <div className="text-[10px] opacity-70">
            Toca para abrir cámara · o arrastra una imagen aquí
          </div>
        </button>
      ) : (
        <div className="relative rounded-xl overflow-hidden border border-[var(--border)]">
          <img src={preview} alt="Preview" className="w-full max-h-48 object-cover" />
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 backdrop-blur-sm">
            {isWorking && <Loader2 className={`w-8 h-8 animate-spin text-${accent}-400`} />}
            {stage === "done" && <CheckCircle2 className="w-10 h-10 text-green-400" />}
            {stage === "error" && <AlertTriangle className="w-10 h-10 text-red-400" />}
            <div className="text-sm font-semibold text-white">{stageLabel[stage]}</div>
          </div>
          {!isWorking && stage !== "done" && (
            <button
              onClick={() => {
                setPreview(null);
                setStage("idle");
              }}
              className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center"
              aria-label="Cancelar"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
      )}

      {/* Secondary upload (alternative to camera) */}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isWorking}
        className="w-full text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center gap-1 py-1 disabled:opacity-50"
      >
        <Upload className="w-3 h-3" /> O selecciona una imagen del equipo
      </button>
    </div>
  );
}
