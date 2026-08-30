# Task Plan: 2026 Agentic Graph-Level Kernel Systems Review

## Goal
Deep-read the closest 2026 systems and reassess whether the current whole-model, non-exhaustive graph-kernel search problem is novel and defensible.

## Phases
- [x] Phase 1: Identify the closest 2026 papers and obtain full PDFs
- [x] Phase 2: Deep-read MKEvolve, FACT, AgentCompile, Kernel Forge, and StitchCUDA
- [x] Phase 3: Compare problem definitions, graph-search authority, implementation spaces, and experiments
- [x] Phase 4: Rewrite the project starting point and define a falsification experiment
- [x] Phase 5: Update Obsidian notes, local idea, and shared server docs

## Key Questions
1. Which systems actually change graph decomposition or fusion boundaries, rather than only optimize predetermined kernels?
2. Which systems evaluate complete models and measure true end-to-end behavior?
3. Is non-exhaustive whole-model graph-kernel search already solved by MKEvolve, FACT, or AgentCompile?
4. What problem remains when the implementation space contains editable custom CUDA/CUTLASS/CuTe kernels?
5. What experiment can invalidate the revised starting point quickly?

## Decisions Made
- Prioritize 2026 work for novelty; use Korch (2024) mainly for historical context and experimental methodology.
- Do not preserve the current idea by default; revise or reject it based on full-paper evidence.
- Treat KernelBench Level 3 blocks separately from complete-model inference and serving.

## Errors Encountered
- Earlier screening missed MKEvolve, AgentCompile, and Kernel Forge despite their presence in the candidate set; corrected by direct graph-level searches and Zotero import.
- Korch had a local PDF and Obsidian note but no Zotero item; corrected on 2026-08-30.
- System `pdftotext` is unavailable; use the bundled workspace PDF/Python runtime for full-text extraction.
- A combined `apply_patch` attempted to delete and re-add the FACT note in one patch and was rejected; split note creation and replacement into separate patches.
- A combined `apply_patch` attempted to replace the 2026 review files and update old-note headings in one patch; it was rejected because the expected old heading differed. The additions and compatibility banners were split into separate patches.

## Status
**Complete** - five 2026 papers were deep-read, the starting point was revised, and local/Obsidian/shared-server documents were synchronized and verified.
