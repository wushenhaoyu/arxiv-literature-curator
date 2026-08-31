# 组会汇报：面向完整模型的证据驱动融合发现

**日期：** 2026-08-31  
**当前阶段：** 研究问题收敛，S0-S3 框架主链路已搭建，正在冻结第一个可信基线 B0

## 1. 本次汇报结论

我们希望解决的不是“如何把单个算子写快”，也不是“让 Agent 随机尝试更多融合”，而是：

> **在一个已经正确、可分析的完整模型实现上，如何利用图结构、运行时画像和实现证据，避免遍历组合空间，发现值得打破的 kernel 边界，并验证新的融合是否带来端到端收益？**

近期两项最相关的工作分别是：

- **FACT**：从已知优化规则出发，用 Agent 将 CUTLASS 模板实例化并组合，证明了“固定模式发现 + 高质量模板实现”可以改善模型块性能。
- **MKEvolve**：用多 Agent 反复拆分、实现和融合模块，证明了模块化搜索比单体 kernel 生成更容易保证正确性，也更节省生成开销。

它们都没有完整回答我们关心的问题：**面对多个合法的全图 kernelization 方案，怎样用证据筛掉大部分不值得实现的方案，并主动寻找固定规则之外的非典型融合。**

目前我们已经完成：

- S0 规范图 IR；
- S1 保守的完整基线融合计划；
- S2 正确性、NSYS、NCU、算子画像和基线状态装配；
- S3 假设生成链路的工程验证；
- 第一个 ResNet BasicBlock 案例的正确 CUDA 实现。

但当前还不能声称完成了 B0：完整模型稳定端到端计时尚未冻结，`g00`、`g02` 也还没有达到机械停止条件；现有朴素 CUDA 实现明显慢于 PyTorch 强基线。因此，下一步的首要目标不是扩大数据集，而是先得到一个**正确、强、可复现、可比较的 B0**。

## 2. 为什么是完整模型上的融合搜索

单算子优化通常只有一个明确边界：输入、输出以及算子语义已经给定，主要问题是实现空间搜索。

融合则不同。只有放到完整计算图中，才会同时出现：

- 哪些中间张量值得消除；
- 哪些 producer-consumer 边界值得打破；
- 分支、汇合、布局转换是否允许重组；
- 局部 kernel 加速是否会被调度、同步或其他 kernel 抵消；
- 多个局部候选互相冲突时，哪一个全图方案更好。

因此，我们实际搜索的是一个完整模型的 **kernelization state**：计算图如何被划分为一组可执行 kernel，以及这些 kernel 如何实现。这个空间是组合性的，直接枚举会产生大量昂贵但无效的实现和测量。

我们的核心原则是：

> **广泛提出候选，选择性地实现；局部证据提出假设，完整模型结果决定是否接受。**

## 3. 相关工作一：FACT

