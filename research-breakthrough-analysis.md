# Research Breakthrough Analysis: Whole-Model Kernelization Search

## Correction To The Previous Story

The previous "budgeted dynamic kernel orchestration" story overemphasized how tuning effort is allocated among candidates. That mechanism may still be useful, but it does not identify the most important unsolved problem.

After reading the closest 2026 systems, the central gap is the absence of scalable, explicit search over competing whole-model Kernelization plans on realistic models.

## Revised Thesis

> Existing free-form Agent systems optimize bounded fixed-shape modules, while realistic full-model systems obtain scalability by restricting the Agent to predefined regions, known patterns, or independent operators. We openly propose non-canonical whole-model fusion opportunities, but use progressive evidence gates and a diverse graph-state frontier to materialize only a small fraction with editable CUTLASS/CuTe/CUDA implementations.

The search state, transformations, evidence, candidate funnel, matched unfused/fused comparisons, and measured end-to-end objective must be auditable. Agent capability is an implementation component; the contribution is the combination of an open opportunity space with selective materialization.

## Decisive Experiment

Construct a small complete-model benchmark where near-exhaustive plan enumeration is feasible. Compare the proposed search with one-shot planning, MKEvolve-style split/fuse, fixed rules, hotspot-only optimization, random/beam search, and an exhaustive Korch-style oracle.

The paper thesis survives only if:

1. legal whole-model plans have materially different end-to-end performance;
2. the best plan is not reliably found by one-shot or simple split/fuse heuristics;
3. evidence-guided search approaches the oracle after materializing far fewer plans;
4. at least one non-canonical fusion excluded by fixed-pattern planning yields repeatable matched E2E gains;
5. the advantage persists when measuring complete models rather than isolated kernels.

## Scope Control

- Target one GPU architecture first: A800.
- Keep the core state to graph boundaries and implementation choices.
- Use custom CUDA/CUTLASS/CuTe where editable implementation matters, but retain strong libraries/compiler outputs as baselines or allowed candidates where scientifically necessary.
- Defer distributed execution, host scheduling, and serving runtime design unless they are required for honest end-to-end evaluation.
- Treat cost allocation and graph-constrained value-of-information as optional search policies, not the paper title.
- Start with an auditable diverse best-first beam search and progressive structural/compiler/resource gates; compare learned or MCTS policies only after this baseline works.
- Keep structural potential separate from realization maturity so a poor first implementation does not automatically kill a promising fusion boundary.

## Outcome

The idea remains worth testing, but only in this narrower form. The next milestone is not a full Agent platform; it is a falsification benchmark that proves a nontrivial whole-model graph-search problem actually exists.
