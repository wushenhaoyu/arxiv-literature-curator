import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = resolve(__dirname, "..");

function relevanceScore(paper, keywords) {
  let score = 0;
  const text = `${paper.title} ${paper.abstract}`.toLowerCase();
  for (const kw of keywords) {
    const escaped = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const count = (text.match(new RegExp(escaped, "g")) || []).length;
    score += count;
  }
  for (const kw of keywords) {
    if (paper.title.toLowerCase().includes(kw.toLowerCase())) score += 3;
  }
  return score;
}

function main() {
  const args = process.argv.slice(2);
  const inputPath = args.find(a => a.startsWith("--input="))?.split("=")[1];
  const outputPath = args.find(a => a.startsWith("--output="))?.split("=")[1] || resolve(SKILL_ROOT, "output", "report.md");

  if (!inputPath || !existsSync(inputPath)) {
    console.error(JSON.stringify({ ok: false, error: "input file required" }));
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(inputPath, "utf8"));
  const configPath = resolve(SKILL_ROOT, "config", "research_profile.json");
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : { keywords: [] };
  const keywords = [...(config.keywords || []), ...(config.required_keywords || [])];

  const papers = data.new_papers || data.papers || [];
  papers.sort((a, b) => relevanceScore(b, keywords) - relevanceScore(a, keywords));

  let md = `# arXiv 文献日报\n\n`;
  md += `**检索时间**: ${data.queried_at}\n`;
  md += `**检索词**: \`${keywords.join("`, `")}\`\n`;
  md += `**新论文数**: ${papers.length}\n\n`;
  md += `| # | 英文标题 | 作者 | 日期 | arXiv ID | 相关度 |\n`;
  md += `|---|---------|-----|------|---------|------|\n`;

  for (let i = 0; i < papers.length; i++) {
    const p = papers[i];
    const authors = p.authors?.slice(0, 3).join(", ") + (p.authors?.length > 3 ? " et al." : "");
    md += `| ${i+1} | ${p.title} | ${authors} | ${p.published?.slice(0,10)} | ${p.arxiv_id} | ${relevanceScore(p, keywords)} |\n`;
  }

  md += `\n## 详情\n\n`;
  for (let i = 0; i < papers.length; i++) {
    const p = papers[i];
    md += `### ${i+1}. ${p.title}\n\n`;
    md += `**arXiv**: ${p.arxiv_id}\n`;
    md += `**PDF**: ${p.pdf_url}\n`;
    md += `**摘要**: ${p.abstract.slice(0, 500)}${p.abstract.length > 500 ? "..." : ""}\n`;
    md += `**类别**: ${p.categories?.join(", ") || ""}\n\n`;
    md += `---\n\n`;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, md, "utf8");
  console.log(JSON.stringify({ ok: true, total: papers.length, report: outputPath }));
}

main();
