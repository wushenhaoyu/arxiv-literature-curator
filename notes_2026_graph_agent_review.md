# Notes: 2026 Agentic Graph-Level Kernel Systems

## Scope

Novelty is judged primarily against 2026 work. Korch (2024) remains important as a non-agentic full-graph baseline and as a source of experimental methodology.

KernelBench Level 3 modules are recorded separately from real complete-model inference and serving. A framework accepting a complete model is also not automatically a graph optimizer: the optimized region and the measured endpoint matter.

## Comparison

| Paper | Optimization unit | Graph-boundary authority | Implementation space | Evidence endpoint | Main limitation for our question |
|---|---|---|---|---|---|
| MKEvolve (2026) | PyTorch module decomposed into Triton subkernels | yes; fail-to-split and all-correct-to-fuse heuristics | generated Triton | 100 L2 + 50 L3 KernelBench modules; three FlashInfer tasks | one evolving decomposition, not an explicit search over competing whole-graph plans; no realistic serving |
| StitchCUDA (2026) | complete GPU program and planner task list | yes; planner can propose fusion and host/device tasks | generated CUDA host and device code | 20/20/10 held-out KernelBench L1/L2/L3 tasks on H200 and RTX PRO 6000 | one planner trajectory with sequential repair; no plan population, graph-search baseline, visited-state accounting, or real model serving |
| FACT (2026) | structurally matched graph patterns | yes, within recognized rules | CUTLASS examples and composed extensions | three L1 GEMMs and two L3 transformer blocks | pattern registry requires known rules/templates; de novo regions and scalable open-ended graph search are not evaluated |
| AgentCompile (2026) | compiler-defined regions plus five decode-critical families | mostly no; hard boundaries come from a rule-based analyzer | templates, generated CUDA, runtime components | six real model families on A800, including serving features | realistic scale is obtained by constraining the Agent to predefined regions/families; not open-ended graph-plan search |
| Kernel Forge (2026) | traced operator variants and shapes | no; each selected operator is optimized independently | generated raw CUDA | four complete model traces, but reported gains are operator-region measurements | complete-model input does not become graph optimization; dominant vendor-backed operators often regress |
| Korch (2024) | primitive subgraphs and global orchestration | yes; candidate subgraphs are enumerated and BLP selects a cover | compiler/library candidates | five complete DNNs on V100/A100 | non-agentic and enumerative; 1,031-11,400 candidates and 2.8-12.2 hours expose the search-space problem |

## Paper Findings

### MKEvolve

- The system alternates `LLMDecompose`, per-subkernel beam search, failure-triggered splitting, optional fusion, end-to-end evaluation, and PyTorch fallback.
- Main configuration uses five outer loops, topology updates every two loops, and 32 LLM calls per loop, roughly 160 generated kernels per task.
- It directly invalidates the broad claim that an Agent co-evolving decomposition and generated subkernels is new.
- Its topology search remains a shallow sequential heuristic. It does not maintain or compare multiple legal complete-graph states, report states visited, or quantify regret against a graph-plan oracle.

### StitchCUDA

- Planner uses Nsys evidence and can propose fusion boundaries, shape/layout contracts, and host/device tasks; Coder writes host and CUDA code; Verifier performs compilation, correctness, Nsys, and NCU checks.
- Rubric-based GRPO trains the Qwen3-32B Coder; the no-RL ablation is dramatically weaker, so trained coding capability is central to the result.
- It directly invalidates the broad claim that a Planner/Coder/Verifier optimizing an end-to-end GPU program is new.
- Evaluation is still bounded to ten held-out L3 tasks, and the method follows one task list with replanning rather than searching competing whole-program Kernelization plans.

### FACT

- The Agent traces the graph, matches known structural rules, retrieves examples indexed by rule/dtype/shape/architecture, generates and tunes CUTLASS extensions, and composes them.
- The dynamic registry accumulates implementations, but each pattern starts from a known rule and template. The authors explicitly leave de novo kernels far from the catalog unexplored.
- MiniGPT and Llama3 results are transformer blocks, not complete model serving.
- It invalidates novelty around Agent pattern recognition plus CUTLASS composition, but not open-ended graph-plan search.

### AgentCompile

