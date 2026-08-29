import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function usage() {
  console.error(JSON.stringify({
    ok: false,
    error: "Usage: node scripts/select_papers.mjs --select=1,3,2608.12345 [--input=output/deduped.json] [--output=output/selected.json]"
  }));
  process.exit(1);
}

function normalizeId(value) {
  const text = String(value || "").trim();
  const match = text.match(/(\d{4}\.\d{4,5})(?:v\d+)?/);
  return match ? match[1] : text;
}

function loadPapers(inputPath) {
  if (!existsSync(inputPath)) {
    console.error(JSON.stringify({ ok: false, error: `input file not found: ${inputPath}` }));
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(inputPath, "utf8"));
  return data.new_papers || data.papers || [];
}

function loadConfig() {
  const path = resolve(ROOT, "config", "research_profile.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function relevanceScore(paper) {
  return (Number(paper.keywords_matched) || 0) * 2 + (Array.isArray(paper.required_hits) ? paper.required_hits.length : 0) * 5;
}

function reportOrderedPapers(papers, config) {
  const minScore = Number(config.min_display_score) || 0;
  return papers
    .filter(p => relevanceScore(p) >= minScore)
    .sort((a, b) => relevanceScore(b) - relevanceScore(a));
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) usage();

  const selectArg = args.find(arg => arg.startsWith("--select="))?.split("=").slice(1).join("=");
  const inputPath = resolve(ROOT, args.find(arg => arg.startsWith("--input="))?.split("=").slice(1).join("=") || "output/deduped.json");
  const outputPath = resolve(ROOT, args.find(arg => arg.startsWith("--output="))?.split("=").slice(1).join("=") || "output/selected.json");
  if (!selectArg) usage();

  const config = loadConfig();
  const papers = reportOrderedPapers(loadPapers(inputPath), config);
  const selections = selectArg.split(",").map(s => s.trim()).filter(Boolean);
  const selected = [];
  const missing = [];

  for (const value of selections) {
    const index = Number.parseInt(value, 10);
    const paper = Number.isInteger(index) && String(index) === value
      ? papers[index - 1]
      : papers.find(p => normalizeId(p.arxiv_id) === normalizeId(value));

    if (paper) {
      if (!selected.some(p => normalizeId(p.arxiv_id) === normalizeId(paper.arxiv_id))) selected.push(paper);
    } else {
      missing.push(value);
    }
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  const payload = {
    selected_at: new Date().toISOString(),
    source: inputPath,
    numbering: "Matches output/report.md and output/report_site/index.html order",
    total: selected.length,
    selected_papers: selected
  };
  writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: missing.length === 0,
    selected: selected.length,
    missing,
    output: outputPath
  }));
}

main();
