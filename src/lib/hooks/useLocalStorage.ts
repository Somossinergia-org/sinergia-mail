"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * useLocalStorage — hook SSR-safe.
 *
 * Comportamiento:
 *   - En el primer render (SSR/CSR antes de la hidratación) devuelve `initialValue`
 *     para que server y client coincidan y NO haya warning de hidratación.
 *   - En un useEffect post-hidratación lee el valor real de localStorage y lo aplica.
 *   - Persiste cambios en localStorage al setear.
 *   - Sincroniza entre pestañas (storage event).
 *
 * Uso:
 *   const [tab, setTab] = useLocalStorage<Tab>("active-tab", "overview");
 *
 * Limitaciones:
 *   - Sólo serializable JSON (no funciones, dates como string).
 *   - Si JSON.parse falla (formato roto), devuelve initialValue.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  // Lee localStorage tras la hidratación (no en el primer render).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      /* JSON inválido — quedamos con initialValue */
    }
    setHydrated(true);
  }, [key]);

  // Persiste cambios sólo después de hidratar (no escribimos initialValue al cargar).
  useEffect(() => {
    if (!hydrated) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* localStorage bloqueado / quota excedida */
    }
  }, [hydrated, key, value]);

  // Sincroniza entre pestañas.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      if (e.newValue === null) {
        setValue(initialValue);
        return;
      }
      try {
        setValue(JSON.parse(e.newValue) as T);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, initialValue]);

  const remove = useCallback(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    setValue(initialValue);
  }, [key, initialValue]);

  return [value, setValue, remove];
}
