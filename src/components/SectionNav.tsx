"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface NavSection {
  title: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

interface SectionNavProps {
  sections: NavSection[];
  defaultTab?: string;
  children: (activeTab: string) => React.ReactNode;
}

/**
 * SectionNav — sidebar lateral con secciones plegables.
 * Sustituye a SubTabs cuando hay muchas pestañas (>6).
 * En móvil se colapsa en un selector desplegable.
 */
export default function SectionNav({ sections, defaultTab, children }: SectionNavProps) {
  const allItems = sections.flatMap((s) => s.items);
  const [active, setActive] = useState(defaultTab || allItems[0]?.id || "");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    sections.forEach((s) => {
      // Open the section that contains the default tab, or if defaultOpen is set
      const containsActive = s.items.some((i) => i.id === (defaultTab || allItems[0]?.id));
      init[s.title] = s.defaultOpen ?? containsActive;
    });
    return init;
  });

  // Mobile: which section is the active item in?
  const activeItem = allItems.find((i) => i.id === active);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const handleSelect = (id: string) => {
    setActive(id);
    setMobileOpen(false);
    // Auto-open the section containing the selected item
    const section = sections.find((s) => s.items.some((i) => i.id === id));
    if (section && !openSections[section.title]) {
      setOpenSections((prev) => ({ ...prev, [section.title]: true }));
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* ── Mobile selector ── */}
      <div className="md:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-sm font-medium"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        >
          <span className="flex items-center gap-2">
            {activeItem?.icon}
            {activeItem?.label ?? "Seleccionar"}
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${mobileOpen ? "rotate-180" : ""}`}
            style={{ color: "var(--text-secondary)" }}
          />
        </button>
        {mobileOpen && (
          <div
            className="mt-1 rounded-xl overflow-hidden shadow-lg z-50"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            {sections.map((section) => (
              <div key={section.title}>
                <div
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-secondary)", background: "var(--bg-hover)" }}
                >
                  {section.title}
                </div>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                      active === item.id ? "text-cyan-400" : ""
                    }`}
                    style={{
                      color: active === item.id ? undefined : "var(--text-primary)",
                      background: active === item.id ? "rgba(6,182,212,0.1)" : "transparent",
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Desktop sidebar ── */}
      <nav
        className="hidden md:block shrink-0 w-48 rounded-xl overflow-hidden self-start"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {sections.map((section, idx) => (
          <div key={section.title}>
            {idx > 0 && (
              <div className="mx-3" style={{ borderTop: "1px solid var(--border)" }} />
            )}
            <button
              onClick={() => toggleSection(section.title)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-wider hover:bg-[var(--bg-hover)] transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              {section.title}
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  openSections[section.title] ? "rotate-180" : ""
                }`}
              />
            </button>
            {openSections[section.title] && (
              <div className="pb-1">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      active === item.id
                        ? "text-cyan-400 bg-cyan-500/10 border-r-2 border-cyan-400"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <span className="w-4 h-4 flex items-center justify-center shrink-0">
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* ── Content ── */}
      <div className="flex-1 min-w-0">{children(active)}</div>
    </div>
  );
}