论文：[FACT: Compositional Kernel Synthesis with a Three-Stage Agentic Workflow](https://arxiv.org/abs/2604.26666)

### 3.1 它解决什么问题

FACT 关注如何把模型图中的已知优化模式可靠地转化为高性能组合 kernel。它将 Agent 的开放生成限制在一个相对稳定的工程框架中，避免完全从空白 CUDA 代码开始。

### 3.2 方法

FACT 的三阶段流程是：

1. **Pattern Discovery**：从 `torch.jit.trace` 或 `torch.fx` 图中识别与已知优化规则匹配的子图。
2. **Pattern Realization**：检索与规则、数据类型、形状和 GPU 架构对应的示例，通过 CUTLASS 模板生成 PyTorch 扩展，并自动调优 tile、pipeline、schedule 和 cluster。
3. **Pattern Composition**：验证实现，将通过的 pattern 加入动态注册表，再组合多个已实现模式。

这里的动态注册表会不断积累实现，但每个候选仍然从已知规则或模板出发。

### 3.3 实验如何设计

- 硬件：A100、H100；完整块实验主要在 A100 上完成。
- 基线：PyTorch/cuBLAS、PyTorch eager、Inductor max-autotune、Torch-TensorRT。
- L1：方阵 GEMM、Batched GEMM、large-K GEMM，覆盖 16-48 个配置。
- L3：MiniGPT block 和 Llama 3 8B 的单个 decoder block，均为固定形状测试，不是完整模型 serving。
- 正确性：10 组固定随机输入；性能采用 warmup 和 CUDA Event 测量。

代表性结果：

| 对象 | FACT 相对 eager | Inductor 相对 eager | TensorRT 相对 eager |
|---|---:|---:|---:|
| MiniGPT block | 2.03x | 1.89x | 1.85x |
| Llama 3 8B decoder block | 1.41x | 1.17x | 1.18x |

在 GEMM 微基准上，FACT 并非始终优于库实现：A100 上约为 1.06-1.18x，H100 上约为 0.84-1.80x。这说明它的价值主要来自**组合模式及其上下文**，而不是普遍替代成熟库。

### 3.4 对我们的启示与边界

FACT 给我们的直接启示：

- Agent 应由结构化证据、verifier 和 correctness gate 约束；
- CUTLASS/CuTe 是获得可信实现质量的重要工具；
- 规则检索、模板实现和自动调优可以成为我们的强基线路径；
- 必须同时报告强库基线和完整块结果，不能只展示局部 kernel 加速。

FACT 尚未覆盖的部分：

- 候选从已知规则目录出发，固定模式之外的区域没有系统探索；
- 没有把多个完整模型 kernelization state 作为显式竞争对象；
- 没有评估“实现多少候选才能接近小图穷举最优解”；
- 模型实验是固定形状 block，还不能替代完整模型上的端到端验证。

因此，我们不能把“Agent 识别融合 + CUTLASS 实现”本身作为创新点。我们需要证明的是：**证据驱动搜索能够发现规则库排除的合法融合，并用较少的物化候选得到接近最优的完整模型方案。**

## 4. 相关工作二：MKEvolve

论文：[MKEvolve: A Modular Multi-Agent Framework for Kernel Code Generation](https://arxiv.org/abs/2607.20501)

### 4.1 它解决什么问题

MKEvolve 观察到：让一个 Agent 一次性生成复杂的整体 kernel，容易同时遭遇正确性、代码复杂度和优化困难。它把任务拆成模块，分别优化，再根据状态继续拆分或融合。

### 4.2 方法

主要组件包括：

- `LLMDecompose`：把原始 PyTorch 模块拆为子问题，并生成顶层组合程序；
- `LLMEvolveKernel`：以 beam search 独立生成、调试和优化 Triton 子 kernel；
- `LLMSplit`：每隔两个外循环，把失败的子问题固定拆成两个；
- `LLMFuse`：可选地融合当前已正确的若干子问题；
- `AllocateLLMBudget`：优先处理新增或错误模块，其余预算按运行时间分配；
- `Evaluate`：验证并测量组合程序，保留当前最好版本；
- `Swap`：把过慢的生成 kernel 换回 PyTorch 实现。

主配置运行 5 个外循环，每轮 32 次 LLM 调用，约生成 160 个 kernel/任务。

### 4.3 实验如何设计

- 数据：KernelBench L2 100 题、L3 50 题，以及 3 个 FlashInfer 任务。
- 硬件：AWS P4d A100，FP32，关闭 TF32。
- 模型：Claude 4.5 Opus、GPT-OSS 120B，各重复两次。
- 正确性：5 次运行，`atol=rtol=1e-4`。
- 性能：10 次 warmup、100 次计时；每题运行约 2-4 小时。

L3 上的部分结果：

| 模型与方法 | Correct | Fast1 |
|---|---:|---:|
| Claude，MKEvolve | 0.94 | 0.34 |
| Claude，MKEvolve + Swap | - | 0.60 |
| Claude，单体 beam search | 0.88 | 0.26 |
| GPT-OSS，MKEvolve | 0.70 | 0.06 |
| GPT-OSS，MKEvolve + Fuse | 0.72 | 0.12 |
| GPT-OSS，MKEvolve + Swap | 0.88 | 0.36 |

它相对单体生成减少了约 15%-35% token，并显著改善正确率。不过在 FlashInfer 上，与专家 CUDA 实现仍存在明显差距。

### 4.4 对我们的启示与边界

MKEvolve 给我们的直接启示：

- 复杂任务需要模块化、逐步验证和失败隔离；
- 每次拓扑变化后都必须回到完整程序做 correctness 和 performance evaluation；
- 保留 PyTorch fallback 能提高系统完成率；
- Agent 应是可替换的内层实现器，而不是研究贡献的唯一载体。

MKEvolve 尚未覆盖的部分：

- 主要是互不重叠的模块分解，没有系统表示重叠 cover、冗余计算、布局转换等候选；
- Split/Fuse 是较浅的顺序启发式，只维护一个不断演化的分解；
- 没有同时保留和比较多个完整图方案，也没有小图 oracle 来评价搜索质量；
- 优先目标是模块化生成的正确率与效率，而不是非典型融合发现；
- KernelBench L3 仍是固定形状模块，不能直接证明完整模型上的边界决策有效。

因此，我们也不能把“先拆分、再逐个实现、之后继续融合”作为创新点。我们的区别应落在：**显式表示完整模型状态、根据多源证据提出边界变化、控制物化数量，并把搜索质量本身作为实验对象。**

## 5. 三者的定位差异

| 维度 | FACT | MKEvolve | 我们的目标 |
|---|---|---|---|
| 核心问题 | 已知模式如何可靠实现和组合 | 复杂 kernel 任务如何模块化生成 | 完整模型中哪些 kernel 边界值得改变 |
| 候选来源 | 已知规则和模板 | Split/Fuse 启发式 | 图、代码、NSYS、NCU、算子画像和历史证据 |
| 实现后端 | CUTLASS 模板 | Triton/PyTorch fallback | CUDA、CUTLASS、CuTe，可替换内层 Agent |
| 搜索状态 | pattern registry | 单条演化分解 | 多个可比较的完整 kernelization state |
| 非典型融合 | 不是重点 | 有限、依赖 LLMFuse | 核心目标之一 |
| 搜索效率评价 | 无 oracle 对照 | token/正确率为主 | 物化候选数、near-oracle regret、端到端收益 |
| 接受标准 | pattern 正确且更快 | 组合程序正确且更快 | 完整模型 matched comparison 胜出 |

## 6. 我们准备如何做

框架分为 S0-S5。S0-S2 建立可信起点，S3-S5 才进行有风险的融合探索。

### S0：Canonical IR

把模型转换为稳定的图表示，记录节点、张量、依赖、shape、dtype、布局和合法性约束。后续所有 plan、证据和修改都引用同一组稳定 ID。

### S1：BaselineFusionPlan

生成一个完整、保守、低风险的融合计划。这里可以包含 Conv-BN-ReLU 等常见推理融合，但不承担发现新颖融合的任务。

### S2：实现并冻结 B0

逐组实现 S1 的全部 groups，完成：

- correctness gate；
- per-group benchmark；
- NSYS 全图轨迹；
- NCU kernel 指标；
- 稳定的完整模型端到端计时；
- 环境、代码、编译参数和输入配置冻结。

S2 的输出不是“能跑的代码”，而是后续所有决策可比较的强基线 B0。

### S3：Evidence-Guided Fusion Hypotheses

根据 B0 的证据提出少量高价值假设。每个假设必须包含：

- 要改变的图边界；
- 合法性与正确性前提；
- 预期消除的开销或新增的数据复用；
- 实现风险；
- 支持证据与反证；
- 失败时的停止条件。

候选分为“证据最强候选”和“探索候选”，避免系统完全退化成手工规则匹配。

### S4：局部实现

只重新实现受假设影响的区域，其余部分复用当前状态。实现器可以是 CUDA、CUTLASS、CuTe 或专门的 kernel Agent，但必须受 verifier 和 correctness gate 约束。

### S5：完整模型决策

在同一输入、环境和计时协议下比较 `Bt` 与 `Bt+1`。只有完整模型结果稳定改善才接受新状态，然后重新进入 S3；局部 kernel 变快但完整模型不变，视为假设未成立。

第一版不引入强化学习或 MCTS。我们先使用可审计的打分策略和有限探索位，证明“证据能否有效过滤候选”；只有简单策略达到瓶颈时，才考虑更复杂搜索算法。

## 7. 当前做到什么程度

### 7.1 工程状态

当前分支：`codex/s0-s3-baseline-framework`  
正式运行目录：`run/formal_a800_v0/8_ResNetBasicBlock`

目录已经整理为：

```text
8_ResNetBasicBlock/
├── spec/        # ref.py、entry.py、benchmark_time.py、kernel/*.cu
├── pipeline/    # S0-S2 的结构化 JSON
├── bootstrap/   # 正确性和朴素实现验证
└── baseline/    # per-group benchmark、NCU、NSYS 与优化轨迹
```

S0-S2 已生成的核心产物：

```text
pipeline/
├── s0_canonical_ir.json
├── s1_baseline_fusion_plan.json
├── s2_baseline_bootstrap_plan.json
├── s2_operator_profile.json
├── s2_baseline_state.json
└── s2_evidence_bundle.json
```

### 7.2 第一个案例

测试对象是推理态 ResNet BasicBlock。S0 得到 9 个节点、10 个 values，无 IR diagnostics。S1 生成 3 个保守 groups：

| Group | 组成 |
|---|---|
| `g00` | Conv2d + BatchNorm2d + ReLU |
| `g01` | Conv2d + BatchNorm2d + Add + ReLU |
| `g02` | Conv2d + BatchNorm2d |

当前完整实现已通过 correctness gate：

- `max_abs_err = 2.5761e-4`
- `mean_abs_err = 1.7321e-5`
- NCS 解析成功，未发现匹配错误

bootstrap 计时中，PyTorch reference 平均约 `2.243 ms`，朴素 CUDA 组合实现平均约 `12.889 ms`。这只是 bootstrap 数据，不是最终冻结的 B0 端到端结果。

### 7.3 当前画像

| Group | profile 占比 | CUDA | PyTorch | 当前判断 |
|---|---:|---:|---:|---|
| `g00` | 7.4% | 0.840 ms | 0.563 ms | 正确，尚未机械停止 |
| `g01` | 88.1% | 9.969 ms | 1.217 ms | 正确，计算瓶颈，已机械停止 |
| `g02` | 4.5% | 0.522 ms | 0.353 ms | 正确，尚未机械停止 |

对 `g01` 进行的三轮通用微调均退化：

| 尝试 | 延迟 | 相对当前最好版本 |
|---|---:|---:|
| 循环展开 | 11.591 ms | -16.27% |
| block size 128 | 11.918 ms | -19.55% |
| launch bounds | 12.459 ms | -24.97% |

连续三次退化触发机械停止，最佳版本仍是首轮朴素实现。这是有价值的负结果：**通用 CUDA 微调不足以弥补高性能卷积实现的差距，后续必须使用实现感知路径，例如 CUTLASS/CuTe，而不是继续盲调 block 参数。**

### 7.4 当前诚实状态

`s2_baseline_state.json` 仍是 `incomplete`，缺少：

- `complete_model:e2e_ms`；
- `g00:mechanical_stop`；
- `g02:mechanical_stop`。

S3 的数据通路已经用 `--allow-incomplete` 做过临时验证，能够生成候选假设；但正式实验没有保留该结果，因为在 B0 未冻结前提出融合结论会污染证据链。

因此，当前可以说“**S0-S3 框架链路已跑通，得到一个正确实现**”，不能说“**已完成强基线或已经验证融合搜索有效**”。

## 8. 接下来准备做什么

### M1：冻结可信 B0

1. 建立稳定的完整模型 E2E 计时协议，区分 profiler trace 时间与真实 latency。
2. 让 `g00`、`g02` 达到明确停止条件。
3. 对 `g01` 转入实现感知路径，优先使用 CUTLASS/CuTe 或强库内核，而不是继续通用参数微调。
4. 固定输入、GPU、软件环境、代码 hash、编译参数和测量方差。
5. 生成可复现的 B0 report，作为 S3 唯一输入。

### M2：完成第一个 S3-S5 闭环

1. 从真实证据中提出 1 个最强假设和 1 个探索假设。
2. 只实现受影响区域，保留其余 B0 kernel。
3. 先通过局部 correctness，再进行完整模型 matched comparison。
4. 记录候选从提出、实现到接受或拒绝的完整证据链。

该阶段的目标不是马上获得大幅加速，而是证明系统能够给出一个**可解释、可证伪、可复现**的融合决策。

### M3：建立小型完整图 oracle 实验

选择若干规模可控但存在真实边界选择的推理图，枚举全部合法 kernelization plans，得到 oracle 最优方案。比较：

- 随机搜索；
- one-shot Agent；
- hotspot-only；
- MKEvolve 式 Split/Fuse；
- FACT 式 fixed-pattern；
- 我们的 evidence-guided search。

核心指标：

- 找到最佳或 near-oracle 方案需要物化多少 candidates；
- 最终 E2E latency 和 oracle regret；
- correctness pass rate；
- 非典型融合的发现率和真实贡献；
- 移除 NSYS、NCU、代码或历史反馈后的搜索退化。

### M4：扩展到真实模型

在小图验证搜索机制后，再扩展到具有不同结构的完整推理 workload，例如：

- 残差 CNN；
- Transformer block/小模型；
- 包含非标准算子或不规则融合机会的模型；
- 不同输入 shape 和至少两种 GPU 架构。

这一阶段重点验证：搜索收益能否跨图结构、shape 和 GPU 泛化，以及局部融合是否真正改善完整模型。

## 9. 论文需要证明什么

我们的论文成立，至少需要同时满足以下条件：

1. 在可枚举的小型完整图上，用显著少于穷举的物化次数达到 near-oracle。
2. 至少发现一个 fixed-pattern baseline 不会提出的合法融合，并带来可重复的完整模型收益。
3. 相比 MKEvolve 式 Split/Fuse、one-shot Agent、hotspot-only 和随机搜索，搜索效率或最终状态有稳定优势。
4. 收益来自完整 kernelization 决策，而不只是某个单 kernel 实现器更强。
5. 所有接受决策都能回溯到结构化证据、correctness gate 和 matched E2E 测量。

以下结果会直接削弱或否定核心假设：

- one-shot 或简单 Split/Fuse 总能找到同样的最优方案；
- 不同合法分图对完整模型性能几乎没有影响；
- 只出现局部 kernel 加速，没有稳定 E2E 收益；
- 非典型融合无法由 Agent 稳定提出，最终仍退化为手写规则库；
- 自定义实现长期无法接近强库和编译器基线。

## 10. 当前最重要的判断

这个方向的价值不在于把 Agent 包装成一个新的 kernel 生成器，而在于把**融合边界决策**变成一个可测量、可比较、可证伪的完整模型搜索问题。

FACT 已经证明固定模式与高质量模板结合是有效的；MKEvolve 已经证明模块化演化比单体生成更稳健。我们的破局点必须更进一步：

> **让系统在不遍历组合空间的前提下，依据运行证据选择下一条值得实现的图变换，并用完整模型结果迭代演化 kernelization state。**

当前工程基础足以开始验证这个命题，但实现质量仍是最直接的风险。短期工作应集中在冻结强 B0 和跑通第一个 S3-S5 决策闭环，而不是提前扩大 benchmark 数量。

## 11. 组会希望讨论的问题

1. “证据驱动的完整模型 kernelization search”是否足够清晰地区别于 FACT 和 MKEvolve？
2. 第一个机制验证案例应继续使用 ResNet BasicBlock，还是尽快增加一个边界选择更丰富的小型完整图？
3. 小图 oracle 的 plan space 应包含哪些变换，才能既可枚举又能代表真实融合决策？
4. 首个非典型融合案例应优先追求明确的端到端收益，还是优先展示搜索过程的可解释性？

## 12. 相关材料

- 研究故事：`docs/PAPER_STORY.md`
- 框架与实验设计：`docs/research/FRAMEWORK_AND_EXPERIMENTS.md`
- 正式运行：`run/formal_a800_v0/8_ResNetBasicBlock/`
- 基线状态：`run/formal_a800_v0/8_ResNetBasicBlock/pipeline/s2_baseline_state.json`
- 证据包：`run/formal_a800_v0/8_ResNetBasicBlock/pipeline/s2_evidence_bundle.json`
