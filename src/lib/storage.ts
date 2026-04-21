/**
 * Storage Helper — Vercel Blob primary, local disk fallback for dev/test.
 *
 * Phase 3.5: Real document storage for energy bills and CRM documents.
 * Uses @vercel/blob when BLOB_READ_WRITE_TOKEN is set (production/staging).
 * Falls back to local /tmp/uploads for development and tests.
 *
 * Exports:
 *  - uploadFile(buffer, fileName, options) → { url, pathname }
 *  - deleteFile(url) → void
 *  - computeFileHash(buffer) → sha256 hex string
 */

import { createHash } from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────

export interface UploadResult {
  url: string;
  pathname: string;
}

export interface UploadOptions {
  /** Subfolder inside the store (e.g. "energy-bills", "documents") */
  folder?: string;
  /** Content-Type of the file */
  contentType?: string;
  /** Whether the file should be publicly accessible (default: true for Vercel Blob) */
  access?: "public";
}

// ─── Hash ───────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a buffer. Used for deduplication of uploaded files.
 */
export function computeFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

// ─── Upload ─────────────────────────────────────────────────────────────

/**
 * Upload a file to the configured storage backend.
 *
 * Production: uses Vercel Blob (requires BLOB_READ_WRITE_TOKEN env var).
 * Dev/Test: writes to local filesystem under /tmp/uploads/.
 */
export async function uploadFile(
  buffer: Buffer,
  fileName: string,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const folder = options.folder ?? "uploads";
  const pathname = `${folder}/${Date.now()}-${sanitizeFileName(fileName)}`;

  // ── Vercel Blob (production) ──
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(pathname, buffer, {
      access: options.access ?? "public",
      contentType: options.contentType ?? "application/octet-stream",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return { url: blob.url, pathname: blob.pathname };
  }

  // ── Local fallback (dev/test) ──
  const fs = await import("fs/promises");
  const path = await import("path");
  const dir = path.join("/tmp", folder);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join("/tmp", pathname);
  await fs.writeFile(filePath, buffer);
  return { url: `/local-storage/${pathname}`, pathname };
}

// ─── Delete ─────────────────────────────────────────────────────────────

/**
 * Delete a file from the configured storage backend.
 */
export async function deleteFile(url: string): Promise<void> {
  if (process.env.BLOB_READ_WRITE_TOKEN && !url.startsWith("/local-storage/")) {
    const { del } = await import("@vercel/blob");
    await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    return;
  }

  // Local fallback
  if (url.startsWith("/local-storage/")) {
    const fs = await import("fs/promises");
    const localPath = `/tmp/${url.replace("/local-storage/", "")}`;
    await fs.unlink(localPath).catch(() => {});
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .substring(0, 100);
}
