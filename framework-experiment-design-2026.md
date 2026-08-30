# CudaOptiAgent Framework and Experiment Design

## 1. Research Goal

### Problem

For a complete model, the optimization space is not only the implementation of one operator. It includes:

```text
where to partition the graph
+ which producer/consumer or branch regions to fuse
+ which implementation maps each region
+ which plans are worth generating, compiling, verifying, and profiling
```

Existing systems tend to be conservative in one of two ways: they decompose difficult regions until they are easy to implement, or they only materialize known library-grounded patterns. The opportunity we want to study is a non-canonical fusion that is not in the usual registry but can improve the complete model after specialized realization.

### Target

> Openly propose unusual fusion opportunities in a complete-model graph, use progressive evidence to filter the combinatorial plan space, realize only a small number of promising plans with CUTLASS/CuTe/CUDA, and accept a plan only when matched before/after complete-model measurements demonstrate value.

The principle is:

> **Propose broadly, materialize selectively.**

## 2. System Boundary

The first version should optimize one model execution on one GPU architecture, initially A800. It should not simultaneously solve distributed scheduling, serving, multi-GPU placement, or runtime architecture search. Those can become later extensions after the graph-search claim is supported.

The system output is a deployable model wrapper containing:

```text
selected whole-model plan
+ custom kernel artifacts
+ library/compiler fallback implementations
+ correctness protocol and evidence
+ dispatch and shape guards
+ complete search provenance
```

## 3. Framework Architecture

```text
Workload Adapter
      |
      v
Canonical Graph + Hotspot Trace
      |
      v
Fusion Hypothesis Generator
      |
      v
Legal Graph-State Expander
      |
      v
Progressive Evidence Gates
      |
      v
Diverse Best-First Frontier
      |
      v
Selective CUTLASS/CuTe/CUDA Realization
      |
      v
Correctness + NCU/Nsys Evidence
      |
      v
Matched Whole-Model Evaluation
      |
      v
Accept / Continue / Reject + Search Memory
```

### 3.1 Workload Adapter

The adapter runs a real complete model with frozen input shapes and records:

- operator graph and tensor dependencies;
- input/output shapes, dtype, layout and aliasing;
- call count and runtime share;
- intermediate tensor size and lifetime;
- baseline complete-model latency;
- correctness reference outputs.

The trace is a source of evidence, not the search result. A complete model must remain executable after every selected plan is applied.

### 3.2 Canonical Graph

Normalize harmless algebraic details separately from research transformations:

```text
canonicalization: identity removal, safe folding, shape normalization
research action: split, fuse, remap, or replace a graph region
```

Each node and edge receives a stable identifier so that two plans can be hashed, deduplicated, and compared.

### 3.3 Fusion Hypothesis Generator

The generator should have both deterministic and Agent proposals.

Deterministic proposal families:

- adjacent producer-consumer chains;
- GEMM plus non-standard memory-intensive epilogues;
- layout/reshape/permute followed by a compute operator;
- local branch/join regions where intermediate writes may be removed;
- bounded k-hop expansions around a high-runtime node;
- split actions when resource pressure makes a region infeasible.

Agent proposals:

- inspect graph structure and trace evidence;
- explain why a region may benefit from fusion;
- propose a legal region and required interface contract;
- propose an implementation family and expected risk.

The Agent proposes hypotheses; it does not bypass legality or correctness checks.

### 3.4 Graph State

```json
{
  "plan_id": "model_hash_plan_hash",
  "parent_plan": "...",
  "partition": [["n1", "n2"], ["n3"], ["n4", "n5", "n6"]],
  "implementation": {
    "n1+n2": "cutlass_cute",
    "n3": "library_or_compiler",
    "n4+n5+n6": "custom_cuda"
  },
  "shape_contract": {},
  "legality": {},
  "structural_evidence": {},
  "realization_evidence": {},
  "decision": "frontier"
}
```

The state must distinguish:

```text
structural potential: why this graph transformation may help
realization maturity: how well the current implementation performs
```

A poor first implementation must not automatically kill a promising graph state.

### 3.5 Progressive Evidence Gates

Candidates should become more expensive only when they survive the previous gate:

```text
G0: semantic legality and dependency safety
G1: shape, layout, aliasing and dtype compatibility
G2: expected launch/traffic benefit and added-compute estimate
G3: register, shared-memory, occupancy and Tensor-Core feasibility
G4: CUTLASS/CuTe/CUDA realization feasibility
G5: compile and correctness
G6: local profile or NCU when informative
G7: complete-model matched before/after evaluation
```

The funnel must be logged:

```text
proposed -> legal -> selected -> compiled -> correct -> E2E-faster
```

The filter must not only accept known patterns. It should reserve an exploration quota for high-uncertainty, structurally novel candidates, otherwise it will reproduce FACT.

### 3.6 Search Frontier

The first search method should be a diverse best-first beam:

