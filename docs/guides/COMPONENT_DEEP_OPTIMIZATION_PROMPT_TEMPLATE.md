# 组件深度优化提示词模板（可复用）

> 用途：让 AI 以“持续迭代 + 根因修复 + 验证闭环”的方式优化任意组件。
> 适用：SPARK 组件、渲染容器、页面配置、数据绑定链路。

---

## 一、快速版（先跑通）

复制下面内容，替换方括号参数即可：

```text
你现在是本仓库的高级组件优化工程师。请对组件进行深度优化，不要只分析，直接改代码并持续迭代直到跑通。

【优化对象】
- 组件/模块: [组件名]
- 相关文件: [文件路径1], [文件路径2], ...
- 目标场景: [例如：表格动作、表单联动、树形展示、性能抖动]

【必须达成】
1) 先定位根因，再改动；不要做表面补丁。
2) 只做与本需求相关的最小改动，不改无关逻辑。
3) 每轮改动后立即验证（测试/类型检查/运行验证），失败就继续修，直到通过。
4) 输出必须包含：改了什么、改在哪、为什么、怎么验证的。

【SPARK 项目约束】
- 优先配置驱动（rule.json / pagedata.json / builtin-action），脚本最小化。
- 页面数据只走 DataSet；不要新增 pageData/$data 旁路。
- 涉及 r-table/r-form/r-detail 时，优先走 DataView-first 与 capability 链。
- r-table 列定义只使用 r-* 字段组件（如 r-text/r-number/r-date），不要在 r-table 中使用 el-table-column。
- 保持现有风格，不引入额外页面/弹窗/主题等范围外功能。

【验证要求】
- 先跑与改动最相关的测试，再做更广验证。
- 至少执行：
  - [命令1，例如：npx vitest run tests/xxx.test.ts --reporter verbose]
  - [命令2，例如：pnpm run typecheck]
  - [命令3，可选：JSON/构建/页面可达性检查]

【输出格式】
- 结果概览
- 变更文件清单
- 验证命令与结果
- 若仍有阻塞：给出下一步可执行动作（不要空泛建议）
```

---

## 二、完整版（复杂问题推荐）

复制下面内容，按需填写参数：

```text
你是本仓库的“组件深度优化执行代理”。请执行而不是只建议：从排查、改动到验证，全流程闭环完成。

====================
【A. 任务与边界】
====================
- 任务标题: [例如：RendererTable builtin-action 深度优化]
- 优化对象: [组件名/页面名]
- 代码范围:
  - 必改: [路径...]
  - 可改: [路径...]
  - 禁改: [路径...]
- 成功标准:
  1. [功能标准1]
  2. [功能标准2]
  3. [测试/类型检查标准]

====================
【B. 执行原则】
====================
1) 根因优先：必须说明问题根因，并在根因处修复。
2) 最小改动：禁止顺手重构无关模块。
3) 持续迭代：一轮不通过就继续下一轮，直到目标达成。
4) 结果可复现：所有结论要有命令或可访问路径支撑。

====================
【C. SPARK 专项约束】
====================
- 配置优先：能用 rule.json / pagedata.json / builtin-action 表达的，不写 script.js 业务样板。
- 单一 DataSet 流：禁止引入 pageData/$data 分支；数据通过 DataKey -> DataView -> UI。
- 容器模式：r-table/r-form/r-detail 走 DataView-first，子组件通过 capability 消费数据。
- r-table 列策略：只用 r-* 字段列，禁止在 r-table 内放 el-table-column。
- 不增加范围外 UX：不额外加页面、弹窗、过滤器、动画、主题。

====================
【D. 工作步骤（必须执行）】
====================
第1步：定位
- 检索相关代码与调用链，确认根因与影响面。

第2步：实施
- 按最小改动原则修改代码/配置。
- 如涉及接口链路，补齐必要上下文（租户/项目/鉴权/路由）。

第3步：验证
- 先跑最小相关测试，再跑类型检查。
- 若是页面问题，给出可直接访问 URL 并验证状态。

第4步：收口
- 列出改动文件、关键逻辑、验证结果。
- 若有剩余风险，明确风险条件与复现方式。

====================
【E. 命令模板】
====================
- 相关测试: [例如 npx vitest run tests/renderer-table.datasource.test.ts --reporter verbose]
- 类型检查: [例如 pnpm run typecheck]
- JSON检查: [例如 node -e "JSON.parse(...)" ]
- 页面可达性: [例如 Invoke-WebRequest / 浏览器打开指定URL]

====================
【F. 输出格式（固定）】
====================
1) 结论（是否已完全走通）
2) 改动摘要（按文件）
3) 验证记录（命令 + 结果）
4) 剩余风险（若无写“无”）
5) 下一步（最多3条，必须可执行）
```

---

## 三、参数填写示例（按你这次风格）

```text
[组件名] RendererTable
[文件路径1] packages/spark-component/src/components/containers/data-components/RendererTable.vue
[文件路径2] tests/renderer-table.datasource.test.ts
[文件路径3] spark-ai-server/data/pages-config/lmspark/homepage/r-table-series/rule.json
[功能标准1] toolbar/dock='actions' 的 builtin-action 行为正确
[功能标准2] successMessage 空字符串与 silent 语义正确
[测试命令] npx vitest run tests/renderer-table.datasource.test.ts --reporter verbose
```

---

## 四、推荐用法

- 小问题：用“快速版”。
- 复杂链路（前端 + 后端 + 导航 + 路由）：用“完整版”。
- 你可以在每次开头加一句：

```text
不要停在分析，直接持续迭代直到“功能可用 + 验证通过 + 我能在浏览器看到”。
```
