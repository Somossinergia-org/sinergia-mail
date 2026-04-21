"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Mail, FileText, Users, Activity, Zap, Shield, Crown,
  MessageCircle, X, Send, ChevronRight, Cpu, Sparkles,
  Megaphone, Globe,
} from "lucide-react";
import { useOfficeStream } from "@/hooks/useOfficeStream";
import type { OfficeStateSnapshot } from "@/lib/office/types";

// ─── Types ──────────────────────────────────────────────────────────────

type AgentStatus = "idle" | "thinking" | "working" | "delegating" | "done" | "talking" | "walking" | "blocked";
type PersonPose = "sitting" | "standing" | "walking";

interface Position { x: number; y: number }

interface SpeechBubble {
  text: string;
  type: "ambient" | "work" | "tool" | "done";
  expiresAt: number;
}

interface OfficeAgent {
  id: string;
  name: string;
  shortName: string;
  role: string;
  icon: React.ReactNode;
  color: string;
  glow: string;
  status: AgentStatus;
  currentTask: string | null;
  position: Position;       // current rendered position (moves)
  homePosition: Position;   // desk home position (fixed)
  deskType: "executive" | "standard" | "corner";
  avatar: string;
  stats: { tasksToday: number; tokensUsed: number; avgTime: string };
  personality: string;
  speechBubble: SpeechBubble | null;
  walkTarget: Position | null;  // where currently walking to
  pose: PersonPose;             // sitting | standing | walking
}

interface ChatMsg {
  role: "user" | "agent";
  content: string;
  timestamp: number;
}

interface DelegationLine {
  from: string;
  to: string;
  reason: string;
  progress: number;
  id: string;
}

// ─── Office Landmarks (walk-to destinations) ───────────────────────────

const LANDMARKS: Record<string, Position> = {
  coffee: { x: 6, y: 82 },
  water: { x: 10, y: 82 },
  whiteboard: { x: 42, y: 10 },
  meeting: { x: 82, y: 78 },
  bookshelf: { x: 95, y: 42 },
};

// ─── Ambient Speech Lines (per-agent personality) ──────────────────────

const AMBIENT_LINES: Record<string, string[]> = {
  "ceo": [
    "Voy a revisar los KPIs...",
    "¿Cómo van los objetivos?",
    "Necesito un café ☕",
    "Supervisando al equipo...",
    "Mirando la estrategia Q2...",
    "Todo bajo control 👔",
  ],
  "recepcion": [
    "47 emails sin leer... 📧",
    "Reunión en 30 min ⏰",
    "Clasificando bandeja...",
    "Optimizando agenda...",
    "Priorizando urgentes...",
    "Recordatorio enviado 📅",
  ],
  "fiscal": [
    "Cuadrando el IVA... 🧮",
    "3 facturas pendientes",
    "Revisando retenciones...",
    "Todo cuadra ✅",
    "Descargando modelo 303...",
    "Me estiro 5 minutos...",
  ],
  "comercial-principal": [
    "Scoring actualizado 📊",
    "Nuevo lead detectado!",
    "Pipeline looks good 💰",
    "Seguimiento automático...",
    "12 contactos calientes",
    "Vendiendo 8 productos... 💼",
  ],
  "comercial-junior": [
    "Cualificando leads nuevos...",
    "Preparando propuesta 📋",
    "Seguimiento de contactos...",
    "Actualizando CRM...",
    "Aprendiendo del pipeline 📈",
    "Llamada de prospección 📞",
  ],
  "consultor-servicios": [
    "Pico de consumo a las 14h ⚡",
    "Tarifa solar óptima...",
    "Comparando telecom+alarmas...",
    "Ahorro potencial: 340€",
    "Revisando póliza de seguro...",
    "Un momento de break... 🔋",
  ],
  "consultor-digital": [
    "Optimizando flujo IA... ⚙️",
    "CRM configurado!",
    "Automatización lista!",
    "Integrando nueva app...",
    "Pipeline CI/CD verde ✅",
    "Debuggeando webhook...",
  ],
  "legal-rgpd": [
    "RGPD compliance OK ✅",
    "Revisando consentimientos...",
    "DPA actualizado 📋",
    "Política de cookies...",
    "Auditoría trimestral...",
    "Todo en regla ⚖️",
  ],
  "marketing-automation": [
    "SEO subiendo 📈",
    "Creando contenido...",
    "Post programado! 🎯",
    "A/B test resultados...",
    "CTR mejorado un 15%",
    "Necesito inspiración... ☕",
  ],
  "bi-scoring": [
    "Dashboard actualizado 📊",
    "KPI de ventas al día ✅",
    "Analizando tendencias...",
    "Informe semanal listo",
    "Cruzando datos CRM+Fiscal...",
    "Visualización optimizada 🚀",
  ],
};

// ─── Ping-Pong Dialogues (multi-turn conversations) ───────────────────

interface DialogueLine {
  speaker: "a" | "b";  // a = initiator, b = partner
  text: string;
  delay: number;        // ms after previous line
}

interface AgentDialogue {
  agentA: string;
  agentB: string;
  lines: DialogueLine[];
}

const AGENT_DIALOGUES: AgentDialogue[] = [
  {
    agentA: "ceo", agentB: "recepcion",
    lines: [
      { speaker: "a", text: "¿Hay algo urgente en la bandeja? 📧", delay: 0 },
      { speaker: "b", text: "3 emails prioritarios de clientes", delay: 1800 },
      { speaker: "a", text: "Pásame los de facturas a Energía", delay: 1600 },
      { speaker: "b", text: "Hecho, derivados ✅", delay: 1400 },
    ],
  },
  {
    agentA: "ceo", agentB: "fiscal",
    lines: [
      { speaker: "a", text: "¿Cómo va el cierre trimestral?", delay: 0 },
      { speaker: "b", text: "IVA cuadrado, faltan 2 facturas 🧮", delay: 2000 },
      { speaker: "a", text: "¿De proveedores nuestros?", delay: 1500 },
      { speaker: "b", text: "Sí, alquiler y la de software", delay: 1400 },
      { speaker: "a", text: "Recuérdame mañana si no llegan", delay: 1200 },
    ],
  },
  {
    agentA: "comercial-principal", agentB: "marketing-automation",
    lines: [
      { speaker: "a", text: "Necesito más leads cualificados 📊", delay: 0 },
      { speaker: "b", text: "La campaña de SEO está subiendo 📈", delay: 1800 },
      { speaker: "a", text: "¿Cuántos contactos nuevos esta semana?", delay: 1500 },
      { speaker: "b", text: "12 desde la landing, 5 orgánicos", delay: 1600 },
      { speaker: "a", text: "Bien! Los paso al scoring ahora", delay: 1200 },
    ],
  },
  {
    agentA: "fiscal", agentB: "consultor-servicios",
    lines: [
      { speaker: "a", text: "¿Esa factura de Iberdrola es nuestra?", delay: 0 },
      { speaker: "b", text: "No, es del cliente García ⚡", delay: 1600 },
      { speaker: "a", text: "Perfecto, no la registro como gasto", delay: 1400 },
      { speaker: "b", text: "Correcto, es material de análisis 👍", delay: 1200 },
    ],
  },
  {
    agentA: "marketing-automation", agentB: "bi-scoring",
    lines: [
      { speaker: "a", text: "¿Tienes datos de la campaña solar? 🎨", delay: 0 },
      { speaker: "b", text: "Sí, CTR del 3.2% esta semana 📊", delay: 1600 },
      { speaker: "a", text: "¿Y conversión por canal?", delay: 1400 },
      { speaker: "b", text: "SEO 45%, SEM 30%, redes 25% 🚀", delay: 2000 },
      { speaker: "a", text: "Crack! Ajusto la inversión 💪", delay: 1000 },
    ],
  },
  {
    agentA: "legal-rgpd", agentB: "recepcion",
    lines: [
      { speaker: "a", text: "¿Los emails tienen opt-in verificado? ��️", delay: 0 },
      { speaker: "b", text: "Déjame comprobarlo...", delay: 1600 },
      { speaker: "b", text: "Sí, todos con doble confirmación ✅", delay: 2200 },
      { speaker: "a", text: "Perfecto, cumplimos RGPD", delay: 1400 },
    ],
  },
  {
    agentA: "consultor-servicios", agentB: "ceo",
    lines: [
      { speaker: "a", text: "¡Encontré ahorro de 340€/mes! ⚡", delay: 0 },
      { speaker: "b", text: "¿Para qué cliente?", delay: 1500 },
      { speaker: "a", text: "Restaurante López — exceso potencia", delay: 1600 },
      { speaker: "b", text: "Genial, prepara informe para CRM", delay: 1400 },
      { speaker: "a", text: "Ya lo paso al director comercial 📋", delay: 1200 },
    ],
  },
  {
    agentA: "consultor-digital", agentB: "bi-scoring",
    lines: [
      { speaker: "a", text: "He integrado nuevo flujo IA ⚙️", delay: 0 },
      { speaker: "b", text: "¿Ya llegan datos al dashboard?", delay: 1700 },
      { speaker: "a", text: "Sí, CRM + email sincronizados", delay: 1500 },
      { speaker: "b", text: "Confirmado, métricas visibles 🔥", delay: 1600 },
    ],
  },
  {
    agentA: "ceo", agentB: "comercial-principal",
    lines: [
      { speaker: "a", text: "¿Qué tal el pipeline esta semana?", delay: 0 },
      { speaker: "b", text: "8 oportunidades abiertas 💰", delay: 1800 },
      { speaker: "a", text: "¿Cuántas near-close?", delay: 1400 },
      { speaker: "b", text: "3 a punto de firmar, 2 en propuesta", delay: 1600 },
      { speaker: "a", text: "Buen trabajo, prioriza los 3 calientes", delay: 1300 },
    ],
  },
  {
    agentA: "consultor-digital", agentB: "fiscal",
    lines: [
      { speaker: "a", text: "He automatizado el aviso de vencimiento", delay: 0 },
      { speaker: "b", text: "¿A cuántos días antes de pagar?", delay: 1700 },
      { speaker: "a", text: "5 días, con email + dashboard 📬", delay: 1500 },
      { speaker: "b", text: "Perfecto, me ahorra mucho trabajo 👏", delay: 1400 },
    ],
  },
  {
    agentA: "legal-rgpd", agentB: "consultor-digital",
    lines: [
      { speaker: "a", text: "La regla de auto-respuesta ¿cumple RGPD?", delay: 0 },
      { speaker: "b", text: "Incluye link de baja y aviso legal", delay: 1800 },
      { speaker: "a", text: "¿Y retención de datos?", delay: 1500 },
      { speaker: "b", text: "12 meses, con purga automática ✅", delay: 1600 },
      { speaker: "a", text: "Aprobado ⚖️", delay: 1000 },
    ],
  },
];

// Keep simple lines for quick ambient (backwards compat)
const INTER_AGENT_LINES: [string, string, string][] = AGENT_DIALOGUES.map(d => [
  d.agentA, d.agentB, d.lines[0].text,
]);

// ─── Agent Definitions ──────────────────────────────────────────────────

const INITIAL_AGENTS: OfficeAgent[] = [
  {
    id: "ceo",
    name: "Director General",
    shortName: "CEO",
    role: "Orquestador principal",
    icon: <Crown className="w-5 h-5" />,
    color: "#f59e0b",
    glow: "rgba(245, 158, 11, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 50, y: 15 },
    homePosition: { x: 50, y: 15 },
    deskType: "executive",
    avatar: "👨‍💼",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Estratégico, decide quién hace qué",
    speechBubble: null,
    walkTarget: null,
    pose: "sitting" as PersonPose,
  },
  {
    id: "recepcion",
    name: "Recepción / Triage",
    shortName: "Recep.",
    role: "Email + Agenda",
    icon: <Mail className="w-5 h-5" />,
    color: "#3b82f6",
    glow: "rgba(59, 130, 246, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 15, y: 38 },
    homePosition: { x: 15, y: 38 },
    deskType: "standard",
    avatar: "👩‍💼",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Organizada, gestiona email y agenda",
    speechBubble: null,
    walkTarget: null,
    pose: "sitting" as PersonPose,
  },
  {
    id: "fiscal",
    name: "Fiscal / Facturación",
    shortName: "Fiscal",
    role: "Facturas e IVA",
    icon: <FileText className="w-5 h-5" />,
    color: "#10b981",
    glow: "rgba(16, 185, 129, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 85, y: 38 },
    homePosition: { x: 85, y: 38 },
    deskType: "standard",
    avatar: "👨‍💼",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Preciso, nunca redondea cifras",
    speechBubble: null,
    walkTarget: null,
    pose: "sitting" as PersonPose,
  },
  {
    id: "comercial-principal",
    name: "Comercial Principal",
    shortName: "C.Princ.",
    role: "Ventas 8 productos",
    icon: <Users className="w-5 h-5" />,
    color: "#ec4899",
    glow: "rgba(236, 72, 153, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 38, y: 38 },
    homePosition: { x: 38, y: 38 },
    deskType: "standard",
    avatar: "💼",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Relacional, vende los 8 productos",
    speechBubble: null,
    walkTarget: null,
    pose: "sitting" as PersonPose,
  },
  {
    id: "comercial-junior",
    name: "Comercial Junior",
    shortName: "C.Junior",
    role: "Apoyo comercial",
    icon: <Users className="w-5 h-5" />,
    color: "#f97316",
    glow: "rgba(249, 115, 22, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 62, y: 38 },
    homePosition: { x: 62, y: 38 },
    deskType: "standard",
    avatar: "🎯",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Proactivo, cualifica leads y apoya ventas",
    speechBubble: null,
    walkTarget: null,
    pose: "sitting" as PersonPose,
  },
  {
    id: "consultor-servicios",
    name: "Consultor Serv.",
    shortName: "Servicios",
    role: "Energía+Telecom+Alarmas+Seguros",
    icon: <Activity className="w-5 h-5" />,
    color: "#f97316",
    glow: "rgba(249, 115, 22, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 15, y: 62 },
    homePosition: { x: 15, y: 62 },
    deskType: "corner",
    avatar: "⚡",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Analítico, optimiza servicios del cliente",
    speechBubble: null,
    walkTarget: null,
    pose: "sitting" as PersonPose,
  },
  {
    id: "consultor-digital",
    name: "Consultor Digital",
    shortName: "Digital",
    role: "IA+Web+CRM+Apps",
    icon: <Zap className="w-5 h-5" />,
    color: "#06b6d4",
    glow: "rgba(6, 182, 212, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 35, y: 62 },
    homePosition: { x: 35, y: 62 },
    deskType: "corner",
    avatar: "🤖",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Eficiente, integra IA y herramientas digitales",
    speechBubble: null,
    walkTarget: null,
    pose: "sitting" as PersonPose,
  },
  {
    id: "legal-rgpd",
    name: "Oficial RGPD",
    shortName: "Legal",
    role: "Protección de datos",
    icon: <Shield className="w-5 h-5" />,
    color: "#ec4899",
    glow: "rgba(236, 72, 153, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 50, y: 62 },
    homePosition: { x: 50, y: 62 },
    deskType: "corner",
    avatar: "👩‍⚖️",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Rigurosa, protege la privacidad",
    speechBubble: null,
    walkTarget: null,
    pose: "sitting" as PersonPose,
  },
  {
    id: "marketing-automation",
    name: "Marketing Automation",
    shortName: "Mktg.",
    role: "SEO, SEM y contenido",
    icon: <Megaphone className="w-5 h-5" />,
    color: "#a855f7",
    glow: "rgba(168, 85, 247, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 65, y: 62 },
    homePosition: { x: 65, y: 62 },
    deskType: "corner",
    avatar: "👨‍🎨",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Creativo, posiciona la marca",
    speechBubble: null,
    walkTarget: null,
    pose: "sitting" as PersonPose,
  },
  {
    id: "bi-scoring",
    name: "BI / Scoring",
    shortName: "BI",
    role: "Business Intelligence",
    icon: <Globe className="w-5 h-5" />,
    color: "#14b8a6",
    glow: "rgba(20, 184, 166, 0.4)",
    status: "idle",
    currentTask: null,
    position: { x: 85, y: 62 },
    homePosition: { x: 85, y: 62 },
    deskType: "corner",
    avatar: "📊",
    stats: { tasksToday: 0, tokensUsed: 0, avgTime: "0s" },
    personality: "Analítico, cruza datos para insights",
    speechBubble: null,
    walkTarget: null,
    pose: "sitting" as PersonPose,
  },
];

