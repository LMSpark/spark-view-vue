# r-table 完整提示词（可直接复制）

> 目标：让 AI 一次性输出可运行的 r-table 页面配置（`rule.json` / `pagedata.json` / `script.js` / `style.css`），并严格遵循 SPARK 架构约束。

---

## 一、推荐使用方式

- 直接复制下面“完整提示词正文”到 AI 对话中。
- 把方括号参数替换为你的业务场景。
- 如果你只要最小页面，可在最后补一句：`请按 MVP 输出，避免额外功能。`

---

## 二、完整提示词正文

```text
你是 SPARK View 页面配置专家。请根据需求生成 4 个文件：rule.json、pagedata.json、script.js、style.css。
要求直接给出完整文件内容，不要解释。

【页面目标】
- 页面主题: [例如：订单管理]
- 业务说明: [例如：展示订单列表、支持筛选、行操作、主从联动]
- 主要数据表: [例如：Orders, OrderItems]
- 是否需要脚本交互: [是/否]

【输出格式（固定）】
1) rule.json
2) pagedata.json
3) script.js
4) style.css

【SPARK r-table 硬性约束】
1. r-table 的 children 只能是 r-* 字段组件（如 r-text / r-number / r-select / r-date），不要在 r-table 里放 el-table-column。
2. dataKey 统一使用 @ 分隔格式：table@rows / table@currentRow / table@viewId@rows。
3. 若使用 el-table，highlightCurrentRow/stripe/border 必须显式声明；若是 r-table 也显式声明 border/stripe/highlightCurrentRow。
4. 能用 builtin-action 表达的行为，不要写 script.js 样板逻辑。
5. 无 API 的内联数据表（pagedata 直接 rows）不要使用 refresh 动作触发远程请求。
6. 若需要脚本访问组件，必须走 ID 寻址：$components.getApi('组件ID')。
7. script.js 禁止使用 $data、window.xxx、ElMessage/ElMessageBox；统一使用 $page。
8. 页面数据必须走 DataSet（pagedata.json），不要引入旁路数据源。
9. 事件绑定优先在 rule.json 中通过 on.click: "functionName" 声明。
10. 若有主从联动，优先使用 DataRelation（在 pagedata.json 中声明 parent/child relation）。

【推荐页面结构】
- 顶部：标题 + 说明
- 第一块：r-table 主表（工具栏 + 行动作）
- 第二块：r-table 过滤演示（filterColumns + filterCollapsible）
- 第三块：主从联动（父表 currentRow 切换影响子表 rows）
- 第四块（可选）：r-form 或 r-detail 展示 currentRow

【rule.json 质量要求】
- 使用 r-section 分块，结构清晰。
- 每个 r-table 都要有明确列定义和必要 props。
- toolbar / rowActions 优先 builtin-action；脚本按钮仅保留少量演示动作。

【pagedata.json 质量要求】
- 真实可演示的示例数据（不少于 5 行主表数据）。
- columns 定义完整，主键列标记 isPrimaryKey。
- 需要汇总时配置 aggregates；需要联动时配置 relations。

【script.js 质量要求】
- 仅保留必要演示函数（如“脚本选首行(ID)”）。
- 使用 runWithXxxApi 风格，先等待组件挂接再调用 API。
- 给用户可见反馈：$page.showMessage。

【style.css 质量要求】
- 仅作用于当前页面，使用 [data-page="页面ID"] 前缀。
- 只做轻量布局与间距优化，不要引入复杂视觉效果。

请严格输出 4 个完整文件内容。
```

---

## 三、简化版（MVP）

```text
生成一个最小可运行的 r-table 页面（4 文件齐全）：
- 一个主表 + 一个筛选区 + 一个当前行详情区
- 所有数据用 pagedata.json 内联 rows
- 工具栏仅保留：新增、查看当前、脚本选首行(ID)
- 不要远程 API，不要复杂样式
```

---

## 四、常见失败点自检

- r-table 里误用了 el-table-column
- dataKey 写成旧格式（点号链式）
- 内联数据表误用 refresh 触发请求
- script.js 使用了 $data / window / ElMessage
- 事件没有在 rule.json 的 on 中声明
- CSS 没有加 [data-page="..."] 作用域前缀
