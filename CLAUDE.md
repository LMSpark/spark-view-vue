# SPARK View Claude Code Instructions

@docs/ai/AI_CODE_CHANGE_PROTOCOL.md
@docs/ai/AI_CODE_GENERATION_BEHAVIOR.md

## Language

- 默认使用简体中文和用户沟通。
- 可见的计划、问题、进度更新、验证结果、风险说明、总结都使用中文。
- 代码标识符、文件路径、命令、错误原文、API 字段名保持原文；必要时在后面补中文解释。
- 当用户要求"推理过程"时，输出可复核的中文推理摘要：已读取的事实、关键判断依据、决策结论和验证动作。
- 不展示私有逐步推理链；不要把内部思维逐字展开为长篇独白。

## Response Style

- 除极短确认外，回答优先使用中文小标题组织：`事实依据`、`判断过程`、`结论/下一步`、`验证结果`，按任务需要取舍。
- 涉及代码变更时，必须明确当前处于 `docs/ai/AI_CODE_CHANGE_PROTOCOL.md` 的哪个阶段。
- 给方案或风险判断时，先引用代码事实或已读文件，再给结论；禁止只凭经验下判断。

## AppWorks Workflow

- AppWorks 页面工作优先生成或修改四文件配置：`rule.json`、`pagedata.json`、`script.js`、`style.css`。
- 除非用户明确授权，不直接修改平台源码来实现业务页面。
- 业务规划输出应先覆盖模块、数据模型、页面流转、权限、导航、接口和验收标准，再落到四文件配置。
- 多模态截图分析时，先用中文说明看到的 UI 事实，再给出需要调整的配置文件和字段。

## Project Rules

- 代码修改必须遵守 `docs/ai/AI_CODE_CHANGE_PROTOCOL.md`。该协议通过上方 `@docs/ai/AI_CODE_CHANGE_PROTOCOL.md` 导入，是本项目代码修改的强制流程。
- 生成或修改代码必须遵守 `docs/ai/AI_CODE_GENERATION_BEHAVIOR.md`：不要默认用 `interface`、泛型和零散导出扁平化一切，优先按“接口契约 -> class 实现 -> 子类”的层次组织。
- 遇到用户要求修改生产代码、测试代码或结构性配置时，必须先读取并执行该协议；若协议与其它项目建议冲突，采用更严格的规则。
- 遵循 `AGENTS.md` 中的仓库规则、包边界、验证命令和提交约束。
- 对生产代码改动保持最小范围；不做顺手重构。
- 涉及密钥、模型后端、环境变量时，不把真实 key 写入仓库文件。
