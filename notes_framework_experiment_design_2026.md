# Notes: Whole-Model Kernelization Framework Design

## Research Target

The system should discover and validate non-canonical fusion opportunities in complete-model graphs while avoiding exhaustive materialization. A candidate is not accepted because a local kernel is fast; it is accepted only when a matched complete-model comparison shows value.

## Two Coupled Requirements

1. Opportunity expansion: propose graph regions outside a fixed pattern registry.
2. Search control: use progressive evidence and a diverse frontier to avoid compiling every graph plan.

Only the combination is distinctive. Expansion alone is brute force; filtering alone becomes a conservative FACT-style registry.

## Critical Confound

The same fusion boundary can look bad because its first CUTLASS/CuTe/CUDA implementation is poor. The state must therefore record structural potential separately from realization maturity, and the experiment must compare fixed partitions across multiple realizers.

## Framework Shape

```text
workload adapter
-> canonical graph and hotspot trace
-> broad fusion hypothesis generator
-> legal graph-state expansion
-> progressive evidence filter
-> diverse best-first frontier
-> selective CUTLASS/CuTe/CUDA realization
-> correctness and profiler evidence
-> matched whole-model measurement
-> accept, continue, reject, and update search knowledge
```

## Proof Structure

- E0: graph/state/measurement protocol is reproducible.
- E1: non-canonical fusion opportunities exist and can win E2E.
- E2: cheap filtering retains oracle-relevant plans and avoids materialization.
- E3: the proposed search beats one-shot, split/fuse, fixed-pattern, random and simple beam baselines at equal materialization cost.
- E4: realization quality and partition quality are separable.
- E5: the same interface scales to real A800 models and held-out shapes.

## Go / No-Go

Go forward only if a non-canonical fusion wins matched complete-model E2E, the oracle-relevant candidate survives filtering, and the search reaches that plan with materially fewer realized plans than exhaustive evaluation. Otherwise narrow the claim or change the problem.