// ─── Status labels & animations ─────────────────────────────────────────

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "Esperando",
  thinking: "Pensando...",
  working: "Trabajando",
  delegating: "Delegando",
  done: "Completado",
  talking: "Hablando contigo",
  walking: "Caminando...",
  blocked: "Bloqueado",
};

// ─── Office Furniture SVG Components ────────────────────────────────────

function PlantSVG({ size = 40, variant = 0 }: { size?: number; variant?: number }) {
  if (variant === 0) {
    // Tall fiddle-leaf fig
    return (
      <svg width={size} height={size * 1.6} viewBox="0 0 40 64">
        {/* Pot */}
        <path d="M12 52 L14 64 L26 64 L28 52 Z" fill="#8B5E3C" />
        <path d="M10 48 L30 48 L28 52 L12 52 Z" fill="#A0724B" />
        <ellipse cx="20" cy="48" rx="10" ry="2" fill="#B8866B" />
        {/* Soil */}
        <ellipse cx="20" cy="49" rx="8" ry="1.5" fill="#3d2b1f" />
        {/* Trunk */}
        <path d="M19 49 Q18 40 20 30 Q22 20 19 12" stroke="#5C4033" strokeWidth="2.5" fill="none" />
        {/* Leaves */}
        <ellipse cx="12" cy="28" rx="7" ry="5" fill="#2d6a4f" transform="rotate(-25 12 28)" />
        <ellipse cx="28" cy="24" rx="7" ry="5" fill="#40916c" transform="rotate(20 28 24)" />
        <ellipse cx="16" cy="16" rx="6" ry="4.5" fill="#52b788" transform="rotate(-15 16 16)" />
        <ellipse cx="26" cy="14" rx="6" ry="4.5" fill="#40916c" transform="rotate(10 26 14)" />
        <ellipse cx="20" cy="8" rx="5" ry="4" fill="#2d6a4f" transform="rotate(5 20 8)" />
        <ellipse cx="10" cy="38" rx="6" ry="4" fill="#52b788" transform="rotate(-30 10 38)" />
        <ellipse cx="30" cy="36" rx="6" ry="4" fill="#2d6a4f" transform="rotate(25 30 36)" />
      </svg>
    );
  }
  if (variant === 1) {
    // Small succulent
    return (
      <svg width={size * 0.6} height={size * 0.7} viewBox="0 0 24 28">
        <rect x="7" y="18" width="10" height="10" rx="1" fill="#c4a882" />
        <rect x="8" y="17" width="8" height="3" rx="0.5" fill="#d4b896" />
        <ellipse cx="12" cy="18" rx="5" ry="2" fill="#3d2b1f" />
        <ellipse cx="12" cy="15" rx="4" ry="5" fill="#52b788" />
        <ellipse cx="8" cy="14" rx="3" ry="4" fill="#40916c" transform="rotate(-20 8 14)" />
        <ellipse cx="16" cy="14" rx="3" ry="4" fill="#40916c" transform="rotate(20 16 14)" />
        <ellipse cx="12" cy="10" rx="2.5" ry="3.5" fill="#2d6a4f" />
      </svg>
    );
  }
  // variant 2: Snake plant
  return (
    <svg width={size * 0.5} height={size * 1.4} viewBox="0 0 20 56">
      <path d="M6 44 L7 56 L13 56 L14 44 Z" fill="#8B5E3C" />
      <rect x="5" y="41" width="10" height="4" rx="1" fill="#A0724B" />
      <ellipse cx="10" cy="42" rx="5" ry="1.5" fill="#3d2b1f" />
      <path d="M8 42 Q7 30 9 10 Q9 6 10 4" stroke="#2d6a4f" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M12 42 Q13 28 11 14 Q11 10 12 8" stroke="#40916c" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M10 42 Q9 32 10 18 Q11 12 10 6" stroke="#52b788" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Yellow edges on leaves */}
      <path d="M8 42 Q7 30 9 10" stroke="#a3b18a" strokeWidth="0.8" fill="none" opacity="0.6" />
      <path d="M12 42 Q13 28 11 14" stroke="#a3b18a" strokeWidth="0.8" fill="none" opacity="0.6" />
    </svg>
  );
}

function CoffeeMachineSVG() {
  return (
    <svg width="30" height="40" viewBox="0 0 30 40">
      {/* Body */}
      <rect x="4" y="8" width="22" height="26" rx="2" fill="#2c2c2c" />
      <rect x="6" y="10" width="18" height="8" rx="1" fill="#1a1a1a" />
      {/* Screen */}
      <rect x="8" y="11" width="14" height="6" rx="1" fill="#0e4d3b" />
      <text x="15" y="16" textAnchor="middle" fill="#22c55e" fontSize="4" fontFamily="monospace">READY</text>
      {/* Drip area */}
      <rect x="8" y="24" width="14" height="8" rx="1" fill="#111" />
      {/* Cup */}
      <rect x="11" y="26" width="8" height="6" rx="1" fill="white" opacity="0.8" />
      <path d="M19 27 Q22 28 22 30 Q22 32 19 32" fill="none" stroke="white" strokeWidth="0.8" opacity="0.6" />
      {/* Steam */}
      <path d="M14 24 Q13 21 15 19" stroke="white" strokeWidth="0.5" fill="none" opacity="0.3" className="animate-steam-1" />
      <path d="M16 24 Q17 20 15 18" stroke="white" strokeWidth="0.5" fill="none" opacity="0.2" className="animate-steam-2" />
      {/* Base */}
      <rect x="2" y="34" width="26" height="4" rx="1" fill="#3a3a3a" />
      <rect x="0" y="38" width="30" height="2" rx="1" fill="#444" />
    </svg>
  );
}

function WaterCoolerSVG() {
  return (
    <svg width="24" height="48" viewBox="0 0 24 48">
      {/* Water bottle */}
      <ellipse cx="12" cy="6" rx="5" ry="3" fill="#bae6fd" opacity="0.6" />
      <rect x="7" y="4" width="10" height="14" rx="2" fill="#93c5fd" opacity="0.5" />
      <rect x="8" y="3" width="8" height="2" rx="1" fill="#60a5fa" opacity="0.4" />
      {/* Bubbles */}
      <circle cx="10" cy="10" r="1" fill="white" opacity="0.4" className="animate-bubble-water-1" />
      <circle cx="13" cy="8" r="0.7" fill="white" opacity="0.3" className="animate-bubble-water-2" />
      {/* Dispenser body */}
      <rect x="5" y="18" width="14" height="22" rx="2" fill="#e2e8f0" />
      <rect x="7" y="20" width="4" height="3" rx="1" fill="#3b82f6" />
      <rect x="13" y="20" width="4" height="3" rx="1" fill="#ef4444" />
      {/* Drip tray */}
      <rect x="6" y="32" width="12" height="2" rx="0.5" fill="#cbd5e1" />
      {/* Legs */}
      <rect x="6" y="40" width="2" height="8" fill="#94a3b8" />
      <rect x="16" y="40" width="2" height="8" fill="#94a3b8" />
    </svg>
  );
}

function BookshelfSVG() {
  return (
    <svg width="60" height="50" viewBox="0 0 60 50">
      {/* Shelf frame */}
      <rect x="2" y="0" width="56" height="50" rx="1" fill="#5C4033" opacity="0.9" />
      <rect x="4" y="2" width="52" height="46" fill="#3d2b1f" />
      {/* Shelf dividers */}
      <rect x="4" y="16" width="52" height="2" fill="#5C4033" />
      <rect x="4" y="32" width="52" height="2" fill="#5C4033" />
      {/* Top shelf - books */}
      <rect x="6" y="3" width="4" height="13" rx="0.5" fill="#3b82f6" />
      <rect x="11" y="5" width="3.5" height="11" rx="0.5" fill="#ef4444" />
      <rect x="15" y="4" width="4" height="12" rx="0.5" fill="#f59e0b" />
      <rect x="20" y="3" width="3" height="13" rx="0.5" fill="#10b981" />
      <rect x="24" y="6" width="4" height="10" rx="0.5" fill="#8b5cf6" />
      <rect x="29" y="4" width="3.5" height="12" rx="0.5" fill="#ec4899" />
      {/* Small plant on shelf */}
      <circle cx="44" cy="11" r="4" fill="#52b788" />
      <rect x="42" y="11" width="4" height="5" rx="1" fill="#8B5E3C" />
      {/* Middle shelf - folders */}
      <rect x="6" y="19" width="6" height="12" rx="0.5" fill="#64748b" />
      <rect x="13" y="19" width="6" height="12" rx="0.5" fill="#475569" />
      <rect x="20" y="19" width="6" height="12" rx="0.5" fill="#64748b" />
      <rect x="27" y="19" width="6" height="12" rx="0.5" fill="#475569" />
      {/* Trophy/award on middle shelf */}
      <rect x="42" y="27" width="8" height="2" rx="0.5" fill="#d4af37" />
      <rect x="44" y="21" width="4" height="6" rx="0.5" fill="#d4af37" />
      <circle cx="46" cy="21" r="3" fill="#fbbf24" />
      {/* Bottom shelf - binders */}
      <rect x="6" y="35" width="8" height="12" rx="0.5" fill="#1e293b" />
      <rect x="15" y="35" width="8" height="12" rx="0.5" fill="#334155" />
      <rect x="24" y="35" width="8" height="12" rx="0.5" fill="#1e293b" />
      {/* Photo frame */}
      <rect x="40" y="36" width="10" height="8" rx="0.5" fill="#1e293b" stroke="#94a3b8" strokeWidth="0.5" />
      <rect x="41" y="37" width="8" height="6" rx="0.3" fill="#0e7490" opacity="0.5" />
    </svg>
  );
}

function WhiteboardSVG() {
  return (
    <svg width="80" height="35" viewBox="0 0 80 35">
      {/* Board */}
      <rect x="2" y="2" width="76" height="28" rx="1" fill="#f1f5f9" />
      <rect x="2" y="2" width="76" height="28" rx="1" fill="none" stroke="#94a3b8" strokeWidth="1" />
      {/* Tray */}
      <rect x="10" y="30" width="60" height="3" rx="1" fill="#94a3b8" />
      {/* Markers on tray */}
      <rect x="15" y="30" width="8" height="2" rx="0.5" fill="#ef4444" />
      <rect x="25" y="30" width="8" height="2" rx="0.5" fill="#3b82f6" />
      <rect x="35" y="30" width="8" height="2" rx="0.5" fill="#22c55e" />
      {/* Written content */}
      <rect x="8" y="6" width="30" height="2" rx="0.5" fill="#3b82f6" opacity="0.5" />
      <rect x="8" y="10" width="22" height="2" rx="0.5" fill="#3b82f6" opacity="0.4" />
      <rect x="8" y="14" width="26" height="2" rx="0.5" fill="#ef4444" opacity="0.4" />
      {/* Sticky notes */}
      <rect x="50" y="5" width="10" height="10" fill="#fef08a" opacity="0.8" />
      <rect x="62" y="5" width="10" height="10" fill="#86efac" opacity="0.8" />
      <rect x="50" y="17" width="10" height="10" fill="#fca5a5" opacity="0.8" />
      <rect x="62" y="17" width="10" height="10" fill="#93c5fd" opacity="0.8" />
      {/* Tiny text on stickies */}
      <line x1="52" y1="8" x2="58" y2="8" stroke="#92400e" strokeWidth="0.5" opacity="0.6" />
      <line x1="52" y1="10" x2="56" y2="10" stroke="#92400e" strokeWidth="0.5" opacity="0.6" />
      <line x1="64" y1="8" x2="70" y2="8" stroke="#14532d" strokeWidth="0.5" opacity="0.6" />
    </svg>
  );
}

// ─── Fixed Desk+Chair SVG (stays at home position) ─────────────────────

