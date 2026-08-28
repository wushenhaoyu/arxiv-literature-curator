---
name: arxiv-literature-curator
description: >-
  Curate arXiv papers for research directions: search by keywords, filter by
  relevance, generate a screening report with Chinese translations, then
  import selected papers into Zotero with PDF attachments and automatic
  collection routing. Use when the user requests literature discovery, paper
  curation, arXiv search, or automated paper import to Zotero.
---

# arXiv Literature Curator

Turn a research profile into a Zotero library: search arXiv, deduplicate
against Zotero, present a bilingual screening report, and import only the
papers the user selects. The assistant performs the Chinese translation;
the scripts only do deterministic data work.

## Prerequisites

- Node.js 18+ and `curl` available.
- `zotero-cli` installed (via `cli-anything-zotero`) and reachable at
  `~/.local/bin/zotero-cli`; override with `ZOTERO_CLI_PATH`.
- Zotero Desktop running with the `cli-anything-zotero` JS Bridge plugin
  active. Verify with `zotero-cli app plugin-status` (want `ready: true`).
- Research profile at `config/research_profile.json`, with search keywords,
  arXiv categories, and Zotero collection routing.

## Configuration

`config/research_profile.json` controls the whole pipeline:

- `keyword_groups` / `required_keywords` / `categories` — arXiv search terms,
  word-boundary filters, and category whitelist.
- `days_back`, `max_results`, and `adaptive` — time window and backfill
  behavior.
- `state_path` — seen-state file that prevents re-reporting already covered
  papers.
- `min_display_score` — relevance cutoff for the offline report site
  (`score = keywords_matched * 2 + required_hits * 5`).
- `translations_path` — Chinese translation file written by the assistant
  (`output/translations.json` by default).
- `zotero_collections` — hierarchy, keyword-to-collection routing, and
  `create_missing_collections`.

## Workflow

### 1. Check Environment

Run `zotero-cli app plugin-status`. If the bridge is not ready, tell the user
to install/restart the plugin before continuing; do not run the production
import otherwise.

### 2. Search

```
node scripts/search_arxiv.mjs --days=14 --max=150
```

Output: `output/papers.json`. The query combines `keyword_groups` (AND within
a group, OR between groups), searches only titles and abstracts (`ti:`/`abs:`),
and only keeps results that match at least one `required_keywords` term with
word-boundary matching.

The search keeps a seen-state file at `config.research_profile.json` ->
`state_path` so already-reported papers are skipped on later runs. With
`adaptive.enabled`, it expands the date window up to `max_backfill_days` when
the initial window yields fewer than `min_unseen_papers`. Use `--no-adaptive`
to disable, and `--reset-state` to clear seen history.

### 3. Deduplicate

```
node scripts/check_zotero_duplicates.mjs --input=output/papers.json
```

Output: `output/deduped.json`, with `new_papers` and `duplicates`.

### 4. Report

```
node scripts/generate_report.mjs --input=output/deduped.json
```

Output: `output/report.md` (English metadata plus relevance ranking).

Then translate the papers yourself as the assistant: for every title write a
Chinese title, and for every abstract write a 1-3 sentence Chinese summary.
Save the result as `output/translations.json` in this exact shape:

```json
{
  "2608.27256": {
    "zh_title": "算子学习中强制 Dirichlet 边界条件",
    "zh_summary": "提出一种在训练前即满足边界条件的神经算子架构。"
  }
}
```

Do not require any external translation API.

### 5. Build Offline Report Site

```
node scripts/build_report_site.mjs
```

Output: `output/report_site/index.html`. The page shows only papers whose
relevance score is at least `config.research_profile.json` ->
`min_display_score` (default 10), displays Chinese titles/summaries from
`translations.json` when present, and falls back to English otherwise.

### 6. User Selection

The user picks paper numbers or arXiv IDs from the report. Only import what
they explicitly select. If they say "all", confirm the count before importing.

### 7. Import

From a selected JSON list (preferred, includes titles for routing):
```
node scripts/import_papers.mjs --input=output/selected.json
```

Or by explicit arXiv IDs (routing falls back to the default collection
because no metadata is available):
```
node scripts/import_papers.mjs --ids=2608.27256
```

Or force one collection:
```
node scripts/import_papers.mjs --input=output/selected.json --collection=综述
```

Safe preview first:
```
node scripts/import_papers.mjs --input=output/selected.json --dry-run
```

Import calls `zotero-cli add arxiv <id> --collection <key> --fetch-pdf`, which
creates a preprint item, attaches the PDF, and places it in the target
collection.

## Collection Routing

`config/research_profile.json` defines routing:

- `zotero_collections.collection_hierarchy` lists collection names and their
  parent relationships (for example `HPC > AI for HPC > 基础资料`).
- `zotero_collections.keyword_mapping` maps paper title/abstract keywords to a
  collection name. The first matching rule wins.
- `default_collection_name` is used when no rule matches.
- `create_missing_collections: true` tells the importer to create missing
  collections along the configured hierarchy instead of failing.

The importer resolves collections by name against the live Zotero tree, so it
works on a fresh library without hard-coded collection keys. Report any paper
that falls back to the default collection, and ask the user whether a more
specific collection is needed.

## Verification

Before presenting the site, verify the page's paper count equals the number of
papers with `score >= min_display_score`, and that `translations.json` has a
`zh_title`/`zh_summary` entry for every paper shown (fallback to English is
allowed only when a paper cannot be translated).

After import, check `output/import_results.json` for per-paper results, then
verify placement with:

```
zotero-cli --json collection items <collection-key>
```

Report total imported, failed, PDF status, and where each paper landed.

## Notes

- Never modify `config/research_profile.json` without telling the user the
  effective new keywords and routing.
- The scripts write only under this skill's `output/` and in Zotero, never
  elsewhere in the user's library.
- If the user asks for a different research direction, update keywords and
  routing first, then rerun the workflow.