- Tier 1 lets the compiler construct bounded candidate regions; the LLM labels, reorders, or proposes parameters. Tier 2 directly generates CUDA only for five recognized decode-critical families.
- It includes paged KV cache, continuous batching, preemption, chunked prefill, and bucketed full-step CUDA Graph execution.
- On six model families it reports 2.23-6.98x over eager and 1.07-1.16x over vLLM for single requests; multi-request gains are mostly 1.02-1.12x.
- Its strongest lesson is experimental: full-model claims need full-model timing, realistic serving baselines, and attribution separating generated kernels from runtime engineering.
- It does not explore alternative whole-model graph partitions. Scalability comes from fixed rules, contracts, and families.

### Kernel Forge

- It captures actual variants, shapes, layouts, call counts, and runtime share from unmodified PyTorch models, then applies local MCTS-style CUDA revision to selected operators.
- Reported values are operator-region measurements, not actual full-model latency.
- Dominant library-backed linear/attention operations frequently lose to the baseline. This is important negative evidence for a custom-kernel-only policy.
- It is a useful baseline for traced workload provenance and guarded fallback, not a graph-search competitor.

### Korch

- Korch performs operator fission, enumerates possible candidate kernels, profiles them, and solves a binary linear program for a globally legal orchestration.
- Its complete-DNN experiments provide the right endpoint and a possible oracle on small models.
- Its enumeration cost is precisely the historical failure mode our work should avoid, rather than a method assumption we should inherit.

## 2026 Frontier Split

The literature currently divides into two camps:

1. Free-form Agent graph/program optimization is demonstrated on bounded, fixed-shape KernelBench modules: MKEvolve and StitchCUDA.
2. Systems with realistic complete-model execution constrain decisions to predefined regions, known patterns, or independent operators: AgentCompile, FACT, and Kernel Forge.

Across these papers, there is no demonstrated system that performs scalable, open-ended, evidence-guided search over competing whole-model Kernelization plans on realistic complete models.

This is an inference from the reviewed designs and experiments, not a universal first-of-kind claim.

## Revised Problem

> Given a real complete-model computation graph, how can an Agent systematically explore competing Kernelization plans - graph partitions, fusion boundaries, and editable custom-kernel implementations - while materializing only a small fraction of the combinatorial plan space, and use measured end-to-end behavior to select the final executable?

The research object is the explicit whole-model graph state and its search trajectory. Budget is a measurement axis for search efficiency, not the motivation. The first paper should keep runtime scheduling, distributed execution, and host orchestration outside the core state unless experiments prove they are required.

## Required Distinction

The method must be more than:

- one-shot Planner/Coder/Verifier, as in StitchCUDA;
- one evolving split/fuse decomposition, as in MKEvolve;
- rule-matched pattern composition, as in FACT;
- compiler-defined region optimization, as in AgentCompile;
- independent hotspot replacement, as in Kernel Forge;
- exhaustive candidate enumeration followed by global selection, as in Korch.

It must expose multiple competing legal whole-model plans and decide which plans or transformations deserve materialization from structural evidence, profiler evidence, and end-to-end measurements.

## Falsification Criteria

Stop or substantially change the graph-search thesis if any of the following holds:

1. A one-shot planner or MKEvolve-style split/fuse heuristic reliably finds the same best plan.
2. Alternative legal decompositions do not produce material end-to-end latency differences.
3. Improvements exist only in isolated kernel timing and disappear in complete-model timing.
4. Custom CUDA/CUTLASS/CuTe implementations cannot compete with strong library/compiler baselines on the selected workloads.
5. The Agent cannot generate diverse, legal graph transformations beyond a hand-written rule list.

## Initial Experiment

1. Select two or three small but complete fixed-shape models where near-exhaustive plan enumeration remains feasible.
2. Define one graph-state representation containing partition/fusion boundaries, implementation choice, legality, and provenance.
3. Build the near-exhaustive set only for evaluation; record the best plan as a small-model oracle.
4. Compare one-shot planner, MKEvolve-style split/fuse, fixed-pattern planning, independent-hotspot optimization, random/beam graph search, and the proposed evidence-guided search.
5. Measure true complete-model latency, best latency versus plans materialized, regret versus oracle, generated/compiled/profiled kernels, correctness, and plan diversity.
6. Only after near-oracle search with materially fewer plans is observed, scale to real A800 models and add eager, torch.compile/Inductor, TensorRT, and serving baselines where applicable.

## Decision

The old "budgeted dynamic kernel orchestration" idea is not discarded, but it is demoted to an optional search-policy mechanism. It should not define the paper. The defensible starting point is **Evidence-Guided Whole-Model Kernelization Search**.