function DeskSVG({ color, isWorking }: { color: string; isWorking: boolean }) {
  return (
    <svg width={60} height={55} viewBox="0 0 80 70">
      {/* Shadow */}
      <ellipse cx="40" cy="66" rx="36" ry="4" fill="black" opacity="0.15" />

      {/* Desk table surface */}
      <rect x="6" y="32" width="68" height="5" rx="2" fill="#2c1810" />
      <rect x="8" y="33" width="64" height="3" rx="1" fill="#3d2510" />
      {/* Desk legs */}
      <rect x="10" y="37" width="4" height="26" rx="1" fill="#2c1810" />
      <rect x="66" y="37" width="4" height="26" rx="1" fill="#2c1810" />
      {/* Desk front panel */}
      <rect x="10" y="37" width="60" height="20" rx="1" fill="#231008" opacity="0.5" />

      {/* Chair behind desk */}
      <rect x="26" y="12" width="28" height="22" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="0.8" />
      <rect x="24" y="30" width="32" height="6" rx="3" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />

      {/* Monitor on desk */}
      <rect x="28" y="14" width="24" height="17" rx="2" fill="#0a0f1e" stroke="#1e3a5f" strokeWidth="0.8" />
      {isWorking ? (
        <>
          <rect x="31" y="17" width="10" height="1.5" rx="0.5" fill={color} opacity="0.7" className="animate-code-line-1" />
          <rect x="31" y="20" width="16" height="1.5" rx="0.5" fill={color} opacity="0.4" className="animate-code-line-2" />
          <rect x="31" y="23" width="12" height="1.5" rx="0.5" fill={color} opacity="0.3" className="animate-code-line-3" />
        </>
      ) : (
        <rect x="31" y="19" width="18" height="7" rx="1" fill={color} opacity="0.08" />
      )}
      {/* Monitor stand */}
      <rect x="37" y="31" width="6" height="2" rx="0.5" fill="#1e293b" />

      {/* Keyboard */}
      <rect x="30" y="33" width="20" height="3" rx="1" fill="#111827" stroke="#1e293b" strokeWidth="0.5" />
      {/* Mouse */}
      <ellipse cx="56" cy="34.5" rx="3" ry="2" fill="#111827" stroke="#1e293b" strokeWidth="0.5" />

      {/* Coffee cup on desk */}
      <rect x="14" y="30" width="5" height="5" rx="1" fill="#1e293b" />
      <path d="M19 31 Q21 32 21 34 Q21 35 19 35" fill="none" stroke="#334155" strokeWidth="0.6" />
    </svg>
  );
}

// ─── Person SVG Component (separate from desk, with poses) ─────────────

function PersonSVG({
  status,
  color,
  size = 50,
  pose = "sitting",
}: {
  status: AgentStatus;
  color: string;
  size?: number;
  pose?: PersonPose;
}) {
  const isWorking = status === "working" || status === "thinking";
  const isTalking = status === "talking";
  const isDone = status === "done";
  const isWalking = pose === "walking";
  const isStanding = pose === "standing";
  const isSitting = pose === "sitting";

  // Different viewBox per pose for natural proportions
  const vb = isSitting ? "0 0 60 55" : "0 0 50 80";
  const h = isSitting ? size * 0.85 : size * 1.2;

  return (
    <svg width={size} height={h} viewBox={vb}
      className={isWalking ? "animate-person-walk" : isWorking && isSitting ? "animate-person-type" : ""}>

      {isSitting ? (
        /* ── SITTING POSE — natural proportions ── */
        <g>
          {/* Legs (bent at knee on chair) */}
          <path d="M20 38 L18 46 L20 52" stroke="#2d3748" strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M36 38 L38 46 L36 52" stroke="#2d3748" strokeWidth="5" strokeLinecap="round" fill="none" />
          {/* Shoes — subtle rounded */}
          <ellipse cx="20" cy="53" rx="5.5" ry="2.2" fill="#1a1a2e" />
          <ellipse cx="36" cy="53" rx="5.5" ry="2.2" fill="#1a1a2e" />

          {/* Torso — shirt with collar and slight taper */}
          <path d="M19 22 C19 22 16 24 16 28 L16 40 C16 42 19 42 19 42 L41 42 C41 42 44 42 44 40 L44 28 C44 24 41 22 41 22 Z" fill={color} opacity="0.92" />
          {/* Collar / neckline */}
          <path d="M25 22 L28 26 L30 22 L32 26 L35 22" fill="none" stroke="white" strokeWidth="0.8" opacity="0.3" />
          {/* Belt line */}
          <rect x="18" y="39" width="24" height="2" rx="1" fill="#1e293b" opacity="0.3" />

          {/* Arms */}
          <g className={isWorking ? "animate-arm-type-left" : ""}>
            <path d="M16 25 C12 26 10 30 10 36 L10 42" stroke={color} strokeWidth="5.5" strokeLinecap="round" fill="none" opacity="0.85" />
            <ellipse cx="10" cy="43" rx="3" ry="2.5" fill="#deb887" />
          </g>
          <g className={isWorking ? "animate-arm-type-right" : ""}>
            <path d={isTalking ? "M44 25 C48 24 50 28 52 34" : isDone ? "M44 25 C48 22 52 20 54 18" : "M44 25 C48 26 50 30 50 36 L50 42"}
              stroke={color} strokeWidth="5.5" strokeLinecap="round" fill="none" opacity="0.85" />
            <ellipse cx={isDone ? "54" : isTalking ? "52" : "50"} cy={isDone ? "18" : isTalking ? "34" : "43"} rx="3" ry="2.5" fill="#deb887" />
          </g>

          {/* Neck */}
          <rect x="27" y="19" width="6" height="5" rx="2" fill="#deb887" />

          {/* Head — slightly oval */}
          <ellipse cx="30" cy="12" rx="10.5" ry="11.5" fill="#deb887" />
          {/* Ears */}
          <ellipse cx="19.5" cy="13" rx="2" ry="3" fill="#d4a574" />
          <ellipse cx="40.5" cy="13" rx="2" ry="3" fill="#d4a574" />
          {/* Hair — styled with volume */}
          <path d="M19 8 C19 2 24 -1 30 -1 C36 -1 41 2 41 8 C41 4 37 2 30 2 C23 2 19 4 19 8 Z" fill={color} opacity="0.7" />
          <ellipse cx="30" cy="4" rx="10" ry="5" fill={color} opacity="0.5" />
          {/* Eyebrows */}
          <path d="M24 9.5 Q26 8.5 28 9.5" fill="none" stroke="#5a4a3a" strokeWidth="0.7" />
          <path d="M32 9.5 Q34 8.5 36 9.5" fill="none" stroke="#5a4a3a" strokeWidth="0.7" />
          {/* Eyes — with white and iris */}
          <ellipse cx="26" cy="12" rx="2.2" ry="2" fill="white" />
          <ellipse cx="34" cy="12" rx="2.2" ry="2" fill="white" />
          <circle cx={isWorking ? "26.6" : "26"} cy="12.2" r="1.1" fill="#3b2f1e" className={isWorking ? "animate-eyes-read" : ""} />
          <circle cx={isWorking ? "34.6" : "34"} cy="12.2" r="1.1" fill="#3b2f1e" className={isWorking ? "animate-eyes-read" : ""} />
          <circle cx={isWorking ? "26.9" : "26.3"} cy="11.8" r="0.35" fill="white" />
          <circle cx={isWorking ? "34.9" : "34.3"} cy="11.8" r="0.35" fill="white" />
          {/* Blink */}
          {status === "idle" && (
            <>
              <ellipse cx="26" cy="12" rx="2.5" ry="2.2" fill="#deb887" className="animate-blink" />
              <ellipse cx="34" cy="12" rx="2.5" ry="2.2" fill="#deb887" className="animate-blink" />
            </>
          )}
          {/* Nose — subtle */}
          <path d="M29.5 14 L30.5 16 L29 16.3" fill="none" stroke="#c9956a" strokeWidth="0.6" />
          {/* Mouth */}
          {isTalking ? (
            <ellipse cx="30" cy="18.5" rx="2.5" ry="1.8" fill="#c9574a" opacity="0.6" className="animate-talk-mouth" />
          ) : isDone ? (
            <path d="M27 17.5 Q30 20 33 17.5" fill="none" stroke="#c9574a" strokeWidth="0.8" opacity="0.5" />
          ) : (
            <path d="M28 18 Q30 19 32 18" fill="none" stroke="#b07060" strokeWidth="0.7" opacity="0.4" />
          )}
          {/* Thinking bubbles */}
          {status === "thinking" && (
            <g className="animate-fade-in">
              <circle cx="46" cy="6" r="2" fill="white" opacity="0.6" className="animate-bubble-1" />
              <circle cx="50" cy="1" r="2.5" fill="white" opacity="0.5" className="animate-bubble-2" />
              <circle cx="55" cy="-4" r="3" fill="white" opacity="0.4" className="animate-bubble-3" />
            </g>
          )}
        </g>
      ) : (
        /* ── STANDING / WALKING POSE — natural proportions ── */
        <g>
          {/* Legs — tapered with knee shape */}
          <g className={isWalking ? "animate-legs-walk" : ""}>
            <path d="M17 50 C17 56 16 64 17 72" stroke="#2d3748" strokeWidth="6" strokeLinecap="round" fill="none"
              className={isWalking ? "animate-leg-left" : ""} />
            <path d="M30 50 C30 56 31 64 30 72" stroke="#2d3748" strokeWidth="6" strokeLinecap="round" fill="none"
              className={isWalking ? "animate-leg-right" : ""} />
            {/* Shoes — natural profile */}
            <path d="M13 72 Q17 70 21 72 Q19 75 13 75 Z" fill="#1a1a2e" className={isWalking ? "animate-foot-left" : ""} />
            <path d="M26 72 Q30 70 34 72 Q32 75 26 75 Z" fill="#1a1a2e" className={isWalking ? "animate-foot-right" : ""} />
          </g>

          {/* Torso — shirt with taper at waist */}
          <path d="M14 26 C10 27 9 30 10 36 L12 50 L35 50 L37 36 C38 30 37 27 33 26 Z" fill={color} opacity="0.92" />
          {/* Collar */}
          <path d="M19 24 L22 28 L25 24 L28 28 L31 24" fill="none" stroke="white" strokeWidth="0.7" opacity="0.25" />
          {/* Belt */}
          <rect x="12" y="47" width="23" height="2" rx="1" fill="#1e293b" opacity="0.3" />

          {/* Arms — natural swing with forearm */}
          <path d="M10 28 C7 32 5 38 6 46" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.85"
            className={isWalking ? "animate-arm-swing-left" : ""} />
          <ellipse cx="6" cy="47" rx="2.8" ry="2.2" fill="#deb887" className={isWalking ? "animate-hand-swing-left" : ""} />
          <path d="M37 28 C40 32 42 38 41 46" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.85"
            className={isWalking ? "animate-arm-swing-right" : ""} />
          <ellipse cx="41" cy="47" rx="2.8" ry="2.2" fill="#deb887" className={isWalking ? "animate-hand-swing-right" : ""} />

          {/* Neck */}
          <rect x="21" y="21" width="6" height="5" rx="2" fill="#deb887" />

          {/* Head — slightly oval for realism */}
          <ellipse cx="24" cy="13" rx="10.5" ry="11.5" fill="#deb887" />
          {/* Ears */}
          <ellipse cx="13.5" cy="14" rx="2" ry="3" fill="#d4a574" />
          <ellipse cx="34.5" cy="14" rx="2" ry="3" fill="#d4a574" />
          {/* Hair */}
          <path d="M13 9 C13 3 18 0 24 0 C30 0 35 3 35 9 C35 5 31 3 24 3 C17 3 13 5 13 9 Z" fill={color} opacity="0.7" />
          <ellipse cx="24" cy="5" rx="10" ry="5" fill={color} opacity="0.5" />
          {/* Eyebrows */}
          <path d="M18 10 Q20 9 22 10" fill="none" stroke="#5a4a3a" strokeWidth="0.7" />
          <path d="M26 10 Q28 9 30 10" fill="none" stroke="#5a4a3a" strokeWidth="0.7" />
          {/* Eyes */}
          <ellipse cx="20" cy="13" rx="2.2" ry="2" fill="white" />
          <ellipse cx="28" cy="13" rx="2.2" ry="2" fill="white" />
          <circle cx="20.4" cy="13.2" r="1.1" fill="#3b2f1e" />
          <circle cx="28.4" cy="13.2" r="1.1" fill="#3b2f1e" />
          <circle cx="20.7" cy="12.8" r="0.35" fill="white" />
          <circle cx="28.7" cy="12.8" r="0.35" fill="white" />
          {/* Nose */}
          <path d="M23.5 15 L24.5 17 L23 17.3" fill="none" stroke="#c9956a" strokeWidth="0.6" />
          {/* Mouth — slight smile while walking */}
          <path d="M21 19 Q24 21 27 19" fill="none" stroke="#b07060" strokeWidth="0.7" opacity="0.4" />
        </g>
      )}
    </svg>
  );
}

// ─── Fixed Desk (stays at homePosition, never moves) ───────────────────

