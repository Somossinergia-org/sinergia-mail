"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Upload, FileText, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface Props {
  /** Called with the dropped file (image or PDF). */
  onFileDrop: (file: File) => void;
}

/**
 * Window-level drag-and-drop overlay.
 *
 * Listens to dragenter/dragleave/drop on the entire document and shows a
 * full-screen overlay with hint when an image or PDF is being dragged in.
 * Drops are forwarded to onFileDrop, which typically opens the FloatingAgent
 * and processes the file.
 */
export default function GlobalDropZone({ onFileDrop }: Props) {
  const [active, setActive] = useState(false);
  const counter = useRef(0); // dragenter/leave fire many times for nested elements

  const isFileDrag = useCallback((e: DragEvent) => {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes("Files");
  }, []);

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      counter.current += 1;
      setActive(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      counter.current -= 1;
      if (counter.current <= 0) {
        counter.current = 0;
        setActive(false);
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (isFileDrag(e)) e.preventDefault(); // required to allow drop
    };
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      counter.current = 0;
      setActive(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";
      if (!isImage && !isPdf) {
        toast.error("Solo imágenes (JPG/PNG/WebP) o PDF");
        return;
      }
      onFileDrop(file);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [isFileDrag, onFileDrop]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-sinergia-500/15 backdrop-blur-md flex items-center justify-center pointer-events-none">
      <div className="bg-[var(--bg-primary)]/90 border-4 border-dashed border-sinergia-400 rounded-3xl p-12 max-w-md text-center shadow-2xl">
        <Upload className="w-16 h-16 text-sinergia-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Suelta el archivo aquí</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Sinergia AI lo procesará automáticamente y te dirá qué hacer.
        </p>
        <div className="flex items-center justify-center gap-4 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1">
            <ImageIcon className="w-3.5 h-3.5" /> Imagen
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" /> PDF
          </span>
        </div>
      </div>
    </div>
  );
}
