/**
 * PREPRODUCTION TESTS — Office Virtual: 10 Agents Visual Integrity
 *
 * VIS1: All 10 agents present in INITIAL_AGENTS array
 * VIS2: No duplicate agent IDs
 * VIS3: Agent positions are non-overlapping (minimum distance)
 * VIS4: comercial-junior specifically present and positioned
 * VIS5: Counter shows 10 total (agents.length)
 * VIS6: Every backend agent has a visual representation
 * VIS7: No legacy/orphan agents in visual layer
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

const EXPECTED_10_AGENTS = [
  "ceo",
  "recepcion",
  "comercial-principal",
  "comercial-junior",
  "consultor-servicios",
  "consultor-digital",
  "legal-rgpd",
  "fiscal",
  "bi-scoring",
  "marketing-automation",
];

// ─── VIS1: All 10 agents in INITIAL_AGENTS ──────────────────────────────

describe("VIS1: All 10 agents present in INITIAL_AGENTS", () => {
  const uiContent = readFile("src/components/AgentOfficeMap.tsx");

  for (const agentId of EXPECTED_10_AGENTS) {
    it(`INITIAL_AGENTS includes "${agentId}"`, () => {
      // Check that the agent ID appears as an id: "..." in the component
      expect(uiContent).toContain(`id: "${agentId}"`);
    });
  }

  it("has exactly 10 entries in INITIAL_AGENTS", () => {
    // Extract the INITIAL_AGENTS block and count id: "..." lines
    const match = uiContent.match(/const INITIAL_AGENTS[\s\S]*?^];/m);
    expect(match).toBeTruthy();
    const idMatches = match![0].match(/id:\s*"/g);
    expect(idMatches).toBeTruthy();
    expect(idMatches!.length).toBe(10);
  });
});

// ─── VIS2: No duplicate IDs ─────────────────────────────────────────────

describe("VIS2: No duplicate agent IDs in visual layer", () => {
  const uiContent = readFile("src/components/AgentOfficeMap.tsx");

  it("no duplicate id: values in INITIAL_AGENTS", () => {
    const match = uiContent.match(/const INITIAL_AGENTS[\s\S]*?^];/m);
    expect(match).toBeTruthy();
    const ids = [...match![0].matchAll(/id:\s*"([^"]+)"/g)].map(m => m[1]);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
    expect(ids.length).toBe(10);
  });
});

// ─── VIS3: Positions are non-overlapping ────────────────────────────────

describe("VIS3: Agent positions non-overlapping", () => {
  const uiContent = readFile("src/components/AgentOfficeMap.tsx");

  it("no two agents share the same homePosition", () => {
    // Extract all homePosition: { x: N, y: N } patterns
    const match = uiContent.match(/const INITIAL_AGENTS[\s\S]*?^];/m);
    expect(match).toBeTruthy();

    const positions = [...match![0].matchAll(/homePosition:\s*\{\s*x:\s*(\d+),\s*y:\s*(\d+)\s*\}/g)]
      .map(m => ({ x: parseInt(m[1]), y: parseInt(m[2]) }));

    expect(positions.length).toBe(10);

    // Check that no two positions are identical
    const posStrings = positions.map(p => `${p.x},${p.y}`);
    const uniquePos = new Set(posStrings);
    expect(posStrings.length).toBe(uniquePos.size);
  });

  it("agents in the same row have at least 15% horizontal separation", () => {
    const match = uiContent.match(/const INITIAL_AGENTS[\s\S]*?^];/m);
    expect(match).toBeTruthy();

    // Extract id + homePosition pairs
    const agents: Array<{ id: string; x: number; y: number }> = [];
    const blocks = match![0].split(/\{\s*\n\s*id:/);

    for (const block of blocks) {
      const idMatch = block.match(/^\s*"([^"]+)"/);
      const posMatch = block.match(/homePosition:\s*\{\s*x:\s*(\d+),\s*y:\s*(\d+)\s*\}/);
      if (idMatch && posMatch) {
        agents.push({
          id: idMatch[1],
          x: parseInt(posMatch[1]),
          y: parseInt(posMatch[2]),
        });
      }
    }

    // Group by Y row
    const byRow = new Map<number, typeof agents>();
    for (const a of agents) {
      if (!byRow.has(a.y)) byRow.set(a.y, []);
      byRow.get(a.y)!.push(a);
    }

    // Check minimum horizontal distance within each row
    for (const [y, rowAgents] of byRow) {
      const sorted = rowAgents.sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].x - sorted[i - 1].x;
        expect(gap).toBeGreaterThanOrEqual(15);
      }
    }
  });
});

// ─── VIS4: comercial-junior specifically ────────────────────────────────

describe("VIS4: comercial-junior present and positioned", () => {
  const uiContent = readFile("src/components/AgentOfficeMap.tsx");

  it("has id comercial-junior in INITIAL_AGENTS", () => {
    expect(uiContent).toContain('id: "comercial-junior"');
  });

  it("has a unique homePosition (not same as comercial-principal)", () => {
    // Extract positions for both comerciales
    const principalPos = uiContent.match(/id:\s*"comercial-principal"[\s\S]*?homePosition:\s*\{\s*x:\s*(\d+),\s*y:\s*(\d+)/);
    const juniorPos = uiContent.match(/id:\s*"comercial-junior"[\s\S]*?homePosition:\s*\{\s*x:\s*(\d+),\s*y:\s*(\d+)/);

    expect(principalPos).toBeTruthy();
    expect(juniorPos).toBeTruthy();

    const px = parseInt(principalPos![1]);
    const py = parseInt(principalPos![2]);
    const jx = parseInt(juniorPos![1]);
    const jy = parseInt(juniorPos![2]);

    // Must not be identical
    expect(`${jx},${jy}`).not.toBe(`${px},${py}`);

    // If same row, must have at least 15% horizontal gap
    if (jy === py) {
      expect(Math.abs(jx - px)).toBeGreaterThanOrEqual(15);
    }
  });

  it("has shortName and role defined", () => {
    const juniorBlock = uiContent.match(/id:\s*"comercial-junior"[\s\S]*?pose:/);
    expect(juniorBlock).toBeTruthy();
    expect(juniorBlock![0]).toContain('shortName:');
    expect(juniorBlock![0]).toContain('role:');
  });

  it("has dialogues defined in SOLO_DIALOGUES", () => {
    expect(uiContent).toContain('"comercial-junior":');
    // Check it has dialogue lines
    const dialogueMatch = uiContent.match(/"comercial-junior":\s*\[([\s\S]*?)\]/);
    expect(dialogueMatch).toBeTruthy();
    expect(dialogueMatch![1].split(",").length).toBeGreaterThanOrEqual(3);
  });
});

// ─── VIS5: Counter uses agents.length (not hardcoded) ───────────────────

describe("VIS5: Counter shows dynamic total", () => {
  const uiContent = readFile("src/components/AgentOfficeMap.tsx");

  it("uses agents.length for total count (not hardcoded number)", () => {
    expect(uiContent).toContain("{agents.length} total");
  });

  it("does not hardcode '9 total' or '10 total'", () => {
    expect(uiContent).not.toContain("9 total");
    expect(uiContent).not.toContain("10 total");
  });
});

// ─── VIS6: Every backend agent has visual representation ────────────────

describe("VIS6: Backend ↔ visual parity", () => {
  const backendContent = readFile("src/lib/office/state-builder.ts");
  const uiContent = readFile("src/components/AgentOfficeMap.tsx");

  it("AGENT_LAYER_MAP and INITIAL_AGENTS have the same agent IDs", () => {
    // Extract IDs from backend
    const backendIds = [...backendContent.matchAll(/"([a-z][\w-]*)"\s*:/g)]
      .map(m => m[1])
      .filter(id => EXPECTED_10_AGENTS.includes(id));

    // Extract IDs from INITIAL_AGENTS
    const match = uiContent.match(/const INITIAL_AGENTS[\s\S]*?^];/m);
    expect(match).toBeTruthy();
    const uiIds = [...match![0].matchAll(/id:\s*"([^"]+)"/g)].map(m => m[1]);

    // Both should have all 10
    for (const id of EXPECTED_10_AGENTS) {
      expect(backendIds).toContain(id);
      expect(uiIds).toContain(id);
    }
  });

  it("swarm.ts SWARM_AGENTS has all 10", () => {
    const swarmContent = readFile("src/lib/agent/swarm.ts");
    for (const id of EXPECTED_10_AGENTS) {
      expect(swarmContent).toContain(`id: "${id}"`);
    }
  });
});

// ─── VIS7: No legacy/orphan agents ──────────────────────────────────────

describe("VIS7: No legacy agents in visual layer", () => {
  const uiContent = readFile("src/components/AgentOfficeMap.tsx");

  const LEGACY_NAMES = [
    "soporte-tecnico",
    "legal-compliance",
    "financiero",
    "operaciones-interno",
    "datos-analytics",
    "comunicacion-marketing",
    "infraestructura-seguridad",
    "marketing-director",
    "web-master",
    "crm-director",
  ];

  for (const legacy of LEGACY_NAMES) {
    it(`does not contain legacy agent "${legacy}"`, () => {
      const match = uiContent.match(/const INITIAL_AGENTS[\s\S]*?^];/m);
      expect(match).toBeTruthy();
      expect(match![0]).not.toContain(`"${legacy}"`);
    });
  }
});
