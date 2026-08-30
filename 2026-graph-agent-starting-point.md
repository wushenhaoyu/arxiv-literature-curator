# 2026 Graph-Agent Starting Point Reassessment

## Verdict

The previous broad starting point does not survive the 2026 literature.

- MKEvolve already co-evolves module decomposition and generated Triton subkernels.
- StitchCUDA already uses Planner/Coder/Verifier Agents to optimize end-to-end GPU programs.
- FACT already performs Agent-guided graph-pattern recognition and CUTLASS composition.
- AgentCompile already inserts LLM-generated CUDA into realistic complete-model inference and serving.
- Kernel Forge already traces complete models and optimizes captured CUDA operator variants.

Therefore, "use an Agent to split/fuse a graph and generate CUDA" is not a defensible contribution.

## Remaining Gap

The 2026 evidence reveals a sharper gap:

> Free-form Agent graph/program optimization has been demonstrated on bounded fixed-shape modules, while realistic complete-model systems remain constrained to predefined regions, known patterns, or independent operators. Scalable open-ended search over competing whole-model Kernelization plans has not been demonstrated by the reviewed systems.

This gap is narrower than our original idea, but it is technically meaningful and testable.

## New Starting Point

### Evidence-Guided Whole-Model Kernelization Search

Given a real complete-model graph, search explicitly over alternative legal states containing:

```text
graph partition and fusion boundaries
+ implementation choice for each region
+ editable custom CUDA/CUTLASS/CuTe kernels
+ legality and correctness evidence
```

The goal has two coupled parts: openly propose non-canonical fusion opportunities beyond fixed pattern registries, then materialize only a small fraction of the combinatorial plan space. Search decisions should use graph structure, compiler/profiler evidence, implementation feasibility, correctness outcomes, and true end-to-end measurements.

The operating principle is **propose broadly, materialize selectively**. Open proposal without filtering becomes brute-force enumeration; aggressive filtering without exploration collapses back to FACT-style known-pattern matching.

Budget is not the problem statement. It is one way to quantify search efficiency through plans materialized, compilations, profiles, wall-clock time, GPU time, and tokens.

## What Makes It Different

| Existing approach | Missing capability targeted here |
|---|---|
| StitchCUDA one-shot plan and sequential repair | comparison among competing whole-program plans |
| MKEvolve fail-to-split/all-correct-to-fuse | systematic graph-state exploration and search-efficiency evaluation |
| FACT known-rule registry | open-ended admission of graph regions and custom implementations |
| AgentCompile predefined regions/families | alternative whole-model boundary decisions |
| Kernel Forge independent operators | cross-operator fusion and whole-model objective |
| Korch exhaustive enumeration + BLP | non-exhaustive evidence-guided exploration |

## Minimum Scientific Claim

Do not claim the first Agent, first fusion system, or first end-to-end CUDA generator. A supportable claim would be:

> We formulate Agentic GPU optimization as evidence-guided search over explicit whole-model Kernelization states. The system proposes non-canonical fusion opportunities beyond fixed pattern registries, selectively materializes promising plans with editable CUTLASS/CuTe/CUDA kernels, and reaches near-oracle complete-model performance with substantially fewer realized plans than exhaustive orchestration.

The phrase "near-oracle" is allowed only on small complete models where the oracle is actually measured.

## Falsification Experiment

Use two or three small complete models whose legal plan spaces can be enumerated offline.

Baselines:

1. one-shot planner;
2. MKEvolve-style split/fuse;
3. fixed-pattern planner;
4. independent hotspot optimizer;
5. random and beam graph search;
6. exhaustive/Korch-style oracle.

Primary plots:

- complete-model latency versus plans materialized;
- regret versus exhaustive oracle;
- Recall@K of oracle-relevant plans before materialization;
- proposed-to-legal-to-compiled-to-correct-to-faster candidate funnel;
- best plan identity and structural diversity;
- generated, compiled, and profiled kernels;
- correctness across inputs/shapes;
- local-kernel gains versus actual complete-model gains.

Go forward only if the proposed search finds a near-oracle plan with clearly fewer materialized states, beats one-shot/MKEvolve heuristics, and discovers at least one repeatable E2E-winning fusion that a fixed-pattern planner would not propose. Then scale the same state/search interface to real A800 models and compare against eager, torch.compile/Inductor, TensorRT, and realistic serving baselines where applicable.

## Major Risks

1. The useful plan space may be almost fully described by fixed compiler rules.
2. Strong libraries may dominate custom kernels for common GEMM/attention regions.
3. One-shot planning may already be good enough, eliminating the need for search.
4. Agent proposals may not be diverse or legal enough to outperform a compiler transformation set.
5. Full-model gains may be dominated by runtime engineering rather than Kernelization.
6. An overly conservative filter may reproduce FACT, while an overly permissive filter may approach exhaustive materialization.

These risks are why the small-model oracle experiment comes before a large Agent infrastructure build.

## Role Of Older Work

Korch (2024) is not the novelty anchor. It is the historical exhaustive graph-orchestration baseline and the template for complete-model experiments, candidate counts, tuning overhead, and global end-to-end evaluation.
