"use client";

/**
 * CrmPanel — Orchestrator for the CRM section.
 * Manages navigation between company list, company detail, and opportunities.
 * Used as a sub-tab within the main dashboard.
 */

import { useState } from "react";
import CrmCompaniesPanel from "./CrmCompaniesPanel";
import CrmCompanyDetailPanel from "./CrmCompanyDetailPanel";

export default function CrmPanel() {
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);

  if (selectedCompanyId) {
    return (
      <CrmCompanyDetailPanel
        companyId={selectedCompanyId}
        onBack={() => setSelectedCompanyId(null)}
      />
    );
  }

  return <CrmCompaniesPanel onSelectCompany={setSelectedCompanyId} />;
}
