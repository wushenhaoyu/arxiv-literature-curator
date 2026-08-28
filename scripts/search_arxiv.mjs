import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(SKILL_ROOT, "config", "research_profile.json");

const DEFAULTS = {
  keywords: [],
  keyword_groups: [],
  required_keywords: [],
  max_results: 100,
  days_back: 14,
  state_path: "output/state.json",
  adaptive: { enabled: true, min_unseen_papers: 20, max_scan_results: 400, initial_days_back: 14, max_backfill_days: 60 },
  categories: ["cs.AI", "cs.LG", "cs.DC", "cs.PF", "cs.SE"],
  zotero_collections: {}
};

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return DEFAULTS;
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    return {
      ...DEFAULTS,
      ...raw,
      adaptive: { ...DEFAULTS.adaptive, ...(raw.adaptive || {}) }
    };
  } catch {
    return DEFAULTS;
  }
}

function buildQuery(config) {
  const groups = config.keyword_groups?.length
    ? config.keyword_groups
    : config.keywords.map(k => [k]);
  const groupParts = groups.map(g => {
    const terms = g.map(k => `(ti:"${k.replace(/"/g, "\\\"")}" OR abs:"${k.replace(/"/g, "\\\"")}")`);
    return `(${terms.join("+AND+")})`;
  });
  const query = groupParts.join("+OR+");
  const cats = config.categories.map(c => `cat:${c}`).join("+OR+");
  return `(${query})+AND+(${cats})`;
}

function extract(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : "";
}

function fetchXml(url) {
  return execFileSync("curl", ["-s", "--max-time", "40", url], { encoding: "utf8", timeout: 45000 });
}

function normalizeId(value) {
  const text = String(value || "").trim();
  const m = text.match(/(\d{4}\.\d{4,5})(?:v\d+)?|[a-z-]+\/\d{7}(?:v\d+)?/i);
  return m ? m[0].replace(/v\d+$/i, "").toLowerCase() : text.toLowerCase();
}

