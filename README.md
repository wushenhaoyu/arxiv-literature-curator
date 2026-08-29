# arXiv Literature Curator

一个面向博士/科研工作站的 arXiv 论文收集小流水线：自动检索论文、按研究画像筛选、生成中英双语审批报告，然后只把人工批准的论文导入 Zotero 并自动分类、抓取 PDF。

当前默认配置面向 **AI for HPC / CUDA 算子优化**，适合跟踪 GPU kernel、CUDA、Triton、TVM、MLIR、auto-tuning、GEMM、Tensor Core、LLM for Systems 等方向。

## 能做什么

- 从 arXiv 按关键词组合和分类检索最新论文。
- 用本地 seen-state 避免重复报告已经看过的论文。
- 通过 Zotero CLI 检查已入库论文，减少重复导入。
- 生成 Markdown 报告和离线 HTML 报告，便于人工审批。
- 支持中文标题和中文摘要，由 agent 写入 `output/translations.json`。
- 根据标题/摘要关键词，把批准的论文自动路由到 Zotero collection。
- 调用 Zotero 导入 arXiv 条目并抓取 PDF。

## 工作流

```text
配置研究画像
  -> 搜索 arXiv
  -> Zotero 去重
  -> 生成审批报告
  -> 人工选择论文编号或 arXiv ID
  -> dry-run 检查分类
  -> 正式导入 Zotero
```

人工审批是唯一必须人工参与的步骤。其他步骤都可以由 agent 执行。

## 环境要求

- Node.js 18+
- `curl`
- Zotero Desktop
- `zotero-cli`
- Zotero 中的 CLI Bridge plugin 已启用

默认脚本会使用：

```bash
/Users/wusehn/.local/bin/zotero-cli
```

如果你的路径不同，可以设置：

```bash
export ZOTERO_CLI_PATH=/path/to/zotero-cli
```

检查 Zotero Bridge：

```bash
zotero-cli app plugin-status
```

需要看到 `ready: true` 才能正式导入。

## 快速开始

1. 编辑研究画像：

```bash
vim config/research_profile.json
```

重点字段：

- `keyword_groups`: arXiv 检索组合，组内 AND，组间 OR。
- `required_keywords`: 标题或摘要中至少要命中的系统相关词。
- `categories`: arXiv 分类白名单。
- `min_display_score`: 报告展示门槛。
- `zotero_collections`: Zotero collection 层级和关键词路由。

2. 搜索 arXiv：

```bash
node scripts/search_arxiv.mjs --days=14 --max=180
```

3. Zotero 去重：

```bash
node scripts/check_zotero_duplicates.mjs --input=output/papers.json
```

4. 生成 Markdown 报告：

```bash
node scripts/generate_report.mjs --input=output/deduped.json
```

5. 写入中文翻译：

让 agent 根据报告里的论文，为展示论文写中文标题和 1-3 句中文摘要，保存到：

```text
output/translations.json
```

格式：

```json
{
  "2608.20725": {
    "zh_title": "面向 GPU CUDA 与 Tensor Cores 的内存高效 Im2win 卷积",
    "zh_summary": "论文把 im2win 卷积方法扩展到 CUDA cores 全精度和 Tensor Cores 半精度场景。"
  }
}
```

6. 生成离线报告站点：

```bash
node scripts/build_report_site.mjs
```

打开：

```text
output/report_site/index.html
```

7. 选择要导入的论文：

编号以 `output/report.md` 的排序为准。

```bash
node scripts/select_papers.mjs --select=2,6,2608.17379
```

8. 预览 Zotero 分类：

```bash
node scripts/import_papers.mjs --input=output/selected.json --dry-run
```

9. 正式导入：

```bash
node scripts/import_papers.mjs --input=output/selected.json
```

导入结果写入：

```text
output/import_results.json
```

## 默认 AI for HPC 分类

当前配置会优先接入已有 Zotero 树：

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

如果某个 collection 不存在，且 `create_missing_collections` 为 `true`，导入脚本会自动创建。

## 重要文件

```text
config/research_profile.json           # 研究画像和 Zotero 分类配置
scripts/search_arxiv.mjs               # arXiv 检索
scripts/check_zotero_duplicates.mjs    # Zotero 去重
scripts/generate_report.mjs            # Markdown 报告
scripts/build_report_site.mjs          # 离线 HTML 报告
scripts/select_papers.mjs              # 人工审批后的选择文件生成
scripts/import_papers.mjs              # Zotero 导入和分类
```

## 已知缺陷

- arXiv API 对很长的布尔查询可能响应慢或超时；需要控制 `keyword_groups` 的长度。
- 关键词筛选不是语义检索，仍可能混入只含有 `GPU`、`LLM` 等泛词的低相关论文。
- 中文翻译目前由 agent 生成，不调用外部翻译 API，也没有独立质量评估。
- Zotero CLI 的 `item find` 对 arXiv ID/DOI 搜索不稳定，所以去重脚本加入了标题精确匹配兜底，但仍不是严格数据库级去重。
- collection 路由基于标题和摘要关键词，复杂交叉主题可能被路由到不够精确的集合。
- 当前只支持 arXiv，不支持 ACM、IEEE、USENIX、SC、PPoPP、ASPLOS、OSDI 等出版源。
- 当前没有 Web 后端和常驻调度器；自动化可以通过 cron、Codex automation 或外部任务系统补上。

## 适合的使用方式

这个项目适合作为博士工作站的第一块积木：先把论文入口做稳定，再逐步扩展到精读笔记、Idea 库、复现库、开题方向管理和实验报告。

推荐节奏：

- 每天或每周自动跑一次检索。
- 只审批真正值得入库的论文。
- 入库后再进入 Zotero/Obsidian 的精读和知识组织流程。
- 定期根据误报和漏报调整 `research_profile.json`。
