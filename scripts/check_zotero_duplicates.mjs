import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, "..");

const ZOTERO_CLI = process.env.ZOTERO_CLI_PATH || "/Users/wusehn/.local/bin/zotero-cli";

function getExistingArxivIds() {
  try {
    const raw = execSync(`${ZOTERO_CLI} --json item find "arxiv" --limit 9999`, { encoding: "utf8", timeout: 30000 });
    const items = JSON.parse(raw);
    const ids = new Set();
    for (const item of Array.isArray(items) ? items : items?.items || items?.data || []) {
      const doi = item.DOI || item?.data?.DOI || "";
      const m = doi.match(/ARXIV\.(\d{4}\.\d{4,5})/i);
      if (m) ids.add(m[1]);
      const extra = String(item.extra || item?.data?.extra || "");
      const m2 = extra.match(/arXiv:\s*(\d{4}\.\d{4,5})/i);
      if (m2) ids.add(m2[1]);
    }
    return ids;
  } catch {
    return new Set();
  }
}

function normalizeTitle(title) {
  return String(title || "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findItems(query) {
  try {
    const raw = execSync(`${ZOTERO_CLI} --json item find ${JSON.stringify(query)} --limit 20`, { encoding: "utf8", timeout: 30000 });
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : parsed?.items || parsed?.data || [];
  } catch {
    return [];
  }
}

function itemField(item, name) {
  return item?.[name] || item?.data?.[name] || item?.fields?.[name] || "";
}

function hasMatchingZoteroItem(paper, existingIds) {
  if (existingIds.has(paper.arxiv_id)) return true;
  const title = normalizeTitle(paper.title);
  if (!title) return false;
  const candidates = findItems(paper.title);
  return candidates.some(item => {
    const doi = itemField(item, "DOI");
    const url = itemField(item, "url");
    const itemTitle = normalizeTitle(itemField(item, "title") || item.title);
    return doi.toLowerCase().includes(String(paper.arxiv_id).toLowerCase())
      || url.toLowerCase().includes(String(paper.arxiv_id).toLowerCase())
      || itemTitle === title;
  });
}

function main() {
  const args = process.argv.slice(2);
  const inputPath = args.find(a => a.startsWith("--input="))?.split("=")[1];
  const outputPath = args.find(a => a.startsWith("--output="))?.split("=")[1] || resolve(SKILL_ROOT, "output", "deduped.json");

  if (!inputPath || !existsSync(inputPath)) {
    console.error(JSON.stringify({ ok: false, error: "input file required" }));
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(inputPath, "utf8"));
  const existing = getExistingArxivIds();
  const duplicateFlags = new Map(data.papers.map(p => [p.arxiv_id, hasMatchingZoteroItem(p, existing)]));
  const newPapers = data.papers.filter(p => !duplicateFlags.get(p.arxiv_id));
  const duplicates = data.papers.filter(p => duplicateFlags.get(p.arxiv_id));

  const result = { ...data, deduped_at: new Date().toISOString(), total_original: data.papers.length, total_new: newPapers.length, total_duplicates: duplicates.length, new_papers: newPapers, duplicates };
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ok: true, total_new: newPapers.length, total_duplicates: duplicates.length, output: outputPath }));
}

main();