function paperKey(paper) {
  const id = normalizeId(paper.arxiv_id || paper.id || paper.url || paper.pdf_url || "");
  if (id) return id;
  return `title:${String(paper.title || "").toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function loadState(statePath) {
  if (!existsSync(statePath)) return { seen: {} };
  try {
    const data = JSON.parse(readFileSync(statePath, "utf8"));
    return { seen: data.seen || {}, ...(data.updated_at ? { updated_at: data.updated_at } : {}) };
  } catch {
    return { seen: {} };
  }
}

function pruneState(state, keepDays) {
  const cutoff = Date.now() - keepDays * 86400000;
  const seen = {};
  for (const [key, info] of Object.entries(state.seen || {})) {
    const ts = info?.seen_at ? Date.parse(info.seen_at) : null;
    if (!ts || ts >= cutoff) seen[key] = info;
  }
  return { ...state, seen };
}

function saveState(statePath, state) {
  mkdirSync(dirname(resolve(SKILL_ROOT, statePath)), { recursive: true });
  const payload = { ...state, updated_at: new Date().toISOString() };
  writeFileSync(resolve(SKILL_ROOT, statePath), JSON.stringify(payload, null, 2), "utf8");
}

function parseEntries(xml) {
  return xml.split("<entry>").slice(1).map(entry => {
    const id = extract(entry, "id");
    const arxivId = id ? normalizeId(id) : "";
    const links = [...entry.matchAll(/<link[^>]*>/g)].map(m => m[0]);
    const pdfEntry = links.find(l => /title="pdf"/.test(l)) || links.find(l => /type="application\/pdf"/.test(l)) || "";
    const pdfLink = pdfEntry.match(/href="([^"]+)"/)?.[1] || "";
    const authors = [];
    const aRe = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
    let m;
    while ((m = aRe.exec(entry)) !== null) authors.push(m[1].trim());
    const categories = [];
    const cRe = /<category[^>]*?term="([^"]+)"/g;
    while ((m = cRe.exec(entry)) !== null) categories.push(m[1]);
    return {
      arxiv_id: arxivId,
      title: extract(entry, "title").replace(/\s+/g, " ").trim(),
      abstract: extract(entry, "summary").replace(/\s+/g, " ").trim(),
      authors,
      published: extract(entry, "published"),
      updated: extract(entry, "updated"),
      pdf_url: pdfLink,
      abs_url: id,
      categories,
      doi: (entry.match(/<arxiv:doi[^>]*>([^<]+)</) ? [entry.match(/<arxiv:doi[^>]*>([^<]+)/)[1].trim()] : [])[0] || ""
    };
  }).filter(p => p.arxiv_id);
}

function tokenMatch(text, token) {
  const t = String(token).toLowerCase().trim();
  if (!t) return false;
  if (/\s/.test(t)) return text.includes(t);
  return new Set(text.split(/[^a-z0-9]+/).filter(Boolean)).has(t);
}

function fetchCandidates(config, maxResults) {
  const query = buildQuery(config);
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;
  const xml = fetchXml(url);
  const entries = parseEntries(xml);
  const required = (config.required_keywords || []).map(k => String(k).toLowerCase());
  return entries.map(p => {
    const text = `${p.title} ${p.abstract}`.toLowerCase();
    const requiredHits = required.filter(k => tokenMatch(text, k));
    return { ...p, required_hits: requiredHits, keywords_matched: config.keywords.filter(k => text.includes(String(k).toLowerCase())).length };
  }).filter(p => required.length === 0 || p.required_hits.length > 0);
}

function search(config, options) {
  const adaptive = options.adaptive && config.adaptive.enabled;
  const maxResults = Math.min(1000, Math.max(config.max_results, config.adaptive.max_scan_results, config.adaptive.min_unseen_papers * 5));
  const candidates = fetchCandidates(config, maxResults);
  const state = loadState(resolve(SKILL_ROOT, config.state_path));
  const seen = new Set(Object.keys(state.seen || {}));
  const inRun = new Set();

  let startedDays = options.days;
  if (adaptive) {
    startedDays = config.adaptive.initial_days_back;
  }
  let days = startedDays;
  const maxDays = adaptive ? config.adaptive.max_backfill_days : startedDays;
  const targetUnseen = adaptive ? config.adaptive.min_unseen_papers : Infinity;
  const cutoff = Date.now() - days * 86400000;

  const seenSkipped = [];
  const newPapers = [];
  let scanned = 0;
  for (const p of candidates) {
    if (new Date(p.published).getTime() < cutoff) continue;
    scanned++;
    const key = paperKey(p);
    if (seen.has(key) || inRun.has(key)) {
      if (seen.has(key)) seenSkipped.push(p);
      continue;
    }
    inRun.add(key);
    newPapers.push(p);
  }

  let finalDays = days;
  if (adaptive && newPapers.length < targetUnseen && maxDays > days) {
    const remaining = candidates.filter(p => p.required_hits.length > 0 && !seen.has(paperKey(p)) && !inRun.has(paperKey(p)));
    if (remaining.length > 0) {
      for (const p of remaining) {
        if (newPapers.length >= targetUnseen) break;
        const key = paperKey(p);
        inRun.add(key);
        newPapers.push(p);
      }
      finalDays = maxDays;
    }
  }

  const now = new Date().toISOString();
  const seenUpdates = {};
  for (const p of newPapers) {
    const key = paperKey(p);
    seenUpdates[key] = { seen_at: now, title: p.title, url: p.abs_url || p.pdf_url || "", arxiv_id: p.arxiv_id };
  }
  const merged = { ...state.seen, ...seenUpdates };
  saveState(resolve(SKILL_ROOT, config.state_path), pruneState({ ...state, seen: merged }, 180));

  return {
    query: buildQuery(config),
    candidates_scanned: scanned,
    total_new: newPapers.length,
    seen_skipped: seenSkipped.length,
    days_used: finalDays,
    adaptive_used: adaptive,
    papers: newPapers
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: node search_arxiv.mjs [--days=N] [--max=N] [--output=PATH] [--no-adaptive] [--reset-state]");
    process.exit(0);
  }
  const config = loadConfig();
  const options = {
    days: parseInt(args.find(a => a.startsWith("--days="))?.split("=")[1] || String(config.days_back)),
    max: parseInt(args.find(a => a.startsWith("--max="))?.split("=")[1] || String(config.max_results)),
    output: args.find(a => a.startsWith("--output="))?.split("=")[1],
    adaptive: !args.includes("--no-adaptive")
  };
  if (args.includes("--reset-state")) {
    const statePath = resolve(SKILL_ROOT, config.state_path);
    if (existsSync(statePath)) writeFileSync(statePath, JSON.stringify({ seen: {} }, null, 2));
  }
  const result = search(config, options);
  const outputPath = options.output || resolve(SKILL_ROOT, "output", "papers.json");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify({
    queried_at: new Date().toISOString(),
    query: result.query,
    total: result.total_new,
    candidates_scanned: result.candidates_scanned,
    seen_skipped: result.seen_skipped,
    days_used: result.days_used,
    adaptive_used: result.adaptive_used,
    papers: result.papers
  }, null, 2));
  console.log(JSON.stringify({ ok: true, total: result.total_new, candidates_scanned: result.candidates_scanned, seen_skipped: result.seen_skipped, days_used: result.days_used, adaptive: result.adaptive_used, output: outputPath }));
}

main();
