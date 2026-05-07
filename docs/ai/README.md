# SPARK AI 配置文档体系

> 所有 AI 相关文档的统一入口。核心目标是让 AI 在受约束的配置空间里工作，而不是无边界生成代码。

## 核心原则

- AI 主要生成页面结构配置、数据模型配置、样式配置和最小化脚本
- 最终结果交给稳定运行时解释执行，而不是直接把生成结果当作不受控代码运行
- 整条链路优先追求可验证、可回滚、可审计和可维护

## 分层总览

### 第 1 层：运行时基线

[system-prompt.txt](../../spark-ai-server/src/main/resources/prompts/system-prompt.txt)
— 后端页面配置生成链路实际加载的系统提示词，是所有文档规则的最终对齐基线。

### 第 2 层：提示词（prompts/）

可直接复制给 AI 配置助手使用的操作文档，按场景分组：

| 分组 | 文件 | 角色 |
|------|------|------|
| **平台规则** | [API_FIRST_PROMPT.md](prompts/platform/API_FIRST_PROMPT.md) | API-first 约束（强制） |
| **数据生成** | [PAGEDATA_JSON_COMPLETE_PROMPT.md](prompts/data/PAGEDATA_JSON_COMPLETE_PROMPT.md) | 生产版主入口 |
| | [DATASET_JSON_PROMPT_TEMPLATE.md](prompts/data/DATASET_JSON_PROMPT_TEMPLATE.md) | 组装模板（规则以生产版为准） |
| | [DATASET_JSON_PROMPT.md](prompts/data/DATASET_JSON_PROMPT.md) | 案例与验证附录 |
| **页面配置生成** | [SPARK_PAGE_CONFIG_PROMPT.md](prompts/pages/SPARK_PAGE_CONFIG_PROMPT.md) | 页面配置主提示词 |
| | [AI_PAGE_GENERATION_STRATEGY.md](prompts/pages/AI_PAGE_GENERATION_STRATEGY.md) | 策略与实战经验 |
| | [RENDERER_UNIFIED_CONFIG.md](prompts/pages/RENDERER_UNIFIED_CONFIG.md) | Renderer 统一配置架构 AI 生成指南 |
| **组件专项** | [SPARK_COMPONENT_PROMPT.md](prompts/components/SPARK_COMPONENT_PROMPT.md) | 组件开发主提示词 |
| | [R_TABLE_PROMPT.md](prompts/components/R_TABLE_PROMPT.md) | r-table 专项 |
| | [COMPONENT_DEEP_OPTIMIZATION_PROMPT_TEMPLATE.md](prompts/components/COMPONENT_DEEP_OPTIMIZATION_PROMPT_TEMPLATE.md) | 深度优化模板 |

### 第 3 层：AI 架构设计

当前架构以代码包内的运行时边界文档为准。

| 文件 | 说明 |
|------|------|
| [packages/spark-ai/ARCHITECTURE.md](../../packages/spark-ai/ARCHITECTURE.md) | spark-ai 当前职责、模块边界、后端接口边界与历史说明 |

## 角色约定

- **生产版主入口**：直接复制给 AI 使用的主提示词。
- **组装模板**：用于二次组装或缩短上下文，不维护第二份独立规则正文。
- **模板版**：用于二次组装的精简模板；并非所有文件名带 TEMPLATE 的文档都仍承担该角色。
- **案例附录**：保留验证案例和质量门，不作为首选复制入口。
- **策略版**：沉淀实战方法和跨文件协同经验。

## 使用顺序

1. 先判断问题属于平台规则、数据生成、页面配置生成还是组件专项。
2. 进入对应分组，选择合适角色（生产版主入口 / 组装模板 / 案例附录 / 策略版）。
3. 涉及运行时行为时，以 system-prompt.txt 为最终对齐基线。
4. 维护或扩展体系前，先看 [GOVERNANCE.md](GOVERNANCE.md)。
