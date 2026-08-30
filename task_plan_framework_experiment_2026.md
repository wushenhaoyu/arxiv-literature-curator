# Task Plan: Whole-Model Kernelization Framework and Experiments

## Goal

Design an implementable CudaOptiAgent framework and an experiment program that can prove or falsify open non-canonical fusion discovery with selective, non-exhaustive search.

## Phases

- [x] Phase 1: Freeze the research target and system boundary
- [x] Phase 2: Define framework components and persisted artifacts
- [x] Phase 3: Design the falsification and proof experiments
- [x] Phase 4: Define implementation milestones and go/no-go criteria
- [x] Phase 5: Produce and verify the design deliverable

## Key Questions

1. What exactly is searched: kernels, fusion hypotheses, or complete-model execution states?
2. How can candidates be broad enough to include unusual fusion without becoming exhaustive enumeration?
3. How do we separate a bad graph plan from a poor first implementation?
4. Which experiments independently prove opportunity, filtering quality, search efficiency, and E2E value?

## Decisions Made

- The primary object is a complete-model Kernelization state, not an isolated operator.
- The system principle is: propose broadly, materialize selectively.
- The first searcher is an auditable diverse best-first beam with progressive evidence gates; RL/MCTS are later comparisons.
- CUTLASS/CuTe/CUDA are realization backends; strong library/compiler systems remain baselines and fallbacks.
- The first proof uses small complete models with a near-exhaustive oracle, then scales to real A800 models.

## Errors Encountered

- None.

## Status

**Complete** - framework layers, search/filter design, experiment matrix, artifacts, milestones, and go/no-go criteria are documented.
