import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, "..");
const ZOTERO_CLI = process.env.ZOTERO_CLI_PATH || "/Users/wusehn/.local/bin/zotero-cli";

function loadConfig() {
  const path = resolve(SKILL_ROOT, "config", "research_profile.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function runJson(cmd) {
  const raw = execSync(cmd, { encoding: "utf8", timeout: 120000 });
  return JSON.parse(raw);
}

function flattenTree(nodes, parent = null) {
  return (nodes || []).flatMap(n => [
    { ...n, parentKey: parent?.key || null, parentName: parent?.collectionName || null },
    ...flattenTree(n.children || [], n)
  ]);
}

function chooseCandidate(tree, path, index) {
  const name = path[index];
  const all = flattenTree(tree).filter(n => n.collectionName === name);
  if (all.length === 0) return null;
  if (all.length === 1) return all[0];
  const nextName = path[index + 1];
  if (nextName) {
    const withNext = all.find(n => flattenTree(n.children || []).some(c => c.collectionName === nextName));
    if (withNext) return withNext;
  }
  return all[0];
}

function hierarchyPath(config, name) {
  // Return a top-down path like ["HPC", "AI for HPC", "Cute", "基础资料"]
  const hierarchy = config.zotero_collections?.collection_hierarchy || [];
  const find = (n) => hierarchy.find(h => h.name === n);
  const node = find(name);
  if (!node) return name === "基础资料" ? ["HPC", "AI for HPC", "Cute", "基础资料"] : null;
  const path = [];
  let cursor = node;
  while (cursor) {
    path.unshift(cursor.name);
    cursor = cursor.parent ? find(cursor.parent) : null;
  }
  return path;
}

function ensureCollection(tree, config, path, dryRun, createdLog, resolvedKeys) {
  let current = null;
  for (let i = 0; i < path.length; i++) {
    const name = path[i];
    const existing = chooseCandidate(tree, path, i);
    if (existing && (!current || existing.parentKey === current.key)) {
      current = existing;
      continue;
    }
    if (!config.zotero_collections?.create_missing_collections) {
      return { key: null, missing: name };
    }
    if (dryRun) {
      current = { key: `__would_create__${name}`, collectionName: name };
      createdLog.push(`would create ${name}`);
      continue;
    }
    const parentArg = current?.key ? ` --parent ${JSON.stringify(current.key)}` : "";
    const result = runJson(`${ZOTERO_CLI} --json collection create ${JSON.stringify(name)}${parentArg}`);
    current = { key: result.key, collectionName: name };
    createdLog.push(`created ${name} (${result.key})`);
  }
  return { key: current?.key || null, missing: null };
}

function resolveCollection(tree, config, name, dryRun, createdLog) {
  const path = hierarchyPath(config, name);
  if (!path) return { key: null, missing: "no_hierarchy" };
  return ensureCollection(tree, config, path, dryRun, createdLog);
}

function routePaper(paper, config, forcedCollection) {
  if (forcedCollection) return forcedCollection;
  const text = `${paper.title || ""} ${paper.abstract || ""}`.toLowerCase();
  const mapping = config.zotero_collections?.keyword_mapping || [];
  for (const m of mapping) {
    if (m.keywords.some(k => keywordHits(text, k))) {
      return m.collection_name;
    }
  }
  return config.zotero_collections?.default_collection_name || "基础资料";
}

function keywordHits(text, keyword) {
  const kw = String(keyword).toLowerCase().trim();
  if (!kw) return false;
  if (/\s/.test(kw)) return text.includes(kw);
  const words = new Set(text.split(/[^a-z0-9]+/).filter(Boolean));
  return words.has(kw);
}

function main() {
  const args = process.argv.slice(2);
  const inputPath = args.find(a => a.startsWith("--input="))?.split("=")[1];
  const idsArg = args.find(a => a.startsWith("--ids="))?.split("=")[1];
  const forcedCollection = args.find(a => a.startsWith("--collection="))?.split("=")[1] || "";
  const dryRun = args.includes("--dry-run");

  if (!inputPath && !idsArg) {
    console.error(JSON.stringify({ ok: false, error: "provide --input= or --ids=" }));
    process.exit(1);
  }

  const config = loadConfig();
  const papers = [];
  if (idsArg) {
    for (const id of idsArg.split(",").map(s => s.trim()).filter(Boolean)) {
      papers.push({ arxiv_id: id });
    }
  } else if (inputPath && existsSync(inputPath)) {
    const data = JSON.parse(readFileSync(inputPath, "utf8"));
    papers.push(...(data.new_papers || data.papers || data.selected_papers || []));
  }

  const tree = runJson(`${ZOTERO_CLI} --json collection tree`);
  const createdLog = [];
  const results = [];

  for (const paper of papers) {
    const id = paper.arxiv_id;
    if (!id) continue;
    const targetName = routePaper(paper, config, forcedCollection);
    const resolved = resolveCollection(tree, config, targetName, dryRun, createdLog);
    if (resolved.missing) {
      results.push({ arxiv_id: id, ok: false, error: `missing_collection: ${targetName} (${resolved.missing})` });
      continue;
    }
    if (dryRun) {
      results.push({ arxiv_id: id, ok: true, dryRun: true, collection: targetName, collectionKey: resolved.key });
      continue;
    }
    try {
      const result = runJson(
        `${ZOTERO_CLI} --json add arxiv ${id} --collection ${JSON.stringify(resolved.key)} --fetch-pdf`
      );
      results.push({ arxiv_id: id, ok: result.ok, key: result.key, pdf: result.pdf?.code || "miss", collection: targetName });
    } catch (err) {
      results.push({ arxiv_id: id, ok: false, error: (err?.message || "").slice(0, 200), collection: targetName });
    }
  }

  const success = results.filter(r => r.ok).length;
  const fail = results.length - success;
  const summary = { imported_at: new Date().toISOString(), dry_run: dryRun, total: results.length, success, fail, created_collections: createdLog, results };
  writeFileSync(resolve(SKILL_ROOT, "output", "import_results.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ok: success > 0 || dryRun, total: results.length, success, fail, created_collections: createdLog }));
}

main();