function FixedDesk({ agent }: { agent: OfficeAgent }) {
  const isWorking = agent.status === "working" || agent.status === "thinking";
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${agent.homePosition.x}%`,
        top: `${agent.homePosition.y}%`,
        transform: "translate(-50%, -40%)",
        zIndex: 8,
      }}
    >
      {/* Floor shadow under desk */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-[12px] w-[80px] h-[24px] rounded-full bg-black/15 blur-md" />
      <DeskSVG color={agent.color} isWorking={isWorking && agent.pose === "sitting"} />
    </div>
  );
}

// ─── Walking Person (moves with agent.position via CSS transition) ──────

function AgentPerson({
  agent,
  isSelected,
  onClick,
}: {
  agent: OfficeAgent;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isActive = agent.status !== "idle";
  const isAtHome = agent.position.x === agent.homePosition.x && agent.position.y === agent.homePosition.y;
  const isSitting = agent.pose === "sitting";

  // Person size changes: smaller when sitting at desk, bigger when standing/walking
  const personSize = isSitting ? 48 : 55;

  // Vertical offset: sitting person nestles into the desk chair area
  const yOffset = isSitting ? "-28%" : "-55%";

  return (
    <div
      className="absolute cursor-pointer group"
      style={{
        left: `${agent.position.x}%`,
        top: `${agent.position.y}%`,
        transform: `translate(-50%, ${yOffset})`,
        zIndex: isSelected ? 30 : agent.pose === "walking" ? 25 : isActive ? 20 : 12,
        transition: "left 3.5s cubic-bezier(0.25, 0.1, 0.25, 1), top 3.5s cubic-bezier(0.25, 0.1, 0.25, 1)",
      }}
      onClick={onClick}
    >
      {/* Glow effect when active */}
      {isActive && (
        <div
          className="absolute rounded-full blur-3xl animate-pulse-slow pointer-events-none"
          style={{
            background: agent.glow,
            width: "120px",
            height: "120px",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            opacity: 0.2,
          }}
        />
      )}

      {/* Selection ring */}
      {isSelected && (
        <div
          className="absolute rounded-full border-2 animate-spin-slow pointer-events-none"
          style={{
            borderColor: agent.color,
            width: "100px",
            height: "100px",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            borderStyle: "dashed",
            opacity: 0.5,
          }}
        />
      )}

      {/* Person figure */}
      <div className="relative flex flex-col items-center">
        {/* Walking shadow on floor */}
        {!isSitting && (
          <div
            className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 rounded-full bg-black/25 blur-sm pointer-events-none"
            style={{ width: personSize * 0.7, height: 8 }}
          />
        )}

        <PersonSVG status={agent.status} color={agent.color} size={personSize} pose={agent.pose} />

        {/* Name badge */}
        <div
          className={`mt-0.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase border transition-all duration-300 ${
            agent.status === "blocked" ? "animate-pulse" : ""
          }`}
          style={{
            background: agent.status === "blocked" ? "rgba(239,68,68,0.15)" : `${agent.color}12`,
            borderColor: agent.status === "blocked" ? "rgba(239,68,68,0.5)" : `${agent.color}35`,
            color: agent.status === "blocked" ? "#ef4444" : agent.color,
            boxShadow: agent.status === "blocked"
              ? "0 0 16px rgba(239,68,68,0.4), 0 0 4px rgba(239,68,68,0.25)"
              : isActive ? `0 0 16px ${agent.glow}, 0 0 4px ${agent.color}40` : "none",
            backdropFilter: "blur(8px)",
          }}
        >
          {agent.shortName}
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1 mt-0.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              agent.status === "blocked"
                ? "bg-red-500 animate-pulse"
                : agent.status === "idle"
                ? "bg-gray-600"
                : agent.status === "thinking"
                ? "bg-yellow-400 animate-pulse"
                : agent.status === "working"
                ? "bg-green-400 animate-pulse"
                : agent.status === "delegating"
                ? "bg-blue-400 animate-pulse"
                : agent.status === "walking"
                ? "bg-orange-400 animate-pulse"
                : agent.status === "done"
                ? "bg-emerald-400"
                : "bg-cyan-400 animate-pulse"
            }`}
          />
          <span className={`text-[8px] font-mono ${
            agent.status === "blocked" ? "text-red-400 font-semibold" : "text-slate-500"
          }`}>
            {STATUS_LABEL[agent.status]}
          </span>
        </div>

        {/* Comic Speech Bubble */}
        {agent.speechBubble && Date.now() < agent.speechBubble.expiresAt && (
          <div className="absolute -top-14 left-1/2 -translate-x-1/2 animate-bubble-pop pointer-events-none z-50">
            <div
              className="relative px-3 py-1.5 rounded-2xl text-[9px] font-medium max-w-[170px] border"
              style={{
                background: agent.speechBubble.type === "work" || agent.speechBubble.type === "tool"
                  ? `${agent.color}20` : "rgba(15,23,42,0.9)",
                borderColor: agent.speechBubble.type === "work" || agent.speechBubble.type === "tool"
                  ? `${agent.color}50` : "rgba(100,116,139,0.3)",
                color: agent.speechBubble.type === "work" || agent.speechBubble.type === "tool"
                  ? agent.color : "#e2e8f0",
                backdropFilter: "blur(12px)",
                boxShadow: `0 4px 20px rgba(0,0,0,0.3)`,
              }}
            >
              <span className="line-clamp-2 leading-tight">{agent.speechBubble.text}</span>
              {/* Triangle pointer */}
              <div
                className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-r border-b"
                style={{
                  background: agent.speechBubble.type === "work" || agent.speechBubble.type === "tool"
                    ? `${agent.color}20` : "rgba(15,23,42,0.9)",
                  borderColor: agent.speechBubble.type === "work" || agent.speechBubble.type === "tool"
                    ? `${agent.color}50` : "rgba(100,116,139,0.3)",
                }}
              />
            </div>
          </div>
        )}

        {/* Current task (only if no speech bubble) */}
        {agent.currentTask && !agent.speechBubble && (
          <div
            className="absolute -top-9 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-[9px] text-white font-medium whitespace-nowrap border animate-fade-in max-w-[180px] truncate"
            style={{
              background: `${agent.color}25`,
              borderColor: `${agent.color}40`,
              backdropFilter: "blur(12px)",
            }}
          >
            {agent.currentTask}
          </div>
        )}

        {/* Hover tooltip */}
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <div className="px-2.5 py-1 rounded-lg bg-black/90 backdrop-blur-sm text-[8px] text-white/80 whitespace-nowrap border border-white/5">
            Click para hablar con {agent.name}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Delegation Line ────────────────────────────────────────────────────

function DelegationArrow({ line, agents }: { line: DelegationLine; agents: OfficeAgent[] }) {
  const from = agents.find((a) => a.id === line.from);
  const to = agents.find((a) => a.id === line.to);
  if (!from || !to) return null;

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 15 }}>
      <defs>
        <linearGradient id={`grad-${line.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={from.color} stopOpacity="0.8" />
          <stop offset="100%" stopColor={to.color} stopOpacity="0.8" />
        </linearGradient>
      </defs>
      {/* Line */}
      <line
        x1={`${from.position.x}%`}
        y1={`${from.position.y}%`}
        x2={`${to.position.x}%`}
        y2={`${to.position.y}%`}
        stroke={`url(#grad-${line.id})`}
        strokeWidth="2"
        strokeDasharray="8 4"
        className="animate-dash"
        opacity="0.6"
      />
      {/* Walking person dot */}
      <circle
        cx={`${from.position.x + (to.position.x - from.position.x) * line.progress}%`}
        cy={`${from.position.y + (to.position.y - from.position.y) * line.progress}%`}
        r="6"
        fill={from.color}
        opacity="0.9"
        className="animate-pulse"
      />
      {/* Reason label */}
      <text
        x={`${(from.position.x + to.position.x) / 2}%`}
        y={`${(from.position.y + to.position.y) / 2 - 2}%`}
        textAnchor="middle"
        fill="white"
        fontSize="9"
        opacity="0.7"
        fontFamily="monospace"
      >
        {line.reason}
      </text>
    </svg>
  );
}

// ─── Activity Log ───────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  agentId: string;
  agentName: string;
  color: string;
  action: string;
  timestamp: number;
}

