import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(SKILL_ROOT, "config", "research_profile.json");
const PAPERS_PATH = resolve(SKILL_ROOT, "output", "papers.json");
const TRANSLATIONS_PATH = resolve(SKILL_ROOT, "output", "translations.json");

function esc(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

function main() {
  if (!existsSync(PAPERS_PATH)) {
    console.error(JSON.stringify({ ok: false, error: "output/papers.json not found; run search_arxiv.mjs first" }));
    process.exit(1);
  }
  const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, "utf8")) : {};
  const data = JSON.parse(readFileSync(PAPERS_PATH, "utf8"));
  const translations = existsSync(TRANSLATIONS_PATH) ? JSON.parse(readFileSync(TRANSLATIONS_PATH, "utf8")) : {};
  const minScore = Number(config.min_display_score) || 0;
  const score = p => (Number(p.keywords_matched) || 0) * 2 + (Array.isArray(p.required_hits) ? p.required_hits.length : 0) * 5;
  const papers = (data.papers || []).map(p => {
    const tr = translations[p.arxiv_id] || {};
    return { ...p, zh_title: tr.zh_title || "", zh_summary: tr.zh_summary || "" };
  }).filter(p => score(p) >= minScore);

  const categories = [...new Set(papers.flatMap(p => p.categories || []))].sort();
  const dates = papers.map(p => p.published).filter(Boolean).sort();
  const titleSub = config.keywords?.length ? config.keywords.join(", ") : "";

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>arXiv 文献速览 · AI for HPC</title>
<style>
  :root {
    --ink: #1d2733;
    --muted: #64748b;
    --line: #dbe3ea;
    --bg: #f4f7f9;
    --card: #ffffff;
    --teal: #0f766e;
    --teal-soft: #dcf5f1;
    --amber: #b45309;
    --amber-soft: #fef3c7;
    --radius: 8px;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    letter-spacing: 0;
  }
  header {
    background: #ffffff;
    border-bottom: 1px solid var(--line);
    padding: 28px 24px 20px;
  }
  .wrap { max-width: 1080px; margin: 0 auto; }
  header .kicker {
    color: var(--teal);
    font-size: 12px;
    font-weight: 650;
    text-transform: uppercase;
    margin: 0 0 6px;
  }
  h1 { font-size: 26px; line-height: 1.25; margin: 0 0 8px; letter-spacing: 0; }
  header p { color: var(--muted); margin: 0; max-width: 760px; }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-top: 18px;
  }
  .stat {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 12px 14px;
  }
  .stat b { display: block; font-size: 22px; }
  .stat span { font-size: 12px; color: var(--muted); }
  main { padding: 20px 24px 48px; }
  .controls {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    margin-bottom: 16px;
  }
  .controls input, .controls select {
    height: 40px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 0 12px;
    font: inherit;
    background: #fff;
    color: var(--ink);
  }
  .controls input { width: 100%; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .chip {
    border: 1px solid var(--line);
    background: #fff;
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 13px;
    cursor: pointer;
    color: var(--muted);
  }
  .chip.active { background: var(--teal); border-color: var(--teal); color: #fff; }
  #list { display: grid; gap: 12px; }
  .paper {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 16px 18px;
  }
  .paper h2 { font-size: 16px; line-height: 1.4; margin: 0 0 6px; letter-spacing: 0; }
  .paper .sub-title { font-size: 13px; color: var(--muted); margin: 0 0 8px; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px 16px; color: var(--muted); font-size: 13px; margin-bottom: 8px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .tag { font-size: 12px; border-radius: 4px; padding: 2px 8px; background: var(--teal-soft); color: var(--teal); }
  .score { font-weight: 650; color: var(--amber); }
  .abstract { color: #3b4756; margin: 0; }
  .abstract.closed { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .actions { margin-top: 10px; display: flex; gap: 10px; }
  .actions a { color: var(--teal); font-size: 13px; text-decoration: none; font-weight: 600; }
  .actions button {
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    padding: 0;
  }
  #empty { display: none; color: var(--muted); text-align: center; padding: 40px 0; }
  footer { color: var(--muted); font-size: 12px; padding: 18px 24px 32px; border-top: 1px solid var(--line); background: #fff; }
  @media (max-width: 640px) {
    header, main { padding-left: 16px; padding-right: 16px; }
    .controls { grid-template-columns: 1fr; }
    h1 { font-size: 22px; }
  }
</style>
</head>
<body>
<header>
  <div class="wrap">
    <p class="kicker">arXiv Literature Curator</p>
    <h1>arXiv 文献速览 · AI for HPC</h1>
    <p>检索时间 ${esc(data.queried_at || "-")} · 相关度门槛 ≥ ${minScore}${titleSub ? ` · 方向: ${esc(titleSub)}` : ""}</p>
    <div class="stats">
      <div class="stat"><b>${papers.length}</b><span>候选论文</span></div>
      <div class="stat"><b>${categories.length}</b><span>arXiv 分类</span></div>
      <div class="stat"><b>${dates.length ? dates[dates.length - 1].slice(0, 10) : "-"} 至 ${dates.length ? dates[0].slice(0, 10) : "-"}</b><span>时间范围</span></div>
      <div class="stat"><b>${data.adaptive_used ? "自适应" : "固定窗口"}</b><span>检索模式</span></div>
    </div>
  </div>
</header>
<main class="wrap">
  <div class="controls">
    <input id="q" type="search" placeholder="搜索标题、作者、论文编号或关键词...">
    <select id="sort">
      <option value="score">按相关度</option>
      <option value="date">按日期</option>
      <option value="alpha">按标题</option>
    </select>
  </div>
  <div class="chips" id="chips"></div>
  <div id="list"></div>
  <div id="empty">没有匹配的论文</div>
</main>
<footer class="wrap">
  离线报告 · 数据生成于 ${esc(data.queried_at || "-")} · 点击标题旁按钮可展开摘要
</footer>
<script>
const PAPERS = ${escJson(papers)};
const CATEGORIES = ${escJson(categories)};
let activeCat = null;
let query = "";
let sortMode = "score";

const score = p => (Number(p.keywords_matched) || 0) * 2 + (Array.isArray(p.required_hits) ? p.required_hits.length : 0) * 5;
const authors = p => (p.authors || []).slice(0, 3).join(", ") + ((p.authors || []).length > 3 ? " et al." : "");

function renderChips() {
  const box = document.getElementById("chips");
  box.innerHTML = "";
  box.appendChild(chip("全部", null));
  for (const c of CATEGORIES) box.appendChild(chip(c, c));
}

function chip(label, value) {
  const el = document.createElement("button");
  el.className = "chip" + (activeCat === value ? " active" : "");
  el.textContent = label;
  el.onclick = () => { activeCat = value; renderChips(); render(); };
  return el;
}

function filtered() {
  const q = query.trim().toLowerCase();
  return PAPERS.filter(p => {
    if (activeCat && !(p.categories || []).includes(activeCat)) return false;
    if (!q) return true;
    const hay = [p.title, p.abstract, (p.authors || []).join(" "), p.arxiv_id, p.doi].join(" ").toLowerCase();
    return q.split(/\\s+/).every(t => hay.includes(t));
  });
}

function render() {
  const list = document.getElementById("list");
  const empty = document.getElementById("empty");
  const items = filtered();
  if (!items.length) { list.innerHTML = ""; empty.style.display = "block"; return; }
  empty.style.display = "none";
  const sorted = [...items].sort((a, b) => {
    if (sortMode === "date") return String(b.published || "").localeCompare(String(a.published || ""));
    if (sortMode === "alpha") return String(a.title || "").localeCompare(String(b.title || ""));
    return score(b) - score(a);
  });
  list.innerHTML = sorted.map((p, i) => \`
    <article class="paper">
      <h2>\${escHtml(p.zh_title || p.title || "")}</h2>
      \${p.zh_title ? "<div class='" + "sub-title" + "'>" + escHtml(p.title || "") + "</div>" : ""}
      <div class="meta">
        <span>\${escHtml(authors(p))}</span>
        <span>\${escHtml((p.published || "").slice(0, 10))}</span>
        <span>arXiv \${escHtml(p.arxiv_id || "")}</span>
        \${p.doi ? "<span>DOI " + escHtml(p.doi) + "</span>" : ""}
        <span class="score">相关度 \${score(p)}</span>
      </div>
      <div class="tags">\${(p.categories || []).map(c => "<span class='tag'>" + escHtml(c) + "</span>").join("")}</div>
      <p class="abstract closed" data-full="\${escAttr(p.zh_summary || p.abstract || "")}"></p>
      <div class="actions">
        <a href="\${escAttr(p.abs_url || "")}" target="_blank" rel="noopener">arXiv 页面</a>
        \${p.pdf_url ? "<a href=\\"" + escAttr(p.pdf_url) + "\\" target=\\"_blank\\" rel=\\"noopener\\">PDF</a>" : ""}
        <button>展开摘要</button>
      </div>
    </article>\`);
  for (const el of document.querySelectorAll(".paper")) {
    const abs = el.querySelector(".abstract");
    abs.textContent = abs.dataset.full || "";
    el.querySelector("button").onclick = () => {
      abs.classList.toggle("closed");
      el.querySelector("button").textContent = abs.classList.contains("closed") ? "展开摘要" : "收起摘要";
    };
  }
}

function escHtml(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function escAttr(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

document.getElementById("q").addEventListener("input", e => { query = e.target.value; render(); });
document.getElementById("sort").addEventListener("change", e => { sortMode = e.target.value; render(); });
renderChips();
render();
</script>
</body>
</html>
`;

  const outDir = resolve(SKILL_ROOT, "output", "report_site");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "index.html");
  writeFileSync(outPath, html, "utf8");
  console.log(JSON.stringify({ ok: true, total: papers.length, output: outPath }));
}

main();
