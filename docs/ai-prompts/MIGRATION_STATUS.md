# AI 提示词迁移状态

> 本文记录当前 AI 提示词体系的整理状态，帮助后续继续迁移或治理时快速判断哪些部分已经收口、哪些仍是兼容承载。

## 当前策略

当前采用“分类入口集中，按风险分组迁移”的方式推进：

1. [docs/ai-prompts](README.md) 负责分类、导航、角色、治理，以及已经完成迁移的 canonical 正文。
2. 组件、页面、平台三组已迁入 ai-prompts 对应目录承载唯一正文；旧 guides 同名文件已删除，不再保留兼容副本。
3. 数据生成分组仍保留在 [docs/guides](../guides) 单份承载正文，因为这部分不只是旧路径问题，还承担验证基线与历史引用职责。
4. 运行时基线仍由 [system-prompt.txt](../../spark-ai-server/src/main/resources/prompts/system-prompt.txt) 承担。

## 已纳入体系的核心文档

### 平台基础

1. [API_FIRST_PROMPT.md](platform/API_FIRST_PROMPT.md)
   状态：已迁入平台分组目录，当前仅保留 ai-prompts 下这一份正文。

2. [AI_PROTOCOL_UNIFIED.md](platform/AI_PROTOCOL_UNIFIED.md)
   状态：已迁入平台分组目录，当前仅保留 ai-prompts 下这一份正文。

3. [system-prompt.txt](../../spark-ai-server/src/main/resources/prompts/system-prompt.txt)
   状态：已在体系入口中标明为运行时最终基线。

### 数据生成

1. [PAGEDATA_JSON_COMPLETE_PROMPT.md](../guides/PAGEDATA_JSON_COMPLETE_PROMPT.md)
   角色：生产版主入口。
   状态：已与运行时 prompt 持续对齐；当前仍留在 guides 承载正文。

2. [DATASET_JSON_PROMPT_TEMPLATE.md](../guides/DATASET_JSON_PROMPT_TEMPLATE.md)
   角色：模板版。
   状态：已纳入体系；当前仍留在 guides 承载正文。

3. [DATASET_JSON_PROMPT.md](../guides/DATASET_JSON_PROMPT.md)
   角色：案例与验证版。
   状态：已纳入体系；仍被 [dataset-prompt-validation.test.ts](../../packages/spark-data/src/tests/dataset-prompt-validation.test.ts) 明确作为提示词质量门说明来源，不宜直接迁走或改成包装页。

### 页面生成

1. [SPARK_PAGE_CONFIG_PROMPT.md](pages/SPARK_PAGE_CONFIG_PROMPT.md)
   角色：页面配置主提示词。
   状态：已迁入页面分组目录，当前仅保留 ai-prompts 下这一份正文。

2. [AI_PAGE_GENERATION_STRATEGY.md](pages/AI_PAGE_GENERATION_STRATEGY.md)
   角色：策略与实战版。
   状态：已迁入页面分组目录，当前仅保留 ai-prompts 下这一份正文。

### 组件与专项

1. [SPARK_COMPONENT_PROMPT.md](components/SPARK_COMPONENT_PROMPT.md)
   角色：组件开发主提示词。
   状态：已迁入组件分组目录，当前仅保留 ai-prompts 下这一份正文。

2. [R_TABLE_PROMPT.md](components/R_TABLE_PROMPT.md)
   角色：r-table 专项提示词。
   状态：已迁入组件分组目录，当前仅保留 ai-prompts 下这一份正文。

3. [COMPONENT_DEEP_OPTIMIZATION_PROMPT_TEMPLATE.md](components/COMPONENT_DEEP_OPTIMIZATION_PROMPT_TEMPLATE.md)
   角色：深度优化模板。
   状态：已迁入组件分组目录，当前仅保留 ai-prompts 下这一份正文。

## 当前未做的事情

1. 尚未将大部分数据生成正文文件物理迁入 [docs/ai-prompts](README.md)，因为验证基线还未一起重构。
2. 仍需持续审视少数历史 prompt 文档的风格一致性，但当前核心入口已具备可维护状态。
3. 尚未把数据分组的验证说明与旧路径角色彻底解耦，因此数据类正文暂时仍由 guides 单份承载。

## 后续可选方向

1. 第二阶段迁移：先改数据分组的验证基线与引用方式，再把少量最核心正文迁入 [docs/ai-prompts](README.md)。
2. 清理风格债务：继续做小步修复，但避免改坏可直接复制的 prompt 正文。
3. 扩展治理：为新增 prompt 建立更明确的 owner、评审和验收流程。