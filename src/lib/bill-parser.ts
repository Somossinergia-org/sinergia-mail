/**
 * Parser de facturas eléctricas españolas — portado desde CRM Energía
 * Soporta: Endesa, Iberdrola, Naturgy, Repsol, EDP, Holaluz, Factor Energía,
 * Aldro, TotalEnergies, Som Energía, Lucera, Podo, Octopus, Fenie, Nabalia,
 * CUR Energía, Energya, Nexus, Eléctrica de Cádiz, Axpo, Audax y más.
 *
 * Flujo: PDF → texto → regex (21 comercializadoras) → confianza
 *        Si confianza < 75% → fallback Gemini Vision AI
 */

export interface ParsedBill {
  comercializadora: string | null;
  cups: string | null;
  tarifa: string | null;
  periodoFacturacion: { desde: string | null; hasta: string | null; dias: number | null };
  potencias: number[];
  consumos: number[];
  preciosEnergia: number[];
  importePotencia: number | null;
  importeEnergia: number | null;
  importeTotal: number | null;
  tieneReactiva: boolean;
  importeReactiva: number | null;
  cosPhi: number | null;
  energiaReactiva: number | null;
  impuestoElectrico: number | null;
  iva: number | null;
  alquilerContador: number | null;
  modalidad: string | null;
  confianza: number;
  camposExtraidos: string[];
  advertencias: string[];
  textoExtraido?: string;
}