1. Start with no-fusion, strong-baseline, and a small set of high-confidence hypotheses.
2. Expand only frontier states that have legal, non-duplicate transformations.
3. Retain plans from different structural families instead of keeping only the highest score.
4. Materialize the top candidates after progressive gates.
5. Update the frontier with correctness, profiler, and complete-model results.
6. Stop when the best plan is stable or the planned search limit is reached.

An initial action score can be:

```text
Score(a) =
    P(legal | evidence)
  * P(realizable | evidence)
  * E[E2E improvement | evidence]
  / estimated materialization cost
  + uncertainty bonus
  + structural diversity bonus
```

This is intentionally simple and auditable. Learned ranking, MCTS, or value-of-information allocation can be added only after the baseline search is measurable.

### 3.7 Realization Backends

Use a tiered realization policy:

```text
Tier 0: library/compiler implementation for reference and fallback
Tier 1: CUTLASS template configuration
Tier 2: CuTe layout, collective, and pipeline customization
Tier 3: handwritten CUDA for cases outside the useful CUTLASS abstraction
```

CUTLASS is the main implementation substrate for GEMM-like and Tensor-Core-heavy fusion, not a universal representation of arbitrary computation graphs. A candidate that cannot be expressed safely should be rejected with a recorded reason.

### 3.8 Correctness and Profiling

Every realization must pass:

- multiple random inputs, not one input only;
- reference comparison with declared tolerance;
- shape and dtype guards;
- cold and warm execution protocol;
- anti-cache and input-dependency checks;
- compile and runtime failure capture.

NCU/Nsys should be used selectively after cheap gates. Profiling every rejected candidate would recreate the traversal problem.

### 3.9 Matched Decision Artifact

For each serious fusion hypothesis, construct:

```text
P0: strongly optimized unfused baseline
P1: partial fusion, when meaningful
P2: proposed non-canonical fusion
```

Keep fixed:

- model and input;
- dtype and tolerance;
- GPU and software environment;
- correctness protocol;
- timing protocol;
- available optimization effort for the comparison.

Record:

- local kernel latency;
- complete-model latency;
- launches and intermediate traffic;
- register/shared-memory/occupancy evidence;
- compilation, profiling, wall-clock and token cost;
- accept, continue, or reject decision.

## 4. Experiment Program

The experiments should prove four different claims independently. Do not use one large final speedup table to stand in for all of them.

### E0: Protocol and State Validity

Goal: prove that graph states and measurements are reproducible.

Procedure:

- run the same plan twice with independent processes;
- verify stable graph hash and implementation mapping;
- verify the same correctness and timing protocol;
- check that applying and reverting a plan preserves the reference model;
- test plan deduplication and fallback dispatch.

Evidence:

- state serialization examples;
- repeated latency variance;
- correct rollback after failed realization;
- no accidental change outside the target region.

### E1: Does The Opportunity Exist?

Goal: prove that unusual fusion can actually improve complete-model E2E latency.

Choose two or three small complete fixed-shape models, not isolated subgraphs. At least one should contain a branch/skip path and one should contain GEMM plus a memory-intensive or layout-sensitive epilogue.

For each model:

1. identify high-value regions from trace data;
2. generate standard and non-canonical fusion hypotheses;
3. construct P0, P1, and P2;
4. optimize all implementations under the same protocol;
5. measure full-model latency and hardware evidence.

Required result:

```text
at least one non-canonical P2
beats a strong matched P0/P1 on complete-model E2E
```

If only local kernels improve, the graph-level idea is not supported.

### E2: Does The Filter Preserve Good Plans?

Goal: prove that progressive filtering avoids work without discarding the best plans.

On the small complete models, construct a near-exhaustive candidate and plan set offline. This set is the evaluation oracle, not the production search procedure.

Compare:

- no filter;
- static legality only;
- static benefit filter;
- fixed-pattern filter;
- progressive evidence filter;
- progressive filter with uncertainty/diversity exploration.

Metrics:

- oracle-plan Recall@K before realization;
- false-prune rate;
- candidates proposed, legal, selected, compiled, correct and faster;
- compile/profile calls avoided;
- time and GPU cost avoided.

The filter succeeds only if it retains oracle-relevant plans while materially reducing realization work.

### E3: Does The Search Beat Simple Strategies?

Goal: prove that the search policy matters, not just the presence of a candidate generator.

Baselines:

1. one-shot planner in the style of StitchCUDA;
2. MKEvolve-style failure-triggered split and optional fuse;
3. FACT-style known-pattern planning;
4. independent hotspot optimization;
5. greedy highest-static-score search;
6. random search;
7. ordinary beam search without evidence/diversity;
8. proposed evidence-guided diverse beam;
9. exhaustive or near-exhaustive oracle.

Plot:

```text
best complete-model latency
versus
number of plans materialized
```

Also report:

