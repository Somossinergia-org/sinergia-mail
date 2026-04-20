"use client";

import { useState } from "react";

interface SubTabDef {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface SubTabsProps {
  tabs: SubTabDef[];
  defaultTab?: string;
  children: (activeSubTab: string) => React.ReactNode;
}

export default function SubTabs({ tabs, defaultTab, children }: SubTabsProps) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id || "");

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              active === tab.id
                ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      {/* Content */}
      {children(active)}
    </div>
  );
}