export function parseBillText(text: string): ParsedBill {
  const result: ParsedBill = {
    comercializadora: null, cups: null, tarifa: null,
    periodoFacturacion: { desde: null, hasta: null, dias: null },
    potencias: [], consumos: [], preciosEnergia: [],
    importePotencia: null, importeEnergia: null, importeTotal: null,
    tieneReactiva: false, importeReactiva: null, cosPhi: null, energiaReactiva: null,
    impuestoElectrico: null, iva: null, alquilerContador: null, modalidad: null,
    confianza: 0, camposExtraidos: [], advertencias: [],
  };

  const t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const tLower = t.toLowerCase();

  // ═══ COMERCIALIZADORA ═══
  const comercializadoras: [RegExp, string][] = [
    [/endesa\s*energ[ií]a/i, "Endesa Energia"],
    [/iberdrola\s*(clientes|generaci[oó]n)/i, "Iberdrola"],
    [/naturgy\s*(clientes|iberia|energ[ií]a)/i, "Naturgy"],
    [/repsol\s*(electricidad|energ[ií]a|luz)/i, "Repsol"],
    [/edp\s*(energ[ií]a|comercializadora)/i, "EDP"],
    [/holaluz/i, "Holaluz"],
    [/factor\s*energ[ií]a/i, "Factor Energia"],
    [/aldro\s*energ[ií]a/i, "Aldro Energia"],
    [/total\s*energ[ií]es/i, "TotalEnergies"],
    [/som\s*energia/i, "Som Energia"],
    [/lucera/i, "Lucera"],
    [/podo/i, "Podo"],
    [/octopus/i, "Octopus Energy"],
    [/fenie\s*energ[ií]a/i, "Fenie Energia"],
    [/nabalia/i, "Nabalia Energia"],
    [/curenergia/i, "CUR Energia"],
    [/energya/i, "Energya"],
    [/nexus\s*energ[ií]a/i, "Nexus Energia"],
    [/el[ée]ctrica\s*de\s*c[aá]diz/i, "Electrica de Cadiz"],
    [/axpo/i, "Axpo"],
    [/audax/i, "Audax Energia"],
  ];
  for (const [re, name] of comercializadoras) {
    if (re.test(t)) { result.comercializadora = name; result.camposExtraidos.push("comercializadora"); break; }
  }

  // ═══ CUPS ═══
  const cupsLabel = t.match(/CUPS[:\s]+(ES\d{16}[A-Z0-9]{2}(?:[A-Z0-9]{1,2})?)/i);
  if (cupsLabel) { result.cups = cupsLabel[1]; result.camposExtraidos.push("cups"); }
  else {
    const cupsFb = t.match(/ES\d{16}[A-Z0-9]{2,4}/);
    if (cupsFb) { result.cups = cupsFb[0]; result.camposExtraidos.push("cups"); }
  }

  // ═══ TARIFA ═══
  for (const p of [/tarifa[:\s]*(\d\.\d\s*TD)/i, /(2\.0\s*TD|3\.0\s*TD|6\.1\s*TD|6\.2\s*TD|6\.3\s*TD|6\.4\s*TD)/i]) {
    const m = t.match(p);
    if (m) { result.tarifa = m[1].replace(/\s/g, ""); result.camposExtraidos.push("tarifa"); break; }
  }

  // ═══ PERIODO FACTURACION ═══
  const periodoPatterns = [
    /del\s+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s+al?\s+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /per[ií]odo[\s\S]{0,30}?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s*(?:a|al?|-|hasta)\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /desde[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s*hasta[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s*[-–]\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
  ];
  for (const pattern of periodoPatterns) {
    const m = t.match(pattern);
    if (m) {
      result.periodoFacturacion.desde = m[1];
      result.periodoFacturacion.hasta = m[2];
      try {
        const parse = (s: string) => { const p = s.split(/[\/\-\.]/); let y = parseInt(p[2]); if (y < 100) y += 2000; return new Date(y, parseInt(p[1]) - 1, parseInt(p[0])); };
        const d1 = parse(m[1]), d2 = parse(m[2]);
        result.periodoFacturacion.dias = Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
      } catch { /* ignore */ }
      result.camposExtraidos.push("periodo");
      break;
    }
  }

  // ═══ POTENCIA CONTRATADA ═══
  const potenciasFound: number[] = [];
  const potTerminoIdx = Math.max(tLower.indexOf("término de potencia"), tLower.indexOf("termino de potencia"), tLower.indexOf("término potencia"), tLower.indexOf("termino potencia"));
  if (potTerminoIdx >= 0) {
    const sec = t.substring(potTerminoIdx, potTerminoIdx + 800);
    for (let p = 1; p <= 6; p++) {
      const m = sec.match(new RegExp(`P${p}[:\\s]+(\\d+[\\.,]\\d{1,3})\\s*kW`, "i"));
      if (m) potenciasFound.push(parseFloat(m[1].replace(",", ".")));
    }
  }
  if (potenciasFound.length === 0) {
    const pci = tLower.indexOf("potencia contratada");
    if (pci >= 0) {
      const sec = t.substring(Math.max(0, pci - 200), pci + 400);
      const kwLine = sec.match(/kW\s+([\d,.\s]+)/i);
      if (kwLine) { const nums = kwLine[1].match(/\d+[\.,]\d{1,3}/g); if (nums) for (const n of nums) { const v = parseFloat(n.replace(",", ".")); if (v > 0 && v < 10000) potenciasFound.push(v); } }
    }
  }
  if (potenciasFound.length > 0) { result.potencias = potenciasFound; result.camposExtraidos.push("potencias"); }

  // ═══ CONSUMOS ═══
  const consumosFound: number[] = [];
  const lecIdx = Math.max(tLower.indexOf("consumo a facturar"), tLower.indexOf("consumos facturados"), tLower.indexOf("lecturas y tus"));
  if (lecIdx >= 0) {
    const sec = t.substring(lecIdx, lecIdx + 800);
    const readPat = /(?:Punta|Llano|Valle|P[1-6])\s*(?:real|estimad[oa])?\s*([\d.]+)\s*kWh/gi;
    let rm;
    while ((rm = readPat.exec(sec)) !== null) {
      const raw = rm[1]; const di = raw.lastIndexOf(".");
      if (di >= 0 && di < raw.length - 3) { const v = parseInt(raw.substring(di + 4)); if (v > 0 && v < 100000) consumosFound.push(v); }
      else { const v = parseFloat(raw.replace(",", ".")); if (v > 0 && v < 100000) consumosFound.push(v); }
    }
    if (consumosFound.length > 1) { const total = consumosFound[consumosFound.length - 1]; const sum = consumosFound.slice(0, -1).reduce((a, b) => a + b, 0); if (Math.abs(total - sum) <= 1) consumosFound.pop(); }
  }
  if (consumosFound.length === 0) {
    const m = t.match(/Consumo\s+kWh\s+([\d,.\s]+)/i);
    if (m) { const nums = m[1].match(/\d+[\.,]\d{1,2}/g); if (nums) for (const n of nums) consumosFound.push(parseFloat(n.replace(".", "").replace(",", "."))); }
  }
  if (consumosFound.length > 0) { result.consumos = consumosFound; result.camposExtraidos.push("consumos"); }

  // ═══ PRECIOS ENERGIA ═══
  const detalleIdx = Math.max(tLower.indexOf("detalle"), tLower.indexOf("cálculo"), tLower.indexOf("calculo"));
  if (detalleIdx >= 0) {
    const sec = t.substring(detalleIdx, detalleIdx + 1000);
    const pp = /(\d+[\.,]\d{4,6})\s*(?:€|EUR)?\s*(?:\/\s*kWh|€\/kWh)/gi;
    let pm; while ((pm = pp.exec(sec)) !== null) { const v = parseFloat(pm[1].replace(",", ".")); if (v > 0.01 && v < 0.5) result.preciosEnergia.push(v); }
  }
  if (result.preciosEnergia.length > 0) result.camposExtraidos.push("precios");

  // ═══ IMPORTES ═══
  for (const p of [/total\s*(?:factura|importe)[:\s]*(\d+[\.,]\d{2})\s*(?:€|EUR)/i, /importe\s*total[:\s]*(\d+[\.,]\d{2})\s*(?:€|EUR)/i, /total\s*a\s*pagar[:\s]*(\d+[\.,]\d{2})/i, /(\d+[\.,]\d{2})\s*€\s*\n\s*Total\s*factura/i]) {
    const m = t.match(p);
    if (m) { result.importeTotal = parseFloat(m[1].replace(",", ".")); result.camposExtraidos.push("importeTotal"); break; }
  }

  // ═══ REACTIVA ═══
  if (/reactiva/i.test(t)) {
    result.tieneReactiva = true;
    const ri = t.match(/reactiva[\s\S]{0,200}?(\d+[\.,]\d{2})\s*(?:€|EUR)/i);
    if (ri) { result.importeReactiva = parseFloat(ri[1].replace(",", ".")); result.camposExtraidos.push("reactiva"); }
  }

  // ═══ IMPUESTOS ═══
  const iee = t.match(/impuesto\s*(?:sobre\s*)?(?:la\s*)?electricidad[\s\S]{0,80}?x\s*\d+[\.,]\d+\s*%\s*(\d+[\.,]\d{2})\s*(?:€|EUR)/i)
    || t.match(/(\d+[\.,]\d{2})\s*\n\s*[Ii]mpuestos?\s*el[ée]ctricos/);
  if (iee) { result.impuestoElectrico = parseFloat(iee[1].replace(",", ".")); result.camposExtraidos.push("impuestoElectrico"); }

  for (const p of [/IVA\s*\(?(?:\d+\s*%\)?)[\s\S]{0,80}?x\s*\d+\s*%\s*(\d+[\.,]\d{2})\s*(?:€|EUR)/i, /IVA\s*\d+\s*%\s+(\d+[\.,]\d{2})/i, /IVA[:\s]*(\d+[\.,]\d{2})\s*(?:€|EUR)/i]) {
    const m = t.match(p);
    if (m) { result.iva = parseFloat(m[1].replace(",", ".")); result.camposExtraidos.push("iva"); break; }
  }

  // ═══ ALQUILER CONTADOR ═══
  for (const p of [/(\d+[\.,]\d{2})\s*\n\s*[Aa]lquiler\s*(?:de\s*)?(?:equipo|contador)/, /[Aa]lquiler\s*(?:de\s*)?(?:equipo|contador)[\s\S]{0,100}?(\d+[\.,]\d{2})\s*(?:€|EUR)/i]) {
    const m = t.match(p);
    if (m) { result.alquilerContador = parseFloat(m[1].replace(",", ".")); result.camposExtraidos.push("alquilerContador"); break; }
  }

  // ═══ MODALIDAD ═══
  if (/indexad[oa]|pool|OMIE|pass[\s-]*(?:through|pool)/i.test(t)) { result.modalidad = "indexado"; result.camposExtraidos.push("modalidad"); }
  else if (/precio\s*fijo|tarifa\s*fija|fijo/i.test(t)) { result.modalidad = "fijo"; result.camposExtraidos.push("modalidad"); }

  // ═══ CONFIANZA ═══
  let pts = 0;
  for (const c of ["tarifa", "potencias", "consumos"]) { if (result.camposExtraidos.includes(c)) pts += 20; else result.advertencias.push(`No se pudo extraer: ${c}`); }
  for (const c of ["precios", "importeTotal", "cups", "periodo"]) { if (result.camposExtraidos.includes(c)) pts += 8; }
  for (const c of ["comercializadora", "modalidad", "reactiva", "impuestoElectrico", "iva", "alquilerContador"]) { if (result.camposExtraidos.includes(c)) pts += 2; }
  result.confianza = Math.min(pts, 100);

  // Inferir tarifa
  if (!result.tarifa && result.potencias.length > 0) {
    const max = Math.max(...result.potencias);
    result.tarifa = max <= 15 ? "2.0TD" : max <= 450 ? "3.0TD" : "6.1TD";
    result.advertencias.push(`Tarifa inferida por potencia: ${result.tarifa}`);
    result.camposExtraidos.push("tarifa");
  }

  return result;
}

/**
 * Gemini AI fallback para facturas con baja confianza de regex
 */
export async function parseBillWithAI(text: string): Promise<Partial<ParsedBill> & { confianza: number }> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY || "";
  if (!apiKey) return { confianza: 0, advertencias: ["No hay API key de Gemini configurada"] } as any;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `Eres un experto en facturas eléctricas españolas. Extrae estos campos del texto:
- comercializadora, cups, tarifa (2.0TD/3.0TD/6.1TD)
- periodo (desde, hasta, dias)
- potencias (array kW), consumos (array kWh)
- importePotencia, importeEnergia, importeTotal
- impuestoElectrico, iva, alquilerContador
- modalidad (fijo/indexado)
Devuelve SOLO un JSON válido. Si no encuentras un campo, pon null.

TEXTO DE LA FACTURA:
${text.substring(0, 4000)}`;

  const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 600, temperature: 0.1 } });
  const raw = result.response.text();
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      return { ...parsed, confianza: 70 };
    } catch { /* ignore */ }
  }
  return { confianza: 0, advertencias: ["Gemini no pudo parsear la factura"] } as any;
}
