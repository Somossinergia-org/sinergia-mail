"use client";

import { useState } from "react";
import { Activity, FileText, Heart } from "lucide-react";
import OperationsHealthPanel from "./OperationsHealthPanel";
import OperationsActivityPanel from "./OperationsActivityPanel";
import OperationsCaseListPanel from "./OperationsCaseListPanel";
import OperationsCaseDetailPanel from "./OperationsCaseDetailPanel";

type SubTab = "health" | "cases" | "activity";

export default function OperationsPanel() {
  const [subTab, setSubTab] = useState<SubTab>("health");
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);

  const tabs: { key: SubTab; label: string; icon: React.ReactNode }[] = [
    { key: "health", label: "Salud", icon: <Heart className="w-3.5 h-3.5" /> },
    { key: "cases", label: "Casos", icon: <FileText className="w-3.5 h-3.5" /> },
    { key: "activity", label: "Actividad", icon: <Activity className="w-3.5 h-3.5" /> },
  ];

  const handleSelectCase = (caseId: number) => {
    setSelectedCaseId(caseId);
  };

  const handleBackFromCase = () => {
    setSelectedCaseId(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Sub-tab navigation */}
      {!selectedCaseId && (
        <div className="flex items-center gap-1 mb-4 border-b border-[var(--border)] pb-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-t-lg transition ${
                subTab === t.key
                  ? "text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {selectedCaseId ? (
          <OperationsCaseDetailPanel caseId={selectedCaseId} onBack={handleBackFromCase} />
        ) : subTab === "health" ? (
          <OperationsHealthPanel />
        ) : subTab === "cases" ? (
          <OperationsCaseListPanel onSelectCase={handleSelectCase} />
        ) : (
          <OperationsActivityPanel />
        )}
      </div>
    </div>
  );
}
