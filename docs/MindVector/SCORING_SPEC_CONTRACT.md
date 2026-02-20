# MindVector scoringSpec 数据契约（v1.0.4）

本文件定义 `docs/MindVector/bib.json` 中每道题 `scoringSpec` 的**可实现**数据契约：
- 目标：让实现侧（前端/后端/算法）可以只依赖 `scoringSpec` + 外部配置（常模/阈值/答案 key）完成计分。
- 原则：凡无法从题干/口径文本**确定**的常数、阈值、映射、模型参数，一律以 `parametersRequired` / `*KeyRequired` 形式声明，不在数据里“猜”。

## 1. 顶层结构

每个 task（T1–T100）包含：

- `scoringSpec.version`: 版本字符串（当前为 `v1.0.4`）
- `scoringSpec.taskType`: 题型类别（影响必需输入信号）
- `scoringSpec.scoringMethod`: 计分方法（type + computations）
- `scoringSpec.scoringOutputs`: 本题输出字段列表（给数据管道/存储层用）

### 1.1 taskType 约定

常见值：
- `forcedChoice`: 单选/多选（依赖 `response.selectedOptionId` 或实现侧扩展）
- `openText`: 开放题（依赖 `response.text` + `rater.*` 或模型输出）
- `rating`: 量表（依赖 `response.itemRatings` 或 `response.numericValue`）
- `numericEntry`: 数值输入
- `reactionTime`: 反应时/速度任务（依赖 `behavior.*RT*` 或 `behaviorMonitoring` 中声明字段）
- `behavioral`: 行为/过程评分（依赖 `behavior.*`）
- `game`: 博弈/交互（通常仍走 `behavior.*`，但可能含跨轮结构）

> 注意：`taskType` 不等于实现侧 UI 组件类型；它只表达计分所需数据形态。

## 2. scoringMethod 结构

- `scoringMethod.type`: 方法类型标识（用于路由到对应计分器/函数）
- `scoringMethod.requiredSignals`: 计分所需输入信号列表（字符串数组）
- `scoringMethod.computations`: 计算步骤（数组，顺序执行或按实现侧 DAG）
- `scoringMethod.crossTask`（可选）: 跨题依赖声明（如比较题、汇总指标）

### 2.1 requiredSignals 命名空间

- `response.*`: 本题作答原始输入
  - `response.selectedOptionId`
  - `response.numericValue`
  - `response.text`
  - `response.ideas`（AUT 等开放生成）
  - `response.itemRatings`（Likert 多条目）
- `behavior.*`: 行为监控/过程指标（由采集层产出）
- `rater.*`: 人工评分输入（开放题维度评分）
- `crossTask.*`: 跨题/跨模块汇总输入（由实现侧汇总后注入）

## 3. computations 约定

`computations[].kind` 是核心：表示一个可实现的“算子”。本仓库当前主要使用三类算子：

### 3.1 基础算子（通用）

- `difference` / `absoluteDifference` / `absoluteValue`
- `scaleDivide`
- `composite` / `reverseComposite`
- `normalize` / `inverseNormalize` / `reverseNormalize` / `reverseNormalizeToRange`

这些算子通常会配合：
- `parametersRequired.normalizationKey`
- `parametersRequired.weightsKey`

### 3.2 模型/拟合算子（需要外部模型或阈值）

- `prospectTheoryWeightingFit`
- `infoPurchaseLogisticThreshold`
- `linearFitAngle`（SVO）
- `categorize`（阈值分类）

### 3.3 领域算子（与题型强绑定）

示例（非穷举）：
- `dualTaskWorkingMemoryLoad`（T10）
- `primingWordCompletion`（T15）
- `planningFallacyBias`（T16）
- `hypothesisTestingStrategy`（T23）
- `signalDetection`（T30 / T46 等）
- `postErrorSlowing` / `errorRecovery`（T75）
- `likertSubscales`（T96/T73 等量表）

> 实现建议：为每个 `kind` 建一个纯函数计分器（输入：signals + config；输出：结果与中间变量），并由 `scoringMethod.type` 或 `kind` 路由。

## 4. 配置 key 规范

### 4.1 parametersRequired

当计算需要外部信息（常模、阈值、题目答案、模型参数、尺度定义）时，使用：

- `parametersRequired.weightsKey`: 权重配置
- `parametersRequired.normalizationKey`: 归一化/标准化参数（如均值方差、min/max）
- `parametersRequired.models.*Key` 或 `modelKey`: 模型/拟合器
- `parametersRequired.scales.*Key`: 量表/编码表

### 4.2 推荐的 key 前缀（实现侧可统一配置源）

- `weights.<taskId>`：组合权重
- `norm.<taskId>`：归一化/标准化参数（mean/std/min/max）
- `norms.<taskId>.<name>`：常模/稀有度数据库（例如 AUT 独创性）
- `models.<taskId>.<name>`：模型/拟合器参数
- `scales.<taskId>.<name>`：尺度定义（条目列表、反向条目、子量表映射、答案编码等）
- `baseline.<taskId>.<name>`：基线指标（无压力、单任务、无声誉等）
- `answerKey.<taskId>`：正确答案 key（需要准确率的直觉判断类任务）
- `parallelMetric.<taskId>` / `baseMetric.<taskId>`：一致性/信度检验对齐指标

## 5. scoringOutputs 约定

`scoringOutputs[]` 主要用于：
- 统一声明本题会产出哪些字段
- 给存储/渲染/导出层提供字段清单
- 可选声明 `range`（当能从口径或量表范围确定时）

字段结构：
- `key`: 输出字段名（如 `overconfidenceScore`）
- `role`: `primary` / `secondary` / `rubric` / `optionOutput` 等
- `range`（可选）: `{min,max}`

## 6. 实现侧最小落地建议

1) 采集层按 `requiredSignals` 产出 signals
2) 配置层按 key 前缀提供 config（可来自 json/yaml/DB）
3) 计分层按 `computations[].kind` 执行，写回 outputs
4) 质量层用校验脚本确保：
   - 每题 computations 非空
   - 不存在 `behavioralComposite` 这种“兜底模板”
   - 所有 `*KeyRequired` 字段都是字符串且非空

## 7. 相关工具

- 生成/覆盖：`node tools/augment-mindvector-bib-scoringSpec.cjs --overwrite`
- 校验（结构）：`node tools/validate-mindvector-scoringSpec.cjs`
- 校验（结构 + 配置覆盖）：`node tools/validate-mindvector-scoringSpec.cjs --config <path/to/scoring-config.json>`
  - `--config` 会检查：所有 scoringSpec 引用到的配置 key（`*KeyRequired` / `parametersRequired`）在 config 中都“存在且不为 null”。
  - 备注：对 `docs/MindVector/scoring-config.template.json` 运行该检查会报大量 `null` 错误，这是预期行为（模板就是用来提示哪些 key 需要被实现侧填值）。
- 生成配置模板：`node tools/generate-mindvector-scoring-config-template.cjs`
  - 输出：`docs/MindVector/scoring-config.template.json`