- regret to oracle;
- time to reach 95% of oracle;
- graph-plan diversity;
- number of failed or duplicate transitions;
- compile/profile/GPU/token costs.

The proposed method should reach near-oracle performance with substantially fewer realized plans and should beat one-shot and split/fuse baselines.

### E4: Can We Separate Plan Quality From Implementation Quality?

Goal: test the key confound in MKEvolve and FACT.

For the same partition/fusion boundary, use multiple realizers:

```text
strong library/compiler reference
CUTLASS configuration
CuTe customization
handwritten CUDA where justified
early Agent implementation
later optimized Agent implementation
```

Construct a matrix:

```text
                    Implementation
                A          B          C
Plan P0       latency    latency    latency
Plan P1       latency    latency    latency
Plan P2       latency    latency    latency
```

Analyze whether plan ranking changes as realization quality improves. This shows why a failed first implementation should not immediately eliminate a graph hypothesis.

### E5: Real Complete-Model Scaling

Goal: prove that the method remains useful outside the small oracle setting.

After E1-E4 pass, move to A800 and use:

- one CNN/vision model with residual or multi-branch structure;
- one decoder-style model or MLP/attention model;
- held-out shapes after fixed-shape development.

Compare against:

- PyTorch eager;
- torch.compile/Inductor;
- TensorRT where applicable;
- vLLM or another serving baseline for decoder workloads;
- one-shot, split/fuse, fixed-pattern and hotspot-only methods.

Separate attribution for:

```text
graph-plan search
kernel implementation quality
CUDA Graph/runtime engineering
framework overhead
```

The main result must remain complete-model E2E latency, not a collection of isolated Kernel wins.

### E6: Architecture Transfer, Later

Only after the A800 loop is supported, use other available GPUs to test:

- zero-shot plan ranking transfer;
- few-profile calibration;
- plan ranking changes caused by hardware;
- additional search cost versus full re-search.

This is a later validation, not part of the first claim.

## 5. Core Tables And Figures

The paper should contain:

1. System diagram showing proposal, filtering, realization, and E2E decision.
2. Example of a non-canonical fusion and its P0/P1/P2 matched comparison.
3. Candidate funnel from proposal to E2E-faster.
4. Latency versus materialized-plan curves.
5. Oracle regret and Recall@K.
6. Plan ranking versus implementation maturity.
7. Full-model speedup and attribution table.
8. Failure taxonomy: illegal, compile failure, incorrect, resource overflow, slower, and E2E-neutral.

## 6. Go / No-Go Criteria

Proceed to a large Agent system only if:

- non-canonical fusion produces repeatable complete-model E2E wins;
- fixed-pattern planning misses at least some useful opportunities;
- the filter retains good plans with a measurable reduction in materialization;
- diverse search beats one-shot and MKEvolve-style heuristics;
- local and complete-model results are not systematically contradictory;
- strong library/compiler baselines are fairly included.

Stop or narrow the claim if:

- fixed rules cover nearly all winning plans;
- one-shot planning finds the same plans reliably;
- all unusual fusions fail or are E2E-neutral;
- filtering either loses the oracle or approaches exhaustive cost;
- custom implementations only win against weak baselines;
- gains come mainly from runtime changes rather than Kernelization.

## 7. Implementation Milestones

### M0: Stable Graph And Baseline

- canonical graph extraction;
- stable node/edge IDs;
- complete-model reference execution;
- strong unfused baseline;
- serialization and hashing.

### M1: Plan And Evidence Artifacts

- `PlanState` schema;
- `FusionHypothesis` schema;
- correctness and profiler evidence records;
- P0/P1/P2 decision artifact;
- rollback and fallback.

### M2: Small-Model Oracle

- two or three small complete models;
- bounded legal transformations;
- near-exhaustive plan set;
- reproducible complete-model measurement.

### M3: Realization And Filter

- CUTLASS first;
- CuTe/custom CUDA fallback for selected cases;
- progressive gates;
- candidate funnel and false-prune logging.

### M4: Search Controller

- diverse best-first beam;
- structural-family diversity;
- uncertainty exploration quota;
- random, greedy and ordinary beam baselines.

### M5: A800 Scaling

- real CNN and decoder-style model;
- held-out shapes;
- strong compiler/library/serving baselines;
- attribution and reproducibility package.

## 8. Final Positioning

The project is an engineering system with a focused search contribution:

> We build a complete-model Kernelization system that openly proposes non-canonical fusion opportunities, filters the combinatorial plan space with progressive evidence, selectively realizes promising candidates with editable GPU kernels, and makes fusion decisions using matched complete-model measurements.

The method does not need an elaborate optimizer at the beginning. Its scientific value comes from showing that:

```text
unusual opportunities exist
+ exhaustive realization is too expensive
+ simple conservative agents miss some opportunities
+ evidence-guided search finds them efficiently
+ the gains survive complete-model evaluation
```
