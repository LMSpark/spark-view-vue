# AI 提示词治理规则

> 本文定义 SPARK 仓库内 AI 提示词文档的分层、主从关系、更新顺序和新增准入规则。

## 目标

1. 避免同一场景出现多份相互冲突的 prompt 正文。
2. 避免运行时规则、生产版主入口、兼容入口、案例附录长期分叉。
3. 在不打断现有测试和引用的前提下，持续推进提示词体系化治理。

## 分层与主从关系

1. 运行时基线
   [system-prompt.txt](../../spark-ai-server/src/main/resources/prompts/system-prompt.txt)
   这是后端页面生成链路真正加载的系统提示词。凡是“运行时一定要这样做”的约束，最终以它为准。

2. 生产版主入口
   例如 [PAGEDATA_JSON_COMPLETE_PROMPT.md](prompts/data/PAGEDATA_JSON_COMPLETE_PROMPT.md)。
   这类文档面向"直接复制给 AI"的使用场景，必须与运行时基线对齐。

3. 兼容入口
   例如 [DATASET_JSON_PROMPT_TEMPLATE.md](prompts/data/DATASET_JSON_PROMPT_TEMPLATE.md)。
   这类文档用于兼容旧链接或作为提示词组装入口；规则正文统一引用生产版主入口，不再维护独立规则体系。

4. 案例附录
   例如 [DATASET_JSON_PROMPT.md](prompts/data/DATASET_JSON_PROMPT.md)。
   这类文档保留验证案例、历史演进和扩展说明，不作为首选复制入口。

5. 策略版
   例如 [AI_PAGE_GENERATION_STRATEGY.md](prompts/pages/AI_PAGE_GENERATION_STRATEGY.md)。
   这类文档沉淀拆分策略、生成方法、跨文件协同经验，不负责定义底层 schema。

## 目录职责

1. [docs/ai/](README.md)
   所有 AI 相关文档的统一根目录。prompts/ 存放可操作提示词，architecture/ 存放 AI 系统设计。

2. [docs/guides/](../guides)
   纯开发者指南（非 AI），不承载任何 prompt 正文。

3. [docs/architecture/](../architecture)
   纯框架架构设计（非 AI），如数据流、权限、导航、租户路由。

4. [spark-ai-server/src/main/resources/prompts/](../../spark-ai-server/src/main/resources/prompts)
   运行时系统 prompt，不由 docs 替代。

## 更新顺序

涉及提示词规则变更时，默认按以下顺序处理：

1. 先判断变更属于运行时约束、数据建模规则、页面生成策略，还是组件专项约束。
2. 如果影响运行时行为，先更新 [system-prompt.txt](../../spark-ai-server/src/main/resources/prompts/system-prompt.txt)。
3. 再更新对应场景的生产版主入口文档。
4. 如果兼容入口、案例附录、模板版、策略版会被这次规则影响，再同步回写相关文档。
5. 如果分类或角色发生变化，再更新 [README.md](README.md) 和对应子目录 README。
6. 最后确认测试、README、QUICKSTART、交叉引用是否仍然指向有效路径。

## 数据分组说明

数据生成提示词已统一迁入 [prompts/data/](prompts/data/)。
[dataset-prompt-validation.test.ts](../../packages/spark-data/src/tests/dataset-prompt-validation.test.ts) 中的路径注释需同步更新。

## 新增文档准入规则

新增 AI prompt 文档前，先检查是否已存在同场景主入口。只有满足以下条件之一时，才应新增文档：

1. 需要一个新的分类入口或治理文档。
2. 需要一个新的角色文档，例如兼容入口、模板版、案例附录、策略版。
3. 需要覆盖一个与现有 prompt 明显不同的稳定场景，例如平台规则、页面生成、组件专项。

不应新增文档的情况：

1. 只是同一主题换一种说法。
2. 只是把现有 prompt 改短一点或改长一点。
3. 可以通过更新现有主入口、兼容入口、模板版或案例附录解决的问题。

## 命名与标识规则

1. 新增正文 prompt 文档时，放在 [docs/ai/prompts/](prompts/) 对应分类目录，同一场景只保留一份正文。
2. 每份核心正文文档顶部都应写明“所属：AI 提示词体系 / 分类 / 角色”。
3. 每个分类下应尽量保持一个清晰主入口，不要并列多个“都可以直接复制”的版本。

## 变更检查清单

1. 这次规则是否影响运行时生成链路。
2. 是否已经同步更新主入口文档。
3. 兼容入口、模板版、案例附录、策略版是否需要同步。
4. 文档顶部角色标识是否仍准确。
5. 分类 README 是否需要补入口。
6. 是否破坏了现有测试、README、QUICKSTART 或引用路径。