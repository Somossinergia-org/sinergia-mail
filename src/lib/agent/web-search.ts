/**
 * Web Search Tool for Sinergia AI Agents
 *
 * Gives agents the ability to search the internet for:
 * - Current regulations, legal updates (BOE, AEAT)
 * - Energy tariffs and market prices
 * - Company/client research
 * - Industry news and trends
 * - Technical documentation
 *
 * Uses Google Custom Search API (free tier: 100 queries/day)
 * Fallback: DuckDuckGo HTML scrape for unlimited basic searches
 */

import { logger, logError } from "@/lib/logger";

const log = logger.child({ component: "web-search" });

// ─── Types ──────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  date?: string;
}

export interface WebSearchResponse {
  query: string;
  results: SearchResult[];
  totalResults: number;
  source: "google" | "duckduckgo" | "cache";
  timestamp: number;
}

// ─── Search Cache (avoid duplicate queries) ─────────────────────────────

const searchCache = new Map<string, { data: WebSearchResponse; expires: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCached(query: string): WebSearchResponse | null {
  const key = query.toLowerCase().trim();
  const entry = searchCache.get(key);
  if (entry && entry.expires > Date.now()) {
    return { ...entry.data, source: "cache" };
  }
  if (entry) searchCache.delete(key);
  return null;
}

function setCache(query: string, data: WebSearchResponse): void {
  const key = query.toLowerCase().trim();
  searchCache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
  // Limit cache size
  if (searchCache.size > 200) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey) searchCache.delete(firstKey);
  }
}

// ─── Google Custom Search ───────────────────────────────────────────────

async function googleSearch(query: string, numResults: number = 5): Promise<SearchResult[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !cx) {
    log.warn("Google Custom Search not configured (GOOGLE_SEARCH_API_KEY / GOOGLE_SEARCH_CX)");
    return [];
  }

  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    num: String(Math.min(numResults, 10)),
    lr: "lang_es",
    gl: "es",
  });

  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  if (!res.ok) {
    log.warn({ status: res.status }, "Google Search API error");
    return [];
  }

  const data = await res.json();
  return (data.items || []).map((item: any) => ({
    title: item.title || "",
    url: item.link || "",
    snippet: item.snippet || "",
    source: new URL(item.link || "https://unknown").hostname,
    date: item.pagemap?.metatags?.[0]?.["article:published_time"] || undefined,
  }));
}

// ─── DuckDuckGo Instant Answer (fallback, no API key needed) ────────────

async function duckDuckGoSearch(query: string): Promise<SearchResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: "json",
      no_redirect: "1",
      no_html: "1",
      skip_disambig: "1",
    });

    const res = await fetch(`https://api.duckduckgo.com/?${params}`, {
      headers: { "User-Agent": "SinergiaMailBot/1.0" },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const results: SearchResult[] = [];

    // Abstract (main answer)
    if (data.Abstract) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL || "",
        snippet: data.Abstract,
        source: data.AbstractSource || "DuckDuckGo",
      });
    }

    // Related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.slice(0, 80),
            url: topic.FirstURL,
            snippet: topic.Text,
            source: new URL(topic.FirstURL).hostname,
          });
        }
      }
    }

    return results;
  } catch (err) {
    logError(log, err, {}, "DuckDuckGo search failed");
    return [];
  }
}

// ─── Specialized Search Functions ───────────────────────────────────────

/**
 * Search Spanish BOE (Boletín Oficial del Estado) for legal/regulatory info
 */
export async function searchBOE(query: string): Promise<SearchResult[]> {
  return webSearch(`site:boe.es ${query}`, 5);
}

/**
 * Search AEAT (Agencia Tributaria) for tax info
 */
export async function searchAEAT(query: string): Promise<SearchResult[]> {
  return webSearch(`site:agenciatributaria.es ${query}`, 5);
}

/**
 * Search for energy tariff information
 */
export async function searchEnergyTariffs(query: string): Promise<SearchResult[]> {
  return webSearch(`tarifas electricas españa ${query} 2025 2026`, 5);
}

/**
 * Research a company or contact
 */
export async function searchCompany(companyName: string): Promise<SearchResult[]> {
  return webSearch(`"${companyName}" empresa España`, 5);
}

/**
 * Search for industry news
 */
export async function searchIndustryNews(sector: string): Promise<SearchResult[]> {
  return webSearch(`noticias sector ${sector} España actualidad`, 5);
}

// ─── Main Web Search Function ───────────────────────────────────────────

/**
 * Universal web search with caching and fallback.
 * Returns up to `maxResults` results.
 */
export async function webSearch(
  query: string,
  maxResults: number = 5,
): Promise<SearchResult[]> {
  // Check cache first
  const cached = getCached(query);
  if (cached) {
    log.info({ query, source: "cache" }, "web search cache hit");
    return cached.results;
  }

  let results: SearchResult[] = [];
  let source: "google" | "duckduckgo" = "google";

  // Try Google first
  try {
    results = await googleSearch(query, maxResults);
  } catch (err) {
    logError(log, err, { query }, "Google search failed");
  }

  // Fallback to DuckDuckGo
  if (results.length === 0) {
    source = "duckduckgo";
    try {
      results = await duckDuckGoSearch(query);
    } catch (err) {
      logError(log, err, { query }, "DuckDuckGo also failed");
    }
  }

  const response: WebSearchResponse = {
    query,
    results: results.slice(0, maxResults),
    totalResults: results.length,
    source,
    timestamp: Date.now(),
  };

  // Cache results
  if (results.length > 0) {
    setCache(query, response);
  }

  log.info(
    { query, resultCount: results.length, source },
    "web search completed",
  );

  return response.results;
}

/**
 * Fetch and extract text content from a URL.
 * Used by agents to read web pages for deeper research.
 */
export async function fetchPageContent(url: string): Promise<{
  title: string;
  content: string;
  ok: boolean;
}> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "SinergiaMailBot/1.0 (business research)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { title: "", content: "", ok: false };
    }

    const html = await res.text();

    // Basic HTML to text extraction
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/&[^;]+;/g, " ").trim()
      : "";

    // Remove scripts, styles, tags
    const content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&[^;]+;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000); // Limit content size

    return { title, content, ok: true };
  } catch (err) {
    logError(log, err, { url }, "page fetch failed");
    return { title: "", content: "", ok: false };
  }
}
