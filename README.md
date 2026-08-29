# arXiv Literature Curator

这是一个给 **Codex 使用的论文收集 skill**，不是一个要求用户手动操作命令行的工具。

用户只需要用自然语言告诉 Codex：研究方向是什么、想收集哪类论文、哪些论文批准入库。Codex 负责调用本仓库里的脚本完成 arXiv 检索、去重、报告生成、审批后导入 Zotero 和分类。

当前默认研究方向是 **AI for HPC / CUDA 算子优化**，重点覆盖 GPU kernel、CUDA、Triton、TVM、MLIR、auto-tuning、GEMM、Tensor Core、LLM for Systems 等方向。

## 用户怎么使用

用户不需要记命令。典型对话是：

```text
帮我收集最近两周 AI for HPC / CUDA 算子相关论文。
```

Codex 会搜索 arXiv、去重 Zotero，并生成一份中英双语筛选报告。

```text
导入 2, 6, 2608.17379
```

Codex 会把用户批准的论文写入选择文件，先 dry-run 检查分类，再导入 Zotero、抓取 PDF，并报告结果。

```text
这次结果太泛了，把 LLM serving 降权，CUDA kernel 和 Triton 权重提高。
```

Codex 会调整 `config/research_profile.json`，说明新的检索词和路由规则，然后重新跑筛选流程。

## Codex 会做什么

- 根据 `config/research_profile.json` 检索 arXiv。
- 用 `output/state.json` 记录已报告论文，减少重复打扰。
- 查询 Zotero，过滤已经入库的论文。
- 生成 `output/report.md` 和 `output/report_site/index.html`。
- 为候选论文补中文标题和 1-3 句中文摘要，写入 `output/translations.json`。
- 等待用户审批，绝不自动全量入库。
- 把用户批准的编号或 arXiv ID 转成 `output/selected.json`。
- 先 dry-run 预览 Zotero collection 路由。
- 正式导入 Zotero，抓取 PDF，并写入 `output/import_results.json`。

## 人机边界

用户负责：

- 给出研究方向。
- 判断哪些论文值得入库。
- 在结果不理想时反馈“太宽”“太窄”“偏离主题”等偏好。

Codex 负责：

- 修改研究画像和分类规则。
- 执行检索、去重、翻译、报告、导入。
- 发现流程 bug 时修复脚本。
- 报告导入数量、失败项、PDF 状态和 Zotero 落点。

## 内部执行流程

下面是给 Codex/agent 的执行顺序，不是要求用户手动运行。

1. 检查 Zotero Bridge。

```bash
zotero-cli app plugin-status
```

只有 `ready: true` 时才允许正式导入。

2. 搜索 arXiv。

```bash
node scripts/search_arxiv.mjs --days=14 --max=180
```

3. Zotero 去重。

```bash
node scripts/check_zotero_duplicates.mjs --input=output/papers.json
```

4. 生成 Markdown 报告。

```bash
node scripts/generate_report.mjs --input=output/deduped.json
```

5. Codex 生成中文翻译。

```text
output/translations.json
```

6. 生成离线报告页面。

```bash
node scripts/build_report_site.mjs
```

7. 用户审批后，Codex 生成选择文件。

```bash
node scripts/select_papers.mjs --select=<用户给出的编号或 arXiv ID>
```

编号必须以 `output/report.md` 的排序为准。

8. 预览导入。

```bash
node scripts/import_papers.mjs --input=output/selected.json --dry-run
```

9. 正式导入。

```bash
node scripts/import_papers.mjs --input=output/selected.json
```

## 配置入口

主要配置文件是：

```text
config/research_profile.json
```

Codex 修改配置时，需要向用户说明有效变化，尤其是：

- `keyword_groups`: arXiv 检索词组。
- `required_keywords`: 候选论文必须命中的词。
- `categories`: arXiv 分类白名单。
- `min_display_score`: 报告展示门槛。
- `zotero_collections`: Zotero 分类层级和关键词路由。

## 默认 Zotero 分类

当前配置优先接入已有 Zotero 树：

```text
HPC
└── AI for HPC
    ├── Benchmark
    ├── Agent
    ├── RL
    ├── Triton
    ├── 编译器
    ├── Cute
    │   └── 基础资料
    ├── 专门算子优化
    │   ├── GEMM
    │   ├── Attention
    │   └── Tensor Op
    ├── 综述
    └── 科学计算算子学习
```

如果 collection 不存在，且配置允许，Codex 可以让导入脚本自动创建。

## 仓库结构

```text
SKILL.md                              # Codex skill 入口说明
config/research_profile.json          # 研究画像和 Zotero 路由
scripts/search_arxiv.mjs              # arXiv 检索
scripts/check_zotero_duplicates.mjs   # Zotero 去重
scripts/generate_report.mjs           # Markdown 审批报告
scripts/build_report_site.mjs         # 离线 HTML 审批报告
scripts/select_papers.mjs             # 用户审批结果转 selected.json
scripts/import_papers.mjs             # Zotero 导入、分类、抓 PDF
```

运行产物默认写入 `output/`，不提交到 Git。

## 已知缺陷

- arXiv API 对过长布尔查询容易超时，需要 Codex 控制查询复杂度。
- 当前是关键词和规则筛选，不是语义检索，可能混入低相关论文。
- 中文摘要由 Codex 生成，没有独立事实核查或翻译质量评估。
- Zotero CLI 对 arXiv ID/DOI 搜索不稳定，脚本已加入标题精确匹配兜底，但仍不是完美去重。
- 分类路由依赖标题和摘要关键词，交叉主题可能被分到不够理想的 collection。
- 当前只支持 arXiv，不覆盖 ACM、IEEE、USENIX、SC、PPoPP、ASPLOS、OSDI 等来源。
- 当前没有常驻调度器；周期运行需要接入 Codex automation、cron 或其他任务系统。
- 它只解决“论文入口”，还没有覆盖精读笔记、Idea 库、复现库和开题管理。

## 这个 skill 在博士工作站里的位置

它是博士工作站的第一块积木：**信息入口**。

建议先把论文收集和审批入库跑稳定，再逐步连接：

- Zotero 精读状态管理
- Obsidian 论文笔记
- Idea 库
- 复现实验库
- 开题方向和行动中心