function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div className="glass-card rounded-xl p-3 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider">
          Log en Tiempo Real
        </span>
      </div>
      <div ref={logRef} className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
        {entries.length === 0 && (
          <p className="text-[10px] text-[var(--text-secondary)] italic font-mono py-4 text-center">
            Esperando actividad de los agentes...
          </p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="flex items-start gap-2 py-1 animate-fade-in">
            <span className="text-[9px] text-[var(--text-secondary)] font-mono mt-0.5 shrink-0">
              {new Date(e.timestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <span
              className="text-[10px] font-bold shrink-0"
              style={{ color: e.color }}
            >
              [{e.agentName}]
            </span>
            <span className="text-[10px] text-[var(--text-primary)] font-mono">
              {e.action}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Agent Chat Drawer ──────────────────────────────────────────────────

function AgentChat({
  agent,
  onClose,
  chatHistory,
  onSendMessage,
  sending,
}: {
  agent: OfficeAgent;
  onClose: () => void;
  chatHistory: ChatMsg[];
  onSendMessage: (msg: string) => void;
  sending: boolean;
}) {
  const [input, setInput] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSend = () => {
    if (!input.trim() || sending) return;
    onSendMessage(input.trim());
    setInput("");
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden flex flex-col h-full animate-slide-in-right">
      {/* Header */}
      <div
        className="p-4 flex items-center gap-3 border-b border-[var(--border)]"
        style={{ background: `${agent.color}10` }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl border"
          style={{
            background: `${agent.color}15`,
            borderColor: `${agent.color}30`,
            boxShadow: `0 0 20px ${agent.glow}`,
          }}
        >
          {agent.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold truncate">{agent.name}</h3>
          <p className="text-[10px] font-mono" style={{ color: agent.color }}>
            {agent.role} · {STATUS_LABEL[agent.status]}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-[var(--bg-card-hover)] transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Stats bar */}
      <div className="px-4 py-2 flex gap-4 border-b border-[var(--border)] bg-black/20">
        <div className="text-center">
          <div className="text-xs font-bold" style={{ color: agent.color }}>
            {agent.stats.tasksToday}
          </div>
          <div className="text-[8px] text-[var(--text-secondary)] uppercase">Tareas hoy</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-bold" style={{ color: agent.color }}>
            {agent.stats.tokensUsed.toLocaleString()}
          </div>
          <div className="text-[8px] text-[var(--text-secondary)] uppercase">Tokens</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-bold" style={{ color: agent.color }}>
            {agent.stats.avgTime}
          </div>
          <div className="text-[8px] text-[var(--text-secondary)] uppercase">Tiempo medio</div>
        </div>
      </div>

      {/* Personality */}
      <div className="px-4 py-2 border-b border-[var(--border)]">
        <p className="text-[10px] text-[var(--text-secondary)] italic">
          &quot;{agent.personality}&quot;
        </p>
      </div>

      {/* Messages */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {chatHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
            <div className="text-4xl">{agent.avatar}</div>
            <p className="text-xs text-[var(--text-secondary)] text-center max-w-[200px]">
              Habla directamente con {agent.shortName}. Este agente se especializa en{" "}
              {agent.role.toLowerCase()}.
            </p>
          </div>
        )}
        {chatHistory.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-xs ${
                msg.role === "user"
                  ? "bg-cyan-500/20 border border-cyan-500/30 text-[var(--text-primary)]"
                  : "border"
              }`}
              style={
                msg.role === "agent"
                  ? {
                      background: `${agent.color}10`,
                      borderColor: `${agent.color}25`,
                    }
                  : undefined
              }
            >
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div
              className="px-4 py-2 rounded-xl border text-xs flex items-center gap-2"
              style={{
                background: `${agent.color}10`,
                borderColor: `${agent.color}25`,
              }}
            >
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: agent.color, animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: agent.color, animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: agent.color, animationDelay: "300ms" }} />
              </div>
              <span className="text-[var(--text-secondary)]">pensando...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[var(--border)]">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={`Hablar con ${agent.shortName}...`}
            className="flex-1 px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-sm focus:outline-none focus:border-cyan-500/50 transition"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="px-3 py-2 rounded-xl transition disabled:opacity-40"
            style={{
              background: `${agent.color}20`,
              color: agent.color,
            }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Office Map Component ──────────────────────────────────────────

export default function AgentOfficeMap() {
  const [agents, setAgents] = useState<OfficeAgent[]>(INITIAL_AGENTS);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [delegations, setDelegations] = useState<DelegationLine[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMsg[]>>({});
  const [sending, setSending] = useState(false);
  const [activePopup, setActivePopup] = useState<"whiteboard" | "coffee" | "bookshelf" | null>(null);
  const [toasts, setToasts] = useState<{ id: string; text: string; color: string; expiresAt: number }[]>([]);
  const [clockTime, setClockTime] = useState(new Date());
  const delegationTimers = useRef<NodeJS.Timeout[]>([]);

  const lifeTimers = useRef<NodeJS.Timeout[]>([]);

  // ── Real-time clock ──
  useEffect(() => {
    const interval = setInterval(() => setClockTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Toast notification system ──
  const showToast = useCallback((text: string, color = "#06b6d4") => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-3), { id, text, color, expiresAt: Date.now() + 4000 }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // ── Expire toasts ──
  useEffect(() => {
    const interval = setInterval(() => {
      setToasts((prev) => {
        const now = Date.now();
        const next = prev.filter((t) => now < t.expiresAt);
        return next.length !== prev.length ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup all timers
  useEffect(() => {
    return () => {
      delegationTimers.current.forEach(clearTimeout);
      lifeTimers.current.forEach(clearTimeout);
    };
  }, []);

  // ── Helper: Show speech bubble on agent ──
  const showBubble = useCallback((agentId: string, text: string, type: SpeechBubble["type"], durationMs = 3500) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId
          ? { ...a, speechBubble: { text, type, expiresAt: Date.now() + durationMs } }
          : a,
      ),
    );
    const t = setTimeout(() => {
      setAgents((prev) =>
        prev.map((a) => (a.id === agentId ? { ...a, speechBubble: null } : a)),
      );
    }, durationMs);
    lifeTimers.current.push(t);
  }, []);

  // ── Helper: Walk agent to a position, then callback ──
  const walkAgent = useCallback((agentId: string, target: Position, onArrive?: () => void) => {
    // Phase 1: Stand up from chair (pause to get up naturally)
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId
          ? { ...a, pose: "standing" as PersonPose, status: "walking" as AgentStatus, walkTarget: target }
          : a,
      ),
    );
    // Phase 2: Start walking after standing up (600ms to stand)
    const t1 = setTimeout(() => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId
            ? { ...a, pose: "walking" as PersonPose, position: target }
            : a,
        ),
      );
    }, 600);
    lifeTimers.current.push(t1);
    // Phase 3: Arrive — switch to standing (matches 3.5s CSS transition + 600ms stand)
    const t2 = setTimeout(() => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId
            ? { ...a, pose: "standing" as PersonPose }
            : a,
        ),
      );
      if (onArrive) onArrive();
    }, 4200);
    lifeTimers.current.push(t2);
  }, []);

  // ── Helper: Walk agent back home ──
  const walkHome = useCallback((agentId: string, delayMs = 0) => {
    // After delay, start walking home
    const t1 = setTimeout(() => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId
            ? { ...a, pose: "walking" as PersonPose, status: "walking" as AgentStatus, position: a.homePosition }
            : a,
        ),
      );
    }, delayMs);
    lifeTimers.current.push(t1);

    // Arrive home — stand briefly (matches 3.5s CSS transition)
    const t2 = setTimeout(() => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId
            ? { ...a, pose: "standing" as PersonPose, walkTarget: null }
            : a,
        ),
      );
    }, delayMs + 3600);
    lifeTimers.current.push(t2);

    // Sit down naturally after a pause
    const t3 = setTimeout(() => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId
            ? { ...a, pose: "sitting" as PersonPose, status: "idle" as AgentStatus, currentTask: null }
            : a,
        ),
      );
    }, delayMs + 4200);
    lifeTimers.current.push(t3);
  }, []);

  // ── AUTONOMOUS LIFE SYSTEM ──
  useEffect(() => {
    let mounted = true;

    const doIdleActivity = () => {
      if (!mounted) return;

      setAgents((current) => {
        // Find idle agents not busy with real work
        const idleAgents = current.filter(
          (a) => a.status === "idle" && !a.speechBubble && !a.walkTarget,
        );
        if (idleAgents.length === 0) return current;

        // Pick a random idle agent
        const agent = idleAgents[Math.floor(Math.random() * idleAgents.length)];
        const roll = Math.random();

        if (roll < 0.30) {
          // ── Go get coffee ──
          showBubble(agent.id, "Voy a por un café ☕", "ambient", 2500);
          const t1 = setTimeout(() => {
            if (!mounted) return;
            walkAgent(agent.id, LANDMARKS.coffee, () => {
              showBubble(agent.id, "Mmm, que bueno... ☕", "ambient", 2500);
              walkHome(agent.id, 3000);
            });
          }, 2800);
          lifeTimers.current.push(t1);

        } else if (roll < 0.50) {
          // ── Visit whiteboard ──
          showBubble(agent.id, "Voy a apuntar algo... 📋", "ambient", 2000);
          const t1 = setTimeout(() => {
            if (!mounted) return;
            walkAgent(agent.id, LANDMARKS.whiteboard, () => {
              showBubble(agent.id, "Listo, anotado ✓", "ambient", 2500);
              walkHome(agent.id, 3000);
            });
          }, 2300);
          lifeTimers.current.push(t1);

        } else if (roll < 0.50) {
          // ── PING-PONG DIALOGUE with another agent ──
          const possibleDialogues = AGENT_DIALOGUES.filter(
            (d) => d.agentA === agent.id || d.agentB === agent.id,
          );
          if (possibleDialogues.length > 0) {
            const dialogue = possibleDialogues[Math.floor(Math.random() * possibleDialogues.length)];
            const isA = dialogue.agentA === agent.id;
            const partnerId = isA ? dialogue.agentB : dialogue.agentA;
            const partner = current.find((a) => a.id === partnerId);
            if (partner && partner.status === "idle") {
              const partnerPos = partner.position;
              // Walk to partner's desk
              walkAgent(agent.id, { x: partnerPos.x - 5, y: partnerPos.y - 3 }, () => {
                // Play all lines with proper timing
                let cumulativeDelay = 0;
                dialogue.lines.forEach((line) => {
                  cumulativeDelay += line.delay;
                  const speakerId = line.speaker === "a" ? dialogue.agentA : dialogue.agentB;
                  const t = setTimeout(() => {
                    if (!mounted) return;
                    showBubble(speakerId, line.text, "ambient", Math.min(line.delay + 800, 2800));
                  }, cumulativeDelay);
                  lifeTimers.current.push(t);
                });
                // Walk home after full dialogue
                walkHome(agent.id, cumulativeDelay + 2000);
              });
            } else {
              const lines = AMBIENT_LINES[agent.id] || ["..."];
              showBubble(agent.id, lines[Math.floor(Math.random() * lines.length)], "ambient", 3500);
            }
          }

        } else if (roll < 0.62) {
          // ── Phone call at desk ──
          showBubble(agent.id, "📞 Atendiendo llamada...", "ambient", 2000);
          const t1 = setTimeout(() => {
            if (!mounted) return;
            showBubble(agent.id, "Sí, le envío la propuesta hoy 📞", "ambient", 2500);
          }, 2500);
          const t2 = setTimeout(() => {
            if (!mounted) return;
            showBubble(agent.id, "Perfecto, quedamos así. ¡Gracias!", "ambient", 2500);
          }, 5500);
          lifeTimers.current.push(t1, t2);

        } else if (roll < 0.72) {
          // ── Present at whiteboard ──
          showBubble(agent.id, "Voy a actualizar la pizarra 📋", "ambient", 2000);
          const t1 = setTimeout(() => {
            if (!mounted) return;
            walkAgent(agent.id, LANDMARKS.whiteboard, () => {
              showBubble(agent.id, "Apuntando objetivos del sprint...", "ambient", 3000);
              const t2 = setTimeout(() => {
                if (!mounted) return;
                showBubble(agent.id, "✓ Pizarra actualizada", "ambient", 2000);
                walkHome(agent.id, 2500);
              }, 3500);
              lifeTimers.current.push(t2);
            });
          }, 2300);
          lifeTimers.current.push(t1);

        } else if (roll < 0.80) {
          // ── Water cooler chat ──
          const idleOthers = current.filter(
            (a) => a.id !== agent.id && a.status === "idle" && !a.walkTarget,
          );
          if (idleOthers.length > 0) {
            const buddy = idleOthers[Math.floor(Math.random() * idleOthers.length)];
            walkAgent(agent.id, LANDMARKS.water, () => {
              showBubble(agent.id, "💧 ¿Quieres agua?", "ambient", 2000);
              walkAgent(buddy.id, { x: LANDMARKS.water.x + 4, y: LANDMARKS.water.y }, () => {
                showBubble(buddy.id, "Venga, un descanso 😊", "ambient", 2000);
                const t1 = setTimeout(() => {
                  if (!mounted) return;
                  showBubble(agent.id, "¿Qué tal tu mañana?", "ambient", 2200);
                }, 2200);
                const t2 = setTimeout(() => {
                  if (!mounted) return;
                  showBubble(buddy.id, "Liado, pero avanzando 💪", "ambient", 2200);
                }, 4600);
                lifeTimers.current.push(t1, t2);
                walkHome(agent.id, 7000);
                walkHome(buddy.id, 7500);
              });
            });
          } else {
            walkAgent(agent.id, LANDMARKS.water, () => {
              showBubble(agent.id, "Hidratación 💧", "ambient", 2000);
              walkHome(agent.id, 2500);
            });
          }

        } else if (roll < 0.88) {
          // ── Celebrate / stretch ──
          const celebrations = [
            "¡Tarea completada! 🎉", "¡Objetivo cumplido! 🏆", "Buen trabajo equipo 👏",
            "Me estiro 5 min 🧘", "Micro-break necesario ☕", "¡Vamos bien hoy! 💪",
          ];
          showBubble(agent.id, celebrations[Math.floor(Math.random() * celebrations.length)], "ambient", 3000);

        } else {
          // ── Just think/say something at desk ──
          const lines = AMBIENT_LINES[agent.id] || ["..."];
          showBubble(agent.id, lines[Math.floor(Math.random() * lines.length)], "ambient", 4000);
        }

        return current; // state not changed here, side effects via showBubble/walkAgent
      });
    };

    // Start idle loop: every 5-10s someone does something
    const scheduleNext = () => {
      const delay = 4000 + Math.random() * 6000;
      const t = setTimeout(() => {
        if (mounted) {
          doIdleActivity();
          scheduleNext();
        }
      }, delay);
      lifeTimers.current.push(t);
    };

    // Initial burst: 2 agents do something in the first 2s
    const t0 = setTimeout(() => doIdleActivity(), 1500);
    const t1 = setTimeout(() => doIdleActivity(), 3000);
    lifeTimers.current.push(t0, t1);
    scheduleNext();

    return () => { mounted = false; };
  }, [showBubble, walkAgent, walkHome]);

  // ── Expire old speech bubbles ──
  useEffect(() => {
    const interval = setInterval(() => {
      setAgents((prev) => {
        const now = Date.now();
        let changed = false;
        const next = prev.map((a) => {
          if (a.speechBubble && now >= a.speechBubble.expiresAt) {
            changed = true;
            return { ...a, speechBubble: null };
          }
          return a;
        });
        return changed ? next : prev;
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // ── SSE-based real office state (replaces polling) ──
  // Uses useOfficeStream hook: snapshot initial + SSE incremental + fallback polling.
  // Maps real OfficeAgentStatus → visual AgentStatus including "blocked".
  const { snapshot: officeSnapshot } = useOfficeStream();

  const STATUS_MAP: Record<string, AgentStatus> = {
    active: "working",
    delegating: "delegating",
    internal_work: "thinking",
    blocked: "blocked",
    idle: "idle",
    offline: "idle",
  };

  // Apply real state from SSE snapshot to visual agents
  const prevSnapshotRef = useRef<OfficeStateSnapshot | null>(null);

  useEffect(() => {
    if (!officeSnapshot || !officeSnapshot.hasRealData) return;
    // Skip if snapshot hasn't changed (same generatedAt)
    if (prevSnapshotRef.current?.generatedAt === officeSnapshot.generatedAt) return;
    prevSnapshotRef.current = officeSnapshot;

    // Update agent statuses
    setAgents((prev) =>
      prev.map((agent) => {
        const real = officeSnapshot.agents[agent.id];
        if (!real || !real.isReal) return agent;

        // Don't override transient visual animations
        if (agent.status === "walking" || agent.status === "talking" || agent.status === "delegating") {
          return agent;
        }

        const mappedStatus = STATUS_MAP[real.currentStatus] || "idle";
        if (mappedStatus === agent.status && !real.currentTaskSummary) return agent;

        return {
          ...agent,
          status: mappedStatus,
          currentTask: real.currentTaskSummary || agent.currentTask,
        };
      }),
    );

    // Inject real delegations
    if (officeSnapshot.activeDelegations?.length > 0) {
      setDelegations((prev) => {
        const existingIds = new Set(prev.map((d) => `${d.from}-${d.to}`));
        const newDelegations = officeSnapshot.activeDelegations
          .filter((d) => !existingIds.has(`${d.fromAgentId}-${d.toAgentId}`))
          .map((d) => ({
            from: d.fromAgentId,
            to: d.toAgentId,
            reason: d.reason,
            progress: 0.5,
            id: `real-${d.fromAgentId}-${d.toAgentId}-${d.timestamp}`,
          }));
        if (newDelegations.length === 0) return prev;
        return [...prev, ...newDelegations];
      });
    }

    // Inject real activity
    if (officeSnapshot.recentActivity?.length > 0) {
      setActivityLog((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const agentLookup = (id: string) => INITIAL_AGENTS.find((a) => a.id === id);
        const newEntries = officeSnapshot.recentActivity
          .filter((e) => !existingIds.has(`real-${e.id}`))
          .slice(0, 10)
          .map((e) => ({
            id: `real-${e.id}`,
            agentId: e.agentId,
            agentName: agentLookup(e.agentId)?.shortName || e.agentId,
            color: agentLookup(e.agentId)?.color || "#06b6d4",
            action: e.summary,
            timestamp: new Date(e.timestamp).getTime(),
          }));
        if (newEntries.length === 0) return prev;
        return [...prev, ...newEntries].slice(-100);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeSnapshot]);

  // ── Add log entry ──
  const addLog = useCallback((agentId: string, action: string) => {
    const agent = INITIAL_AGENTS.find((a) => a.id === agentId);
    if (!agent) return;
    setActivityLog((prev) => [
      ...prev.slice(-100),
      {
        id: `${Date.now()}-${Math.random()}`,
        agentId,
        agentName: agent.shortName,
        color: agent.color,
        action,
        timestamp: Date.now(),
      },
    ]);
    // Show toast for important events
    if (action.includes("✓") || action.includes("completada") || action.includes("🔧")) {
      showToast(`${agent.shortName}: ${action}`, agent.color);
    }
  }, [showToast]);

  // ── Update agent status ──
  const updateAgentStatus = useCallback((agentId: string, status: AgentStatus, task?: string) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === agentId
          ? {
              ...a,
              status,
              currentTask: task ?? a.currentTask,
              stats: status === "done"
                ? { ...a.stats, tasksToday: a.stats.tasksToday + 1 }
                : a.stats,
            }
          : a,
      ),
    );
  }, []);

  // ── Simulate delegation animation ──
  const simulateDelegation = useCallback(
    (fromId: string, toId: string, reason: string) => {
      const lineId = `${fromId}-${toId}-${Date.now()}`;
      const newLine: DelegationLine = {
        from: fromId,
        to: toId,
        reason,
        progress: 0,
        id: lineId,
      };

      setDelegations((prev) => [...prev, newLine]);
      updateAgentStatus(fromId, "delegating", `Delegando a ${toId}`);
      addLog(fromId, `→ Delegando "${reason}" a ${toId}`);

      let progress = 0;
      const timer = setInterval(() => {
        progress += 0.02;
        if (progress >= 1) {
          clearInterval(timer);
          setDelegations((prev) => prev.filter((d) => d.id !== lineId));
          updateAgentStatus(fromId, "idle");
          updateAgentStatus(toId, "working", reason);
          addLog(toId, `Recibida tarea: "${reason}"`);

          // Simulate work completion
          setTimeout(() => {
            updateAgentStatus(toId, "done", "Tarea completada");
            addLog(toId, "✓ Tarea completada");
            setTimeout(() => {
              updateAgentStatus(toId, "idle");
              setAgents((prev) =>
                prev.map((a) =>
                  a.id === toId ? { ...a, currentTask: null } : a,
                ),
              );
            }, 3000);
          }, 4000 + Math.random() * 3000);
        } else {
          setDelegations((prev) =>
            prev.map((d) => (d.id === lineId ? { ...d, progress } : d)),
          );
        }
      }, 50);

      delegationTimers.current.push(timer);
    },
    [updateAgentStatus, addLog],
  );

  // ── Send message to agent ──
  const handleSendMessage = useCallback(
    async (msg: string) => {
      if (!selectedAgent) return;

      // Add user message to chat
      setChatHistories((prev) => ({
        ...prev,
        [selectedAgent]: [
          ...(prev[selectedAgent] || []),
          { role: "user" as const, content: msg, timestamp: Date.now() },
        ],
      }));

      // Update agent status
      updateAgentStatus(selectedAgent, "talking", msg.slice(0, 60));
      addLog(selectedAgent, `Usuario pregunta: "${msg.slice(0, 80)}"`);

      setSending(true);

      try {
        const res = await fetch("/api/agent-gpt5", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: msg,
            agentOverride: selectedAgent,
          }),
        });

        if (!res.ok) throw new Error("Error del agente");

        // Read SSE stream
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullReply = "";

        if (reader) {
          let done = false;
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.slice(6));

                    if (data.type === "text_delta" && data.content) {
                      fullReply += data.content;
                    }

                    if (data.type === "tool_call") {
                      addLog(selectedAgent!, `🔧 Usando: ${data.name}`);
                      updateAgentStatus(selectedAgent!, "working", `Usando ${data.name}`);
                    }

                    if (data.type === "delegation") {
                      simulateDelegation(selectedAgent!, data.toAgent, data.reason);
                    }

                    if (data.type === "done" && data.reply) {
                      fullReply = data.reply;
                    }
                  } catch {
                    // Not JSON, might be raw text
                    if (line.slice(6).trim() && line.slice(6).trim() !== "[DONE]") {
                      fullReply += line.slice(6);
                    }
                  }
                }
              }
            }
          }
        }

        if (!fullReply) {
          fullReply = "He procesado tu solicitud. ¿Necesitas algo más?";
        }

        setChatHistories((prev) => ({
          ...prev,
          [selectedAgent!]: [
            ...(prev[selectedAgent!] || []),
            { role: "agent", content: fullReply, timestamp: Date.now() },
          ],
        }));

        updateAgentStatus(selectedAgent!, "done", "Respondido");
        addLog(selectedAgent!, "✓ Respuesta enviada");

        // Reset to idle after a bit
        setTimeout(() => {
          updateAgentStatus(selectedAgent!, "idle");
          setAgents((prev) =>
            prev.map((a) =>
              a.id === selectedAgent ? { ...a, currentTask: null } : a,
            ),
          );
        }, 3000);
      } catch (err) {
        setChatHistories((prev) => ({
          ...prev,
          [selectedAgent!]: [
            ...(prev[selectedAgent!] || []),
            {
              role: "agent",
              content: "Lo siento, ha ocurrido un error. Inténtalo de nuevo.",
              timestamp: Date.now(),
            },
          ],
        }));
        updateAgentStatus(selectedAgent!, "idle");
      } finally {
        setSending(false);
      }
    },
    [selectedAgent, updateAgentStatus, addLog, simulateDelegation],
  );

  // ── Demo simulation ──
  const runDemo = useCallback(() => {
    addLog("ceo", "🎬 Iniciando demo de la oficina...");

    // Step 1: CEO receives task
    setTimeout(() => {
      updateAgentStatus("ceo", "thinking", "Analizando petición...");
      addLog("ceo", "Analizando petición del usuario...");
    }, 500);

    // Step 2: CEO delegates to email
    setTimeout(() => {
      simulateDelegation("ceo", "recepcion", "Revisar bandeja");
    }, 2500);

    // Step 3: CEO also delegates to fiscal
    setTimeout(() => {
      simulateDelegation("ceo", "fiscal", "Facturas pendientes");
    }, 4000);

    // Step 4: CRM starts working independently
    setTimeout(() => {
      updateAgentStatus("comercial-principal", "working", "Actualizando scoring");
      addLog("comercial-principal", "Recalculando scoring de contactos...");
    }, 5000);

    setTimeout(() => {
      updateAgentStatus("comercial-principal", "done", "Scoring actualizado");
      addLog("comercial-principal", "✓ 47 contactos actualizados");
    }, 9000);

    setTimeout(() => {
      updateAgentStatus("comercial-principal", "idle");
      setAgents((prev) =>
        prev.map((a) =>
          a.id === "comercial-principal" ? { ...a, currentTask: null } : a,
        ),
      );
    }, 12000);

    // Step 5: Legal checks everything
    setTimeout(() => {
      updateAgentStatus("legal-rgpd", "thinking", "Verificando RGPD...");
      addLog("legal-rgpd", "Verificando cumplimiento RGPD...");
    }, 7000);

    setTimeout(() => {
      updateAgentStatus("legal-rgpd", "done", "RGPD ✓ OK");
      addLog("legal-rgpd", "✓ Todos los procesos cumplen RGPD");
    }, 10000);

    setTimeout(() => {
      updateAgentStatus("legal-rgpd", "idle");
      setAgents((prev) =>
        prev.map((a) =>
          a.id === "legal-rgpd" ? { ...a, currentTask: null } : a,
        ),
      );
    }, 13000);

    // Step 6: Marketing creates content
    setTimeout(() => {
      updateAgentStatus("marketing-automation", "working", "Preparando contenido...");
      addLog("marketing-automation", "Creando calendario de contenido semanal...");
    }, 6000);

    setTimeout(() => {
      updateAgentStatus("marketing-automation", "done", "Contenido ✓");
      addLog("marketing-automation", "✓ 5 posts programados, 1 newsletter lista");
    }, 11000);

    setTimeout(() => {
      updateAgentStatus("marketing-automation", "idle");
      setAgents((prev) =>
        prev.map((a) =>
          a.id === "marketing-automation" ? { ...a, currentTask: null } : a,
        ),
      );
    }, 14000);

    // Step 7: Analista BI generates report
    setTimeout(() => {
      updateAgentStatus("bi-scoring", "working", "Analizando datos...");
      addLog("bi-scoring", "Generando informe de Business Intelligence...");
    }, 8000);

    setTimeout(() => {
      updateAgentStatus("bi-scoring", "done", "Informe BI ✓");
      addLog("bi-scoring", "✓ Dashboard actualizado, KPIs al día");
    }, 12000);

    setTimeout(() => {
      updateAgentStatus("bi-scoring", "idle");
      setAgents((prev) =>
        prev.map((a) =>
          a.id === "bi-scoring" ? { ...a, currentTask: null } : a,
        ),
      );
    }, 15000);
  }, [updateAgentStatus, addLog, simulateDelegation]);

  // ── Global chat (no agent pre-selected — CEO routes automatically) ──
  const [globalInput, setGlobalInput] = useState("");
  const [globalMessages, setGlobalMessages] = useState<ChatMsg[]>([]);
  const [globalSending, setGlobalSending] = useState(false);
  const globalChatRef = useRef<HTMLDivElement>(null);

  const handleGlobalSend = useCallback(
    async (msg: string) => {
      if (!msg.trim()) return;

      setGlobalMessages((prev) => [
        ...prev,
        { role: "user", content: msg, timestamp: Date.now() },
      ]);
      setGlobalInput("");
      setGlobalSending(true);

      // Animate CEO as thinking + speech bubble
      updateAgentStatus("ceo", "thinking", "Analizando petición...");
      showBubble("ceo", "Déjame ver... 🤔", "work", 3000);
      addLog("ceo", `Nueva consulta: "${msg.slice(0, 80)}"`);

      try {
        const res = await fetch("/api/agent-gpt5", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: msg }],
          }),
        });

        if (!res.ok) throw new Error("Error del agente");
        const data = await res.json();
        const reply = data.reply || data.response || "Sin respuesta.";
        const respondingAgent = data.agentId || "ceo";

        // Animate: CEO walks to the responding agent's desk
        if (respondingAgent !== "ceo") {
          const targetAgent = agents.find((a) => a.id === respondingAgent);
          if (targetAgent) {
            showBubble("ceo", `Esto es para ${targetAgent.shortName}...`, "work", 2000);
            // CEO walks to target agent
            setTimeout(() => {
              walkAgent("ceo", { x: targetAgent.homePosition.x - 4, y: targetAgent.homePosition.y - 3 }, () => {
                showBubble("ceo", `${targetAgent.shortName}, necesito que hagas esto`, "work", 2500);
                showBubble(respondingAgent, "Entendido, lo reviso ahora 👍", "work", 2500);
                addLog(respondingAgent, `Recibida tarea del CEO`);
                updateAgentStatus(respondingAgent, "working", "Procesando...");
                // CEO walks back home
                walkHome("ceo", 2800);
              });
            }, 500);
          }
          // Show tool calls as speech bubbles on the working agent
          if (data.toolCalls && data.toolCalls.length > 0) {
            data.toolCalls.forEach((tc: { name: string }, i: number) => {
              setTimeout(() => {
                showBubble(respondingAgent, `🔧 Usando ${tc.name}...`, "tool", 2500);
                addLog(respondingAgent, `🔧 ${tc.name}`);
              }, 3500 + i * 1500);
            });
          }
        } else {
          // CEO handles it himself
          updateAgentStatus("ceo", "working", "Procesando...");
          if (data.toolCalls && data.toolCalls.length > 0) {
            data.toolCalls.forEach((tc: { name: string }, i: number) => {
              setTimeout(() => {
                showBubble("ceo", `🔧 ${tc.name}...`, "tool", 2000);
                addLog("ceo", `🔧 ${tc.name}`);
              }, 500 + i * 1200);
            });
          }
        }

        // Show completion
        const completionDelay = respondingAgent !== "ceo" ? 5000 : 2000;
        setTimeout(() => {
          const shortReply = reply.length > 60 ? reply.slice(0, 57) + "..." : reply;
          showBubble(respondingAgent, `✅ ${shortReply}`, "done", 4000);
          updateAgentStatus(respondingAgent, "done", "Completado");
          addLog(respondingAgent, "✓ Tarea completada");
        }, completionDelay);

        // Reset to idle
        setTimeout(() => {
          walkHome(respondingAgent);
        }, completionDelay + 4500);

        // Handle delegations — walk physically
        if (data.delegations) {
          for (const d of data.delegations) {
            const delegateTarget = agents.find((a: OfficeAgent) => a.id === d.toAgent);
            if (delegateTarget) {
              walkAgent(respondingAgent, delegateTarget.homePosition, () => {
                showBubble(d.toAgent, `Recibido: ${d.reason}`, "work", 3000);
                updateAgentStatus(d.toAgent, "working", d.reason);
                walkHome(respondingAgent, 2000);
              });
            }
          }
        }

        const agentInfo = INITIAL_AGENTS.find((a) => a.id === respondingAgent);
        setGlobalMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content: `**${agentInfo?.shortName || respondingAgent}**: ${reply}`,
            timestamp: Date.now(),
          },
        ]);
      } catch {
        setGlobalMessages((prev) => [
          ...prev,
          { role: "agent", content: "Error de conexión. Inténtalo de nuevo.", timestamp: Date.now() },
        ]);
        updateAgentStatus("ceo", "idle");
      } finally {
        setGlobalSending(false);
      }
    },
    [updateAgentStatus, addLog, simulateDelegation, showBubble, walkAgent, walkHome, agents],
  );

  // Auto-scroll global chat
  useEffect(() => {
    if (globalChatRef.current) {
      globalChatRef.current.scrollTop = globalChatRef.current.scrollHeight;
    }
  }, [globalMessages]);

  const selected = agents.find((a) => a.id === selectedAgent);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/30"
            style={{ boxShadow: "0 0 20px rgba(6, 182, 212, 0.2)" }}
          >
            <Cpu className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-shimmer">Sinergia AI</h2>
            <p className="text-[10px] text-[var(--text-secondary)] font-mono">
              {agents.filter((a) => a.status !== "idle").length} agentes activos · {agents.length} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runDemo}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition flex items-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ver Demo
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Office Floor */}
        <div className={`flex-1 flex flex-col gap-4 min-w-0 ${selected ? "lg:w-[60%]" : "w-full"}`}>
          {/* The Office */}
          <div
            className="flex-1 glass-card rounded-2xl relative overflow-hidden min-h-[400px]"
            style={{
              background: "linear-gradient(180deg, #0a0f1e 0%, #0d1525 40%, #101c30 100%)",
            }}
            onClick={(e) => {
              // Close popup if clicking on empty office floor (not on a child interactive element)
              if (e.target === e.currentTarget) setActivePopup(null);
            }}>
            {/* ── OFFICE FLOOR — different zones with distinct flooring ── */}
            {/* Main floor — light grey carpet */}
            <div className="absolute inset-0"
              style={{ background: "linear-gradient(180deg, #0f1a2e 0%, #121f35 50%, #0e1928 100%)" }} />
            {/* Corridor floor — darker, like polished stone */}
            <div className="absolute top-[25%] left-[0%] right-[0%] h-[5%] z-[2]"
              style={{ background: "linear-gradient(180deg, rgba(20,35,55,0.8) 0%, rgba(15,28,45,0.6) 50%, rgba(20,35,55,0.8) 100%)" }} />
            <div className="absolute top-[50%] left-[0%] right-[0%] h-[5%] z-[2]"
              style={{ background: "linear-gradient(180deg, rgba(20,35,55,0.8) 0%, rgba(15,28,45,0.6) 50%, rgba(20,35,55,0.8) 100%)" }} />
            {/* Vertical corridor */}
            <div className="absolute top-[25%] bottom-[18%] left-[48%] w-[4%] z-[2]"
              style={{ background: "linear-gradient(90deg, rgba(20,35,55,0.6) 0%, rgba(15,28,45,0.4) 50%, rgba(20,35,55,0.6) 100%)" }} />
            {/* Floor tile lines on corridors */}
            <div className="absolute top-[26%] left-[5%] right-[5%] h-[1px] z-[3] opacity-20"
              style={{ background: "repeating-linear-gradient(90deg, transparent 0px, transparent 40px, rgba(100,150,200,0.3) 40px, rgba(100,150,200,0.3) 41px)" }} />
            <div className="absolute top-[51%] left-[5%] right-[5%] h-[1px] z-[3] opacity-20"
              style={{ background: "repeating-linear-gradient(90deg, transparent 0px, transparent 40px, rgba(100,150,200,0.3) 40px, rgba(100,150,200,0.3) 41px)" }} />

            {/* ── TOP WALL: Windows with city panorama ── */}
            <div className="absolute top-0 left-0 right-0 h-[7%] z-[3]"
              style={{ background: "linear-gradient(180deg, #0c1422 0%, #0f1a2e 100%)" }}>
              {[8, 22, 36, 50, 64, 78, 92].map((x, i) => (
                <div key={i} className="absolute top-[20%] h-[65%] w-[9%] rounded-[2px] overflow-hidden border border-[#1e3a5f]/50"
                  style={{ left: `${x}%`, background: "linear-gradient(180deg, #0a1520 0%, #142535 40%, #0f1d2e 100%)" }}>
                  <div className="absolute bottom-0 left-0 right-0 h-[35%] opacity-25"
                    style={{ background: "linear-gradient(180deg, transparent 0%, #06b6d4 100%)",
                      clipPath: i % 2 === 0
                        ? "polygon(0% 50%, 20% 25%, 40% 55%, 60% 15%, 80% 40%, 100% 20%, 100% 100%, 0% 100%)"
                        : "polygon(0% 35%, 15% 55%, 35% 20%, 55% 45%, 75% 10%, 100% 40%, 100% 100%, 0% 100%)"
                    }} />
                </div>
              ))}
            </div>

            {/* ── OUTER WALLS — thick, solid borders ── */}
            <div className="absolute top-[7%] left-0 w-[3.5%] h-[93%] z-[3]"
              style={{ background: "linear-gradient(90deg, #0a1018 0%, #111d2e 70%, transparent 100%)" }} />
            <div className="absolute top-[7%] right-0 w-[3.5%] h-[93%] z-[3]"
              style={{ background: "linear-gradient(270deg, #0a1018 0%, #111d2e 70%, transparent 100%)" }} />
            <div className="absolute bottom-0 left-0 right-0 h-[3%] z-[3]"
              style={{ background: "linear-gradient(0deg, #0a1018 0%, transparent 100%)" }} />

            {/* ── CUBICLE PARTITIONS — real office separators ── */}
            {/* CEO despacho — mamparas forming the boss office */}
            <div className="absolute top-[7%] left-[35%] w-[30%] h-[20%] z-[4] pointer-events-none border border-cyan-500/20 rounded-sm"
              style={{ background: "rgba(10,20,35,0.3)", borderStyle: "solid", borderWidth: "0 1px 2px 1px" }}>
              {/* Glass panels on CEO office */}
              <div className="absolute inset-x-0 bottom-0 h-[3px]"
                style={{ background: "linear-gradient(90deg, rgba(56,189,248,0.3) 0%, rgba(56,189,248,0.5) 50%, rgba(56,189,248,0.3) 100%)" }} />
              {/* Door gap */}
              <div className="absolute bottom-[-2px] left-[45%] w-[10%] h-[4px] bg-[#121f35]" />
            </div>

            {/* Cubicle walls — Row 1 (left block: Recepcionista + Dir. Comercial) */}
            <div className="absolute top-[30%] left-[4%] w-[42%] h-[18%] z-[4] pointer-events-none">
              {/* Back panel */}
              <div className="absolute inset-x-0 top-0 h-[3px] rounded-full"
                style={{ background: "linear-gradient(90deg, #1e3a5f 0%, #2a4a6f 50%, #1e3a5f 100%)", opacity: 0.6 }} />
              {/* Separator between Recepcionista (15%) and Dir. Comercial (50%) — at ~50% of this block */}
              <div className="absolute top-0 bottom-[20%] left-[50%] w-[3px] rounded-full"
                style={{ background: "linear-gradient(180deg, #2a4a6f 0%, rgba(42,74,111,0.3) 100%)", opacity: 0.5 }} />
              {/* Small shelf/partition top */}
              <div className="absolute top-[-1px] left-[48%] w-[6%] h-[2px] bg-slate-600/30 rounded" />
            </div>

            {/* Cubicle walls — Row 1 (right block: Fiscal) */}
            <div className="absolute top-[30%] right-[4%] w-[42%] h-[18%] z-[4] pointer-events-none">
              <div className="absolute inset-x-0 top-0 h-[3px] rounded-full"
                style={{ background: "linear-gradient(90deg, #1e3a5f 0%, #2a4a6f 50%, #1e3a5f 100%)", opacity: 0.6 }} />
              <div className="absolute top-0 bottom-[20%] left-[50%] w-[3px] rounded-full"
                style={{ background: "linear-gradient(180deg, #2a4a6f 0%, rgba(42,74,111,0.3) 100%)", opacity: 0.5 }} />
              <div className="absolute top-[-1px] left-[48%] w-[6%] h-[2px] bg-slate-600/30 rounded" />
            </div>

            {/* Cubicle walls — Row 2 (bottom: Energy, Automation, Legal, Marketing, WebMaster) */}
            <div className="absolute top-[55%] left-[4%] w-[92%] h-[18%] z-[4] pointer-events-none">
              <div className="absolute inset-x-0 top-0 h-[3px] rounded-full"
                style={{ background: "linear-gradient(90deg, #1e3a5f 0%, #2a4a6f 30%, #1e3a5f 50%, #2a4a6f 70%, #1e3a5f 100%)", opacity: 0.5 }} />
              {/* Separators between each desk (~20% apart) */}
              {[20, 40, 55, 75].map((pct) => (
                <div key={pct} className="absolute top-0 bottom-[25%] w-[3px] rounded-full"
                  style={{ left: `${pct}%`, background: "linear-gradient(180deg, #2a4a6f 0%, rgba(42,74,111,0.2) 100%)", opacity: 0.45 }} />
              ))}
            </div>

            {/* ── MEETING ROOM (bottom-right, glass walls) ── */}
            <div className="absolute bottom-[4%] right-[4%] w-[18%] h-[16%] z-[4] pointer-events-none rounded-sm"
              style={{ border: "1.5px solid rgba(56,189,248,0.25)" }}>
              <div className="absolute top-[-1px] left-[30%] w-[40%] h-[3px] bg-[#121f35]" /> {/* Door gap */}
              <div className="absolute inset-0 rounded-sm" style={{ background: "rgba(56,189,248,0.03)" }} />
              {/* Meeting room table */}
              <div className="absolute top-[25%] left-[20%] w-[60%] h-[50%] rounded-md border border-slate-600/30"
                style={{ background: "rgba(30,50,75,0.4)" }} />
            </div>

            {/* ── CORRIDOR ARROWS (subtle floor markings) ── */}
            <div className="absolute top-[27%] left-[12%] z-[3] opacity-10">
              <span className="text-[10px] text-slate-400">→</span>
            </div>
            <div className="absolute top-[27%] right-[12%] z-[3] opacity-10">
              <span className="text-[10px] text-slate-400">←</span>
            </div>
            <div className="absolute top-[52%] left-[12%] z-[3] opacity-10">
              <span className="text-[10px] text-slate-400">→</span>
            </div>
            <div className="absolute top-[52%] right-[12%] z-[3] opacity-10">
              <span className="text-[10px] text-slate-400">←</span>
            </div>

            {/* ── ROOM LABELS (zone signs on walls) ── */}
            <div className="absolute top-[8%] left-[43%] z-20 px-2 py-0.5 rounded-sm border border-amber-500/20"
              style={{ background: "rgba(10,15,25,0.8)" }}>
              <span className="text-[7px] font-mono text-amber-400/60 uppercase tracking-[0.25em]">Dirección General</span>
            </div>
            <div className="absolute top-[29%] left-[5%] z-20 px-1.5 py-0.5 rounded-sm border border-blue-500/15"
              style={{ background: "rgba(10,15,25,0.7)" }}>
              <span className="text-[7px] font-mono text-blue-400/50 uppercase tracking-[0.15em]">Comunicaciones</span>
            </div>
            <div className="absolute top-[29%] right-[5%] z-20 px-1.5 py-0.5 rounded-sm border border-emerald-500/15"
              style={{ background: "rgba(10,15,25,0.7)" }}>
              <span className="text-[7px] font-mono text-emerald-400/50 uppercase tracking-[0.15em]">Finanzas & Ventas</span>
            </div>
            <div className="absolute top-[54%] left-[5%] z-20 px-1.5 py-0.5 rounded-sm border border-purple-500/15"
              style={{ background: "rgba(10,15,25,0.7)" }}>
              <span className="text-[7px] font-mono text-purple-400/50 uppercase tracking-[0.15em]">Especialistas</span>
            </div>
            <div className="absolute bottom-[5%] right-[7%] z-20 px-1.5 py-0.5 rounded-sm border border-cyan-500/15"
              style={{ background: "rgba(10,15,25,0.7)" }}>
              <span className="text-[7px] font-mono text-cyan-400/50 uppercase tracking-[0.15em]">Sala Reuniones</span>
            </div>

            {/* ── Office status indicator ── */}
            <div className="absolute top-[2%] left-[4%] z-20 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[8px] font-mono text-slate-500 uppercase tracking-[0.2em]">
                Somos Sinergia · Planta Principal
              </span>
            </div>
            <div className="absolute top-[2%] right-[4%] z-20 opacity-30">
              <span className="text-[10px] font-bold tracking-[0.3em] text-cyan-400 uppercase">SINERGIA</span>
            </div>

            {/* ── Overhead lights (ceiling spots) ── */}
            {[20, 40, 60, 80].map((x) => (
              <div key={x} className="absolute top-[7%] w-[12%] h-[35%] pointer-events-none z-[1]"
                style={{ left: `${x - 6}%`, background: `radial-gradient(ellipse at 50% 0%, rgba(251,191,36,0.05) 0%, transparent 70%)` }} />
            ))}

            {/* ── DECORATIVE ELEMENTS ── */}
            {/* Plants in corridor */}
            <div className="absolute top-[26%] left-[5%] z-[6] opacity-75">
              <PlantSVG size={20} variant={0} />
            </div>
            <div className="absolute top-[26%] right-[5%] z-[6] opacity-70">
              <PlantSVG size={18} variant={2} />
            </div>
            <div className="absolute top-[51%] left-[48%] z-[6] opacity-60">
              <PlantSVG size={16} variant={1} />
            </div>
            {/* Plants at corners */}
            <div className="absolute top-[8%] left-[36%] z-[6] opacity-70">
              <PlantSVG size={22} variant={0} />
            </div>
            <div className="absolute bottom-[6%] left-[5%] z-[6] opacity-65">
              <PlantSVG size={24} variant={0} />
            </div>
            <div className="absolute top-[55%] right-[25%] z-[6] opacity-50">
              <PlantSVG size={14} variant={1} />
            </div>

            {/* Fire extinguisher on wall */}
            <div className="absolute top-[40%] left-[3.5%] z-[5] w-[6px] h-[14px] rounded-sm bg-red-700/40 border border-red-600/20" />
            {/* Exit sign */}
            <div className="absolute top-[50%] right-[3.8%] z-[5] px-1 py-0.5 rounded-sm bg-green-800/30 border border-green-600/20">
              <span className="text-[5px] text-green-400/60 font-bold">EXIT</span>
            </div>

            {/* ── Coffee & Water Station (interactive) ── */}
            <div
              className="absolute bottom-[8%] left-[5%] z-[6] flex gap-3 items-end opacity-70 cursor-pointer hover:opacity-100 transition-opacity"
              onClick={() => setActivePopup(activePopup === "coffee" ? null : "coffee")}
            >
              <CoffeeMachineSVG />
              <WaterCoolerSVG />
            </div>
            {/* Coffee popup */}
            {activePopup === "coffee" && (
              <div className="absolute bottom-[22%] left-[3%] z-50 animate-fade-in">
                <div className="glass-card rounded-xl p-3 border border-cyan-500/20 w-[180px]" style={{ background: "rgba(10,15,30,0.95)", backdropFilter: "blur(16px)" }}>
                  <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-2">Estado del Equipo ☕</div>
                  {agents.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 py-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${a.status === "idle" ? "bg-gray-600" : "bg-green-400"}`} />
                      <span className="text-[9px] font-mono" style={{ color: a.color }}>{a.shortName}</span>
                      <span className="text-[8px] text-slate-500 ml-auto">{STATUS_LABEL[a.status]}</span>
                    </div>
                  ))}
                  <div className="mt-2 pt-2 border-t border-white/5 text-[9px] text-slate-400">
                    {agents.filter((a) => a.status !== "idle").length}/{agents.length} activos
                  </div>
                </div>
              </div>
            )}

            {/* ── Bookshelf (interactive) ── */}
            <div
              className="absolute top-[30%] right-[1%] z-[4] opacity-50 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setActivePopup(activePopup === "bookshelf" ? null : "bookshelf")}
            >
              <BookshelfSVG />
            </div>
            {activePopup === "bookshelf" && (
              <div className="absolute top-[30%] right-[8%] z-50 animate-fade-in">
                <div className="glass-card rounded-xl p-3 border border-amber-500/20 w-[170px]" style={{ background: "rgba(10,15,30,0.95)", backdropFilter: "blur(16px)" }}>
                  <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2">Biblioteca 📚</div>
                  {["Normativa CNMC 2024", "RD 244/2019 Autoconsumo", "Guía RGPD", "Manual tarifas 2.0TD", "Protocolo fotovoltaico"].map((book, i) => (
                    <div key={i} className="text-[9px] text-slate-400 py-0.5 flex items-center gap-1">
                      <span className="text-amber-500/60">■</span> {book}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Whiteboard (interactive) ── */}
            <div
              className="absolute top-[9%] left-[30%] z-[4] opacity-40 cursor-pointer hover:opacity-70 transition-opacity"
              onClick={() => setActivePopup(activePopup === "whiteboard" ? null : "whiteboard")}
            >
              <WhiteboardSVG />
            </div>
            {activePopup === "whiteboard" && (
              <div className="absolute top-[15%] left-[28%] z-50 animate-fade-in">
                <div className="glass-card rounded-xl p-3 border border-blue-500/20 w-[200px]" style={{ background: "rgba(10,15,30,0.95)", backdropFilter: "blur(16px)" }}>
                  <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">Pizarra Sprint 📋</div>
                  <div className="space-y-1">
                    {[
                      { task: "Auditoría facturas Q2", done: true },
                      { task: "Campaña SEO solar", done: true },
                      { task: "Informe cliente García", done: false },
                      { task: "Renovar SSL web", done: false },
                      { task: "Optimizar tarifas López", done: false },
                    ].map((t, i) => (
                      <div key={i} className="flex items-center gap-2 text-[9px]">
                        <span>{t.done ? "✅" : "⬜"}</span>
                        <span className={t.done ? "text-slate-500 line-through" : "text-slate-300"}>{t.task}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-white/5 text-[9px] text-emerald-400">
                    2/5 completadas
                  </div>
                </div>
              </div>
            )}

            {/* ── Meeting Table ── */}
            <div className="absolute bottom-[10%] right-[12%] z-[4]">
              <svg width="60" height="40" viewBox="0 0 60 40">
                <ellipse cx="30" cy="35" rx="28" ry="5" fill="black" opacity="0.2" />
                <ellipse cx="30" cy="20" rx="26" ry="14" fill="#1e293b" stroke="#334155" strokeWidth="1" />
                <ellipse cx="30" cy="20" rx="24" ry="12" fill="#0f172a" />
                <ellipse cx="30" cy="18" rx="16" ry="6" fill="white" opacity="0.02" />
                <rect x="27" y="28" width="6" height="8" rx="1" fill="#334155" />
                <ellipse cx="6" cy="20" rx="5" ry="4" fill="#1e293b" stroke="#475569" strokeWidth="0.5" />
                <ellipse cx="54" cy="20" rx="5" ry="4" fill="#1e293b" stroke="#475569" strokeWidth="0.5" />
                <ellipse cx="30" cy="4" rx="5" ry="3" fill="#1e293b" stroke="#475569" strokeWidth="0.5" />
                <ellipse cx="30" cy="38" rx="5" ry="3" fill="#1e293b" stroke="#475569" strokeWidth="0.5" />
              </svg>
            </div>

            {/* ── Wall Clock (real-time) ── */}
            <div className="absolute top-[9%] right-[16%] z-20">
              <svg width="36" height="36" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="18" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
                <circle cx="20" cy="20" r="16" fill="#0a0f1e" />
                {/* Hour marks */}
                {[...Array(12)].map((_, i) => {
                  const angle = (i * 30 - 90) * (Math.PI / 180);
                  const x1 = 20 + 13 * Math.cos(angle);
                  const y1 = 20 + 13 * Math.sin(angle);
                  const x2 = 20 + 15 * Math.cos(angle);
                  const y2 = 20 + 15 * Math.sin(angle);
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#475569" strokeWidth={i % 3 === 0 ? "1.5" : "0.8"} />;
                })}
                {/* Hour hand */}
                {(() => {
                  const h = clockTime.getHours() % 12;
                  const m = clockTime.getMinutes();
                  const angle = ((h * 30 + m * 0.5) - 90) * (Math.PI / 180);
                  return <line x1="20" y1="20" x2={20 + 9 * Math.cos(angle)} y2={20 + 9 * Math.sin(angle)} stroke="#e2e8f0" strokeWidth="1.8" strokeLinecap="round" />;
                })()}
                {/* Minute hand */}
                {(() => {
                  const m = clockTime.getMinutes();
                  const angle = ((m * 6) - 90) * (Math.PI / 180);
                  return <line x1="20" y1="20" x2={20 + 13 * Math.cos(angle)} y2={20 + 13 * Math.sin(angle)} stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" />;
                })()}
                {/* Second hand */}
                {(() => {
                  const s = clockTime.getSeconds();
                  const angle = ((s * 6) - 90) * (Math.PI / 180);
                  return <line x1="20" y1="20" x2={20 + 14 * Math.cos(angle)} y2={20 + 14 * Math.sin(angle)} stroke="#06b6d4" strokeWidth="0.5" strokeLinecap="round" opacity="0.6" />;
                })()}
                {/* Center dot */}
                <circle cx="20" cy="20" r="1.5" fill="#06b6d4" />
              </svg>
              <div className="text-[7px] font-mono text-slate-500 text-center mt-0.5">
                {clockTime.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>

            {/* ── Floor rug under CEO area ── */}
            <div className="absolute top-[10%] left-[35%] w-[30%] h-[15%] rounded-lg z-[2] opacity-[0.08]"
              style={{ background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" }} />

            {/* ── Floating dust particles (subtle ambient) ── */}
            <div className="absolute inset-0 z-[3] pointer-events-none overflow-hidden">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="absolute rounded-full bg-white/[0.03] animate-float-particle"
                  style={{
                    width: `${2 + (i % 3)}px`,
                    height: `${2 + (i % 3)}px`,
                    left: `${10 + i * 11}%`,
                    top: `${15 + (i * 7) % 60}%`,
                    animationDelay: `${i * 1.3}s`,
                    animationDuration: `${8 + (i % 4) * 2}s`,
                  }}
                />
              ))}
            </div>

            {/* ── Ceiling lights (enhanced with glow) ── */}
            {[25, 50, 75].map((x) => (
              <div key={x} className="absolute z-[3] pointer-events-none" style={{ top: "8%", left: `${x}%`, transform: "translateX(-50%)" }}>
                <div className="w-[2px] h-3 bg-slate-600 mx-auto" />
                <div className="w-8 h-1 bg-slate-700 rounded-full mx-auto" />
                <div className="w-16 h-10 rounded-b-full mx-auto -mt-0.5"
                  style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(251,191,36,0.1) 0%, rgba(251,191,36,0.03) 40%, transparent 100%)" }} />
              </div>
            ))}

            {/* ── Toast Notifications ── */}
            <div className="absolute top-[10%] right-[4%] z-50 flex flex-col gap-1.5 pointer-events-none">
              {toasts.map((toast) => (
                <div
                  key={toast.id}
                  className="animate-slide-in-right px-3 py-1.5 rounded-lg text-[9px] font-medium border"
                  style={{
                    background: `${toast.color}15`,
                    borderColor: `${toast.color}30`,
                    color: toast.color,
                    backdropFilter: "blur(12px)",
                  }}
                >
                  {toast.text}
                </div>
              ))}
            </div>

            {/* Delegation lines */}
            {delegations.map((d) => (
              <DelegationArrow key={d.id} line={d} agents={agents} />
            ))}

            {/* Fixed desks (never move) */}
            {agents.map((agent) => (
              <FixedDesk key={`desk-${agent.id}`} agent={agent} />
            ))}

            {/* Agent persons (move with position) */}
            {agents.map((agent) => (
              <AgentPerson
                key={agent.id}
                agent={agent}
                isSelected={selectedAgent === agent.id}
                onClick={() =>
                  setSelectedAgent(selectedAgent === agent.id ? null : agent.id)
                }
              />
            ))}

            {/* ── Floor reflections ── */}
            <div className="absolute bottom-0 left-0 right-0 h-[15%] pointer-events-none z-[1]"
              style={{ background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.3) 100%)" }} />
          </div>

          {/* Global Chat + Activity Log side-by-side */}
          <div className="h-[220px] shrink-0 flex gap-3">
            {/* Global Chat */}
            <div className="flex-1 glass-card rounded-2xl flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--border)] flex items-center gap-2">
                <MessageCircle className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                  Chat — Escribe y los agentes trabajan
                </span>
              </div>
              <div ref={globalChatRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-xs">
                {globalMessages.length === 0 && (
                  <p className="text-[11px] text-[var(--text-secondary)] italic text-center mt-4">
                    Escribe cualquier cosa. El CEO redirige al agente experto.
                  </p>
                )}
                {globalMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`max-w-[90%] rounded-xl px-3 py-2 ${
                      m.role === "user"
                        ? "ml-auto bg-cyan-500/10 border border-cyan-500/20 text-white"
                        : "mr-auto bg-[#0a1628] border border-[var(--border)] text-gray-300"
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
                {globalSending && (
                  <div className="mr-auto flex items-center gap-2 text-cyan-400 text-[11px]">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    Agentes trabajando...
                  </div>
                )}
              </div>
              <div className="px-3 py-2 border-t border-[var(--border)]">
                <div className="flex gap-2">
                  <input
                    value={globalInput}
                    onChange={(e) => setGlobalInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !globalSending && handleGlobalSend(globalInput)}
                    placeholder="Escribe tu mensaje..."
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-[#050a14] border border-[var(--border)] focus:border-cyan-500/50 outline-none"
                    disabled={globalSending}
                  />
                  <button
                    onClick={() => handleGlobalSend(globalInput)}
                    disabled={globalSending || !globalInput.trim()}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-30 transition"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
            {/* Activity Log */}
            <div className="w-[300px] shrink-0 hidden xl:block">
              <ActivityLog entries={activityLog} />
            </div>
          </div>
        </div>

        {/* Agent Chat Panel */}
        {selected && (
          <div className="w-[340px] shrink-0 hidden lg:block">
            <AgentChat
              agent={selected}
              onClose={() => setSelectedAgent(null)}
              chatHistory={chatHistories[selected.id] || []}
              onSendMessage={handleSendMessage}
              sending={sending}
            />
          </div>
        )}
      </div>

      {/* Mobile chat drawer */}
      {selected && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedAgent(null)} />
          <div className="absolute right-0 top-0 bottom-0 w-[90%] max-w-[380px]">
            <AgentChat
              agent={selected}
              onClose={() => setSelectedAgent(null)}
              chatHistory={chatHistories[selected.id] || []}
              onSendMessage={handleSendMessage}
              sending={sending}
            />
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style jsx global>{`
        @keyframes person-walk {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-1.5px) rotate(-0.8deg); }
          50% { transform: translateY(0) rotate(0deg); }
          75% { transform: translateY(-1.5px) rotate(0.8deg); }
        }
        .animate-person-walk {
          animation: person-walk 1.1s ease-in-out infinite;
        }

        @keyframes person-type {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-1px); }
        }
        .animate-person-type {
          animation: person-type 0.3s ease-in-out infinite;
        }

        @keyframes arm-type-left {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(5deg) translateY(-2px); }
        }
        .animate-arm-type-left {
          animation: arm-type-left 0.35s ease-in-out infinite;
          transform-origin: 16px 25px;
        }

        @keyframes arm-type-right {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-5deg) translateY(-2px); }
        }
        .animate-arm-type-right {
          animation: arm-type-right 0.4s ease-in-out infinite;
          transform-origin: 44px 25px;
        }

        @keyframes blink {
          0%, 92%, 100% { opacity: 0; }
          95%, 98% { opacity: 1; }
        }
        .animate-blink {
          animation: blink 4s ease-in-out infinite;
        }

        @keyframes eyes-read {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(2px); }
        }
        .animate-eyes-read {
          animation: eyes-read 1.5s ease-in-out infinite;
        }

        @keyframes talk-mouth {
          0%, 100% { ry: 2; rx: 3; }
          30% { ry: 4; rx: 4; }
          60% { ry: 1.5; rx: 2.5; }
        }
        .animate-talk-mouth {
          animation: talk-mouth 0.4s ease-in-out infinite;
        }

        @keyframes bubble-1 {
          0%, 100% { opacity: 0.6; transform: translateY(0); }
          50% { opacity: 0.3; transform: translateY(-3px); }
        }
        .animate-bubble-1 { animation: bubble-1 1.5s ease-in-out infinite; }

        @keyframes bubble-2 {
          0%, 100% { opacity: 0.5; transform: translateY(0); }
          50% { opacity: 0.2; transform: translateY(-4px); }
        }
        .animate-bubble-2 { animation: bubble-2 1.8s ease-in-out infinite 0.3s; }

        @keyframes bubble-3 {
          0%, 100% { opacity: 0.4; transform: translateY(0); }
          50% { opacity: 0.15; transform: translateY(-5px); }
        }
        .animate-bubble-3 { animation: bubble-3 2s ease-in-out infinite 0.6s; }

        @keyframes code-line-1 {
          0%, 100% { width: 8px; opacity: 0.8; }
          50% { width: 16px; opacity: 0.5; }
        }
        .animate-code-line-1 { animation: code-line-1 2s ease-in-out infinite; }

        @keyframes code-line-2 {
          0%, 100% { width: 14px; opacity: 0.5; }
          50% { width: 8px; opacity: 0.8; }
        }
        .animate-code-line-2 { animation: code-line-2 2.3s ease-in-out infinite 0.5s; }

        @keyframes code-line-3 {
          0%, 100% { width: 10px; opacity: 0.3; }
          50% { width: 16px; opacity: 0.6; }
        }
        .animate-code-line-3 { animation: code-line-3 1.8s ease-in-out infinite 1s; }

        @keyframes dash {
          to { stroke-dashoffset: -24; }
        }
        .animate-dash { animation: dash 1s linear infinite; }

        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.15; transform: translate(-50%, -50%) scale(1.2); }
        }
        .animate-pulse-slow { animation: pulse-slow 3s ease-in-out infinite; }

        @keyframes spin-slow {
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .animate-spin-slow { animation: spin-slow 8s linear infinite; }

        @keyframes fade-in {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }

        @keyframes slide-in-right {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-slide-in-right { animation: slide-in-right 0.3s ease-out; }

        /* Speech bubble pop animation */
        @keyframes bubble-pop {
          0% { opacity: 0; transform: translate(-50%, 5px) scale(0.8); }
          20% { opacity: 1; transform: translate(-50%, -2px) scale(1.05); }
          35% { transform: translate(-50%, 0) scale(1); }
          85% { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -3px) scale(0.95); }
        }
        .animate-bubble-pop {
          animation: bubble-pop 3.5s ease-out forwards;
        }

        /* ── Walking animations — slow natural stroll ── */
        @keyframes leg-left {
          0%   { transform: rotate(0deg); }
          25%  { transform: rotate(8deg); }
          50%  { transform: rotate(0deg); }
          75%  { transform: rotate(-8deg); }
          100% { transform: rotate(0deg); }
        }
        .animate-leg-left {
          animation: leg-left 1.1s ease-in-out infinite;
          transform-origin: 17px 50px;
        }

        @keyframes leg-right {
          0%   { transform: rotate(0deg); }
          25%  { transform: rotate(-8deg); }
          50%  { transform: rotate(0deg); }
          75%  { transform: rotate(8deg); }
          100% { transform: rotate(0deg); }
        }
        .animate-leg-right {
          animation: leg-right 1.1s ease-in-out infinite;
          transform-origin: 30px 50px;
        }

        @keyframes foot-left {
          0%, 50%, 100% { transform: translate(0, 0); }
          25%  { transform: translate(1.5px, -1px); }
          75%  { transform: translate(-1.5px, -1px); }
        }
        .animate-foot-left {
          animation: foot-left 1.1s ease-in-out infinite;
        }

        @keyframes foot-right {
          0%, 50%, 100% { transform: translate(0, 0); }
          25%  { transform: translate(-1.5px, -1px); }
          75%  { transform: translate(1.5px, -1px); }
        }
        .animate-foot-right {
          animation: foot-right 1.1s ease-in-out infinite;
        }

        @keyframes arm-swing-left {
          0%   { transform: rotate(0deg); }
          25%  { transform: rotate(-7deg); }
          50%  { transform: rotate(0deg); }
          75%  { transform: rotate(7deg); }
          100% { transform: rotate(0deg); }
        }
        .animate-arm-swing-left {
          animation: arm-swing-left 1.1s ease-in-out infinite;
          transform-origin: 10px 28px;
        }

        @keyframes arm-swing-right {
          0%   { transform: rotate(0deg); }
          25%  { transform: rotate(7deg); }
          50%  { transform: rotate(0deg); }
          75%  { transform: rotate(-7deg); }
          100% { transform: rotate(0deg); }
        }
        .animate-arm-swing-right {
          animation: arm-swing-right 1.1s ease-in-out infinite;
          transform-origin: 37px 28px;
        }

        @keyframes hand-swing-left {
          0%, 50%, 100% { transform: translate(0, 0); }
          25%  { transform: translate(-1px, 2px); }
          75%  { transform: translate(1px, -2px); }
        }
        .animate-hand-swing-left {
          animation: hand-swing-left 1.1s ease-in-out infinite;
        }

        @keyframes hand-swing-right {
          0%, 50%, 100% { transform: translate(0, 0); }
          25%  { transform: translate(1px, -2px); }
          75%  { transform: translate(-1px, 2px); }
        }
        .animate-hand-swing-right {
          animation: hand-swing-right 1.1s ease-in-out infinite;
        }

        @keyframes legs-walk {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(0.5px); }
        }
        .animate-legs-walk {
          animation: legs-walk 0.55s ease-in-out infinite;
        }

        /* Coffee steam */
        @keyframes steam-1 {
          0%, 100% { opacity: 0.3; transform: translateY(0) translateX(0); }
          50% { opacity: 0.1; transform: translateY(-4px) translateX(2px); }
        }
        .animate-steam-1 { animation: steam-1 2s ease-in-out infinite; }

        @keyframes steam-2 {
          0%, 100% { opacity: 0.2; transform: translateY(0) translateX(0); }
          50% { opacity: 0.05; transform: translateY(-5px) translateX(-1px); }
        }
        .animate-steam-2 { animation: steam-2 2.5s ease-in-out infinite 0.5s; }

        /* Water cooler bubbles */
        @keyframes bubble-water-1 {
          0%, 100% { opacity: 0.4; transform: translateY(0); }
          50% { opacity: 0.1; transform: translateY(-4px); }
        }
        .animate-bubble-water-1 { animation: bubble-water-1 3s ease-in-out infinite; }

        @keyframes bubble-water-2 {
          0%, 100% { opacity: 0.3; transform: translateY(0); }
          50% { opacity: 0.1; transform: translateY(-3px); }
        }
        .animate-bubble-water-2 { animation: bubble-water-2 4s ease-in-out infinite 1s; }

        /* Floating dust particles */
        @keyframes float-particle {
          0% { transform: translate(0, 0); opacity: 0; }
          15% { opacity: 0.04; }
          50% { transform: translate(15px, -30px); opacity: 0.06; }
          85% { opacity: 0.03; }
          100% { transform: translate(-10px, -60px); opacity: 0; }
        }
        .animate-float-particle {
          animation: float-particle 10s ease-in-out infinite;
        }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}
