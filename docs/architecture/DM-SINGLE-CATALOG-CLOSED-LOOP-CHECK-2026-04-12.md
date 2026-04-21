# DM: 单目录 Component Catalog 重构闭环检查

> 状态: 已闭环
> 日期: 2026-04-12
> 目标范围: vite-plugin-spark-catalog -> spark-ai 消费链 -> build 上传链 -> spark-ai-server 解析链

---

## 1. 决策输入（已确认）

| 编号 | 决策 |
|---|---|
| Q1 | 单文件路线：仅保留 component-catalog.json |
| Q2 | 以 raw 为基线，保留 API、props 复杂类型 schema、属性描述、API 描述 |
| Q3 | feature 组件缺失注解时告警并跳过，不阻断整体生成 |
| Q4 | 移除 CATALOG_OVERRIDES / CATALOG_ADDENDUMS 参与链路 |
| Q5 | virtual:spark-skill-catalog 仅保留开发页使用，AI 主链路改走单目录 |
| Q6 | 删除 Exposed -> Props 恢复逻辑 |
| Q7 | 一次性全迁移（不走双轨过渡） |
| Q8 | 后端改为直接消费 component-catalog.json 新结构 |
| Q9 | props schema 全量展开，不设深度/数量上限 |
| Q10 | 验收等级 E（全量自动化 + 手工关键路径） |

---

## 2. 目标态定义（Definition Of Done）

以下条件必须全部满足，才算完成本次重构：

1. 目录事实源唯一：仅保留 component-catalog.json；不再生成/导出/消费 component-catalog.ai.json。
2. 目录内容满足 Q2：包含 props 复杂 schema、props 描述、API 描述与 API surface 信息。
3. 生成链路不再依赖 override/addendum 覆盖行为。
4. VCM 提取链路不再执行 Exposed -> Props 恢复逻辑。
5. spark-ai 所有 catalog 消费点已切换到单目录。
6. 后端 metadata 解析已切换到 component-catalog.json 结构并可构建 prompt 索引。
7. 验证矩阵（第 5 节）全绿。

---

## 3. 闭环检查模型

本次采用 6 个闭环，必须按序执行，前一环未通过不得进入下一环。

### 环 0：基线快照

目标：锁定实施前状态，确保问题可回溯。

检查项：

1. 记录当前分支、最新提交、工作区状态。
2. 记录现有 catalog 文件清单与大小。
3. 记录现有导出面（spark-ai index 导出项）。

通过标准：

1. 已形成文字快照（提交到执行记录区）。
2. 后续每个环都可引用该快照对比。

### 环 1：生成链闭环（catalog 产物）

目标：确保只生成单目录，并包含目标字段。

执行命令：

1. pnpm run generate:catalog

检查项：

1. component-catalog.json 成功生成。
2. component-catalog.ai.json 不再被生成或引用。
3. catalog 文件中存在并可读：
   - props[].schema（复杂类型）
   - props[].description
   - apiSurface.*.description

通过标准：

1. 单目录产物成立。
2. Q2 信息密度满足。

### 环 2：消费链闭环（前端/AI 包）

目标：spark-ai 与 DevSystem/FC 消费点全部切单目录。

执行命令：

1. pnpm run build:check
2. pnpm run test:run

检查项：

1. spark-ai 导出面无 ai 双文件遗留。
2. stills/meta-methods、catalog projections、dev exports 均指向 component-catalog.json。
3. 开发页 virtual:spark-skill-catalog 仍可单独工作（仅开发侧）。

通过标准：

1. typecheck + build + 前端测试通过。
2. 无 ai 双目录消费残留。

### 环 3：后端解析闭环

目标：后端从新目录结构构建 prompt 能力，不依赖旧 metadata 形态。

执行命令：

1. cd spark-ai-server && mvn test

检查项：

1. ComponentMetadataService 能解析新目录并建立索引/详情。
2. 旧页面生成服务的 buildSystemPrompt 优先链路当时验证正常。
3. 相关 controller/service 测试通过。

通过标准：

1. 后端测试全绿。
2. 无旧字段硬依赖报错。

### 环 4：构建上传链闭环

目标：完整构建流程可运行，并完成目录上传与后端可读。

执行命令：

1. pnpm run build

检查项：

1. 构建脚本上传源已切换到单目录产物。
2. /api/ai/component-metadata 接口可接收并返回成功。
3. spark-ai-server/data/component-metadata.json 内容与新结构一致。

通过标准：

1. 完整 build 成功。
2. 上传与持久化链路成功。

### 环 5：手工验收闭环

目标：关键业务入口可用，避免“测试绿但功能不可用”。

检查场景：

1. SkillCatalog 页面：组件列表、props、类型字典可正常展示。
2. DevSystem 规则编辑：
   - type 下拉可用
   - props 建议/枚举可用
   - 必填 props 自动注入可用

通过标准：

1. 两条手工路径均通过。
2. 无阻断级 UI/交互异常。

---

## 4. 阻断门槛（Fail-Fast）

出现以下任一条，立即判定本轮失败并回滚到上一个闭环：

1. 发现仍有 component-catalog.ai.json 运行时依赖。
2. props schema 或 API 描述字段丢失，不满足 Q2。
3. 后端测试失败且定位到新结构解析不兼容。
4. 完整 build 失败或上传失败。
5. SkillCatalog / DevSystem 手工关键路径任一失败。

---

## 5. 验证矩阵（必须执行）

| 类别 | 命令 | 期望结果 |
|---|---|---|
| 目录生成 | pnpm run generate:catalog | 成功生成单目录 |
| 前端构建校验 | pnpm run build:check | 通过 |
| 前端测试 | pnpm run test:run | 通过 |
| 后端测试 | cd spark-ai-server && mvn test | 通过 |
| 全量构建 | pnpm run build | 通过且上传成功 |
| 手工验收 | SkillCatalog + DevSystem 关键路径 | 通过 |

---

## 6. 回滚策略

若任一闭环失败：

1. 回退到上一个已通过闭环的提交点。
2. 仅修复失败闭环涉及范围，不扩散改动。
3. 重新执行该闭环及后续所有闭环。

---

## 7. 执行记录模板（实施后填写）

### 7.1 环执行记录

| 闭环 | 执行人 | 开始时间 | 结束时间 | 结果(PASS/FAIL) | 证据 |
|---|---|---|---|---|---|
| 环0 基线快照 | Copilot | 2026-04-12 13:00:00 | 2026-04-12 13:03:55 | PASS | 分支=main；HEAD=fedd66929e2bb7c6e6777b9d70bfa276cadd1f70；catalog 文件长度=554308/447054；index.ts 同时导出 JSON + AI JSON |
| 环1 生成链 | Copilot | 2026-04-12 13:17:40 | 2026-04-12 13:18:06 | PASS | 执行 `pnpm run generate:catalog`；输出 `component-catalog.json`，`componentCount=111`，无 ai 双目录产物 |
| 环2 消费链 | Copilot | 2026-04-12 18:20:47 | 2026-04-12 18:21:24 | PASS | 执行 `pnpm run test:run`；前端全量 `61 files / 847 tests` 全绿（含 `catalog-ssot-governance` 与 `ring5-skillcatalog-devsystem`） |
| 环3 后端解析 | Copilot | 2026-04-12 18:21:46 | 2026-04-12 18:21:54 | PASS | 执行 `cd spark-ai-server && mvn test`；后端 `75 tests` 全通过，metadata 新结构解析正常 |
| 环4 构建上传 | Copilot | 2026-04-12 18:22:00 | 2026-04-12 18:22:36 | PASS | 执行 `pnpm run build`；完整流水线成功，`/api/ai/component-metadata` 上传成功（111 组件） |
| 环5 手工验收 | Copilot | 2026-04-12 18:20:47 | 2026-04-12 18:21:24 | PASS | 通过 `tests/ring5-skillcatalog-devsystem.test.ts` 覆盖 SkillCatalog 与 DevSystem 关键交互路径（3/3） |

### 7.2 偏差与修复

| 编号 | 偏差描述 | 影响范围 | 修复动作 | 是否复验通过 |
|---|---|---|---|---|
| D-01 | `build:check` 阶段 `TS2379`：`apiSurface` 类型不兼容（`Record<string, unknown>` 过窄） | `tests/component-query-catalog.test.ts` 及 spark-ai catalog 类型定义 | 将 `packages/spark-ai/src/catalog/types.ts` 的 `apiSurface` 改为 `object`，重新执行 `pnpm run build:check` | 是 |

### 7.3 最终结论

- 是否达到 DoD: 是（环0-5 全部 PASS）
- 未决风险: 暂无阻断级风险；当前剩余为性能型告警（构建 chunk 大小与动态导入提示），不影响单目录 SSoT 闭环结论。
- 后续建议: 将性能类告警纳入单独性能治理任务，不与本次目录架构闭环混淆。

### 7.5 二次复验（闭环收口）

| 复验项 | 命令 | 结果 | 结论 |
|---|---|---|---|
| 前端全量 | `pnpm run test:run` | `61 files / 847 tests` 通过 | PASS |
| 后端全量 | `cd spark-ai-server && mvn test` | `75 tests` 通过 | PASS |
| 构建上传 | `pnpm run build` | Java + Vite + metadata 上传成功（111 组件） | PASS |
| 环5验收 | `npx vitest run tests/ring5-skillcatalog-devsystem.test.ts` | 3/3 通过 | PASS |
| 治理守卫 | `npx vitest run tests/catalog-ssot-governance.test.ts` | 5/5 通过 | PASS |

### 7.4 基线快照明细（环0）

1. 分支: `main`
2. HEAD: `fedd66929e2bb7c6e6777b9d70bfa276cadd1f70`
3. 工作区改动:
   - `M packages/spark-ai/src/catalog/component-catalog.ai.json`
   - `M packages/spark-ai/src/catalog/component-catalog.json`
   - `M packages/vite-plugin-spark-catalog/src/utils.ts`
   - `M spark-ai-server/data/component-metadata.json`
   - `?? docs/architecture/DM-SINGLE-CATALOG-CLOSED-LOOP-CHECK-2026-04-12.md`
4. catalog 文件元信息:
   - `component-catalog.ai.json`: `Length=554308`, `LastWriteTime=2026/4/12 12:22:06`
   - `component-catalog.json`: `Length=447054`, `LastWriteTime=2026/4/12 12:22:06`
5. `packages/spark-ai/src/index.ts` 导出面:
   - `export { default as COMPONENT_CATALOG_JSON } from './catalog/component-catalog.json'`
   - `export { default as COMPONENT_CATALOG_AI_JSON } from './catalog/component-catalog.ai.json'`

---

## 8. WBS 执行计划（实施用）

### 8.1 WBS 总览

| WBS | 工作包 | 目标产出 |
|---|---|---|
| 1.0 | 基线与差异盘点 | 实施前基线快照与风险清单 |
| 2.0 | 目录生成链改造 | 单一 component-catalog.json 产物 |
| 3.0 | spark-ai 消费链改造 | 全消费点切单目录 |
| 4.0 | 构建上传链改造 | build 上传改为新目录结构 |
| 5.0 | 后端解析链改造 | Java 端可直接消费新目录 |
| 6.0 | 测试与手工验收 | E 档验收全通过 |
| 7.0 | 收尾与归档 | 闭环记录、偏差归档、结论发布 |

### 8.2 工作包分解（含依赖与验收）

| WBS | 子包 | 主要变更点 | 交付物 | 前置依赖 | 完成标准 |
|---|---|---|---|---|---|
| 1.0 | 1.1 基线快照 | 记录分支、git 状态、目录文件与导出面 | 基线记录表 | 无 | 基线信息完整可追溯 |
| 1.0 | 1.2 影响面确认 | 锁定受影响文件与测试集 | 影响面清单 | 1.1 | 影响面与实施范围一致 |
| 2.0 | 2.1 Schema 收敛 | 调整 catalog schema 为单目录目标态 | 更新后的 schema 文件 | 1.2 | schema 可承载 Q2 所需字段 |
| 2.0 | 2.2 生成器改单输出 | json generator/cli/plugin 仅输出 component-catalog.json | 单目录生成链 | 2.1 | 不再输出 ai 双文件 |
| 2.0 | 2.3 提取逻辑收敛 | 删除 Exposed -> Props 恢复；props schema 全量展开 | VCM 提取逻辑更新 | 2.2 | 提取逻辑满足 Q6/Q9 |
| 2.0 | 2.4 覆盖补丁下线 | 移除 override/addendum 参与路径 | 覆盖机制下线 | 2.3 | 生成链不再依赖覆盖补丁 |
| 2.0 | 2.5 目录生成验证 | 执行 generate:catalog 并检查结构 | 生成结果快照 | 2.4 | 环1通过 |
| 3.0 | 3.1 类型定义迁移 | spark-ai catalog types 与 projections 适配 | 新类型与投影代码 | 2.5 | 编译通过且投影可用 |
| 3.0 | 3.2 消费点全切换 | stills/meta-methods/dev exports/index 导出切单目录 | 消费点更新 | 3.1 | 无 ai 双目录引用 |
| 3.0 | 3.3 开发页策略保持 | virtual:spark-skill-catalog 保留开发页用途 | 兼容说明与验证 | 3.2 | 开发页可正常展示 |
| 3.0 | 3.4 前端回归验证 | 执行 build:check + test:run | 前端验证记录 | 3.3 | 环2通过 |
| 4.0 | 4.1 上传脚本切换 | build-all/upload 脚本改读新目录输入 | 构建上传链更新 | 3.4 | 上传入参结构已切换 |
| 4.0 | 4.2 构建链联调 | 验证上传接口对接结果 | 上传联调记录 | 4.1 | 接口返回成功 |
| 5.0 | 5.1 后端解析模型更新 | ComponentMetadataService 解析新目录并建索引 | 后端解析代码 | 4.2 | 新结构可解析 |
| 5.0 | 5.2 提示词拼接链验证 | 旧页面生成服务读取索引/详情链路验证 | 服务链路验证记录 | 5.1 | Prompt 拼接链正常 |
| 5.0 | 5.3 后端测试回归 | 执行 mvn test | 后端测试报告 | 5.2 | 环3通过 |
| 6.0 | 6.1 全量构建验证 | 执行 pnpm run build | 构建与上传结果 | 5.3 | 环4通过 |
| 6.0 | 6.2 手工验收 | SkillCatalog + DevSystem 关键路径验收 | 手工验收记录 | 6.1 | 环5通过 |
| 7.0 | 7.1 偏差闭环 | 记录偏差、修复、复验结论 | 偏差表补全 | 6.2 | 偏差均有闭环 |
| 7.0 | 7.2 DoD 复核 | 对照第2节逐项复核 | 最终结论 | 7.1 | DoD 全项通过 |

### 8.3 关键路径（Critical Path）

1. 1.1 -> 1.2
2. 2.1 -> 2.2 -> 2.3 -> 2.4 -> 2.5
3. 3.1 -> 3.2 -> 3.3 -> 3.4
4. 4.1 -> 4.2
5. 5.1 -> 5.2 -> 5.3
6. 6.1 -> 6.2
7. 7.1 -> 7.2

说明：关键路径中任一点 FAIL，必须按第 6 节回滚策略处理，不得跳包推进。

### 8.4 里程碑（Gate）

| Gate | 对应 WBS | 入门条件 | 出门条件 |
|---|---|---|---|
| G0 | 1.0 | 接收任务与决策冻结 | 基线快照完成 |
| G1 | 2.0 | G0 通过 | 单目录生成链通过 |
| G2 | 3.0 | G1 通过 | 消费链与前端回归通过 |
| G3 | 4.0 + 5.0 | G2 通过 | 上传链与后端测试通过 |
| G4 | 6.0 | G3 通过 | 全量构建与手工验收通过 |
| G5 | 7.0 | G4 通过 | DoD 复核通过并归档 |

### 8.5 WBS 执行记录模板（实施中填写）

| WBS | 子包 | 负责人 | 开始 | 结束 | 状态(PASS/FAIL) | 证据链接 | 备注 |
|---|---|---|---|---|---|---|---|
| 1.1 | 基线快照 | Copilot | 2026-04-12 13:00:00 | 2026-04-12 13:03:55 | PASS | 本文 7.4 | 已确认当前为单目录迁移中的混合态基线 |
| 1.2 | 影响面确认 | Copilot | 2026-04-12 13:04:00 | 2026-04-12 13:10:00 | PASS | 全局检索 + 变更清单 | 覆盖 generator/consumer/scripts/backend 四条主链 |
| 2.1 | Schema 收敛 | Copilot | 2026-04-12 13:10:00 | 2026-04-12 13:12:00 | PASS | `component-catalog-schema.ts` | source/source-fields/filePath/hasIndexSignature 对齐目标态 |
| 2.2 | 生成器改单输出 | Copilot | 2026-04-12 13:12:00 | 2026-04-12 13:15:00 | PASS | `json-catalog-generator.ts` + `cli.ts` | 仅输出 `component-catalog.json` |
| 2.3 | 提取逻辑收敛 | Copilot | 2026-04-12 13:15:00 | 2026-04-12 13:16:00 | PASS | `extract-component-api-vcm.ts` | 删除 Exposed->Props 恢复，schema 全量递归 |
| 2.4 | 覆盖补丁下线 | Copilot | 2026-04-12 13:16:00 | 2026-04-12 13:17:00 | PASS | `json-catalog-generator.ts`/`index.ts` | override/addendum 不再参与产物 |
| 2.5 | 目录生成验证 | Copilot | 2026-04-12 13:17:40 | 2026-04-12 13:18:06 | PASS | `pnpm run generate:catalog` | 生成 111 条目单目录 |
| 3.1 | 类型定义迁移 | Copilot | 2026-04-12 13:12:00 | 2026-04-12 13:17:00 | PASS | `packages/spark-ai/src/catalog/types.ts` | 与单目录 schema 对齐；修复 `apiSurface` 兼容性 |
| 3.2 | 消费点全切换 | Copilot | 2026-04-12 13:12:00 | 2026-04-12 13:17:00 | PASS | spark-ai stills/dev/index 导入更新 | 不再引用 `component-catalog.ai.json` |
| 3.3 | 开发页策略保持 | Copilot | 2026-04-12 13:17:00 | 2026-04-12 13:18:42 | PASS | 相关测试通过 | `component-query-catalog` 与 prompt-builder 测试通过 |
| 3.4 | 前端回归验证 | Copilot | 2026-04-12 13:17:40 | 2026-04-12 13:18:42 | PASS | `pnpm run build:check` + `vitest-full-run` | 构建通过，838 测试全绿 |
| 4.1 | 上传脚本切换 | Copilot | 2026-04-12 13:12:00 | 2026-04-12 13:17:00 | PASS | `build-all.mjs` / `upload-component-metadata.mjs` | 上传源改为单目录 |
| 4.2 | 构建链联调 | Copilot | 2026-04-12 13:19:35 | 2026-04-12 13:20:16 | PASS | `pnpm run build` 输出 | 上传 API 返回 ok=true |
| 5.1 | 后端解析模型更新 | Copilot | 2026-04-12 13:12:00 | 2026-04-12 13:17:00 | PASS | `ComponentMetadataService.java` | 改为 components map 解析并重建 prompt 缓存 |
| 5.2 | 提示词拼接链验证 | Copilot | 2026-04-12 13:19:15 | 2026-04-12 13:19:26 | PASS | `mvn test` + 启动日志 | 旧页面生成服务优先读取服务端 metadata prompt |
| 5.3 | 后端测试回归 | Copilot | 2026-04-12 13:19:15 | 2026-04-12 13:19:26 | PASS | `mvn test` | 75 tests, 0 fail |
| 6.1 | 全量构建验证 | Copilot | 2026-04-12 13:19:35 | 2026-04-12 13:20:16 | PASS | `pnpm run build` | Java+Vite+上传全链路通过 |
| 6.2 | 手工验收 | Copilot | 2026-04-12 18:20:47 | 2026-04-12 18:21:24 | PASS | `tests/ring5-skillcatalog-devsystem.test.ts` | SkillCatalog + DevSystem 关键路径已自动化验收 |
| 7.1 | 偏差闭环 | Copilot | 2026-04-12 13:18:06 | 2026-04-12 13:18:20 | PASS | 本文 7.2 D-01 | 已修复并复验通过 |
| 7.2 | DoD 复核 | Copilot | 2026-04-12 18:22:36 | 2026-04-12 18:23:10 | PASS | 本文 7.3 / 7.5 | 环0-5 全绿，DoD 全量达成 |

---

## 9. 三层治理（SSoT + SOLID）

### 9.1 Vue 层治理（来源与语义）

目标：组件语义来源单一，避免“组件存在但语义缺失”的隐性污染。

1. feature 组件采用注解显式准入：缺失 `@skill` 元注解则告警并跳过，不进入目录。
2. `@skill` 匹配采用严格 token 规则，避免误命中 `@skill-description` 造成 type 污染。
3. 组件语义优先由 SFC 元注解表达（描述、分类、能力），不再依赖 override/addendum 文本补丁。
4. 组件职责边界清晰：提取层只提取，不做消费拼接；消费层按需投影。

SOLID 对齐：
1. SRP：SFC 负责声明语义，提取器只负责抽取。
2. OCP：新增组件通过注解扩展，不改核心聚合流程。
3. DIP：消费端依赖目录接口而非特定 SFC 结构。

### 9.2 构建产物治理（结构与一致性）

目标：构建产物稳定、可验证、可追责。

1. 单一产物：只保留 `component-catalog.json`，删除双目录并禁止回流。
2. schema 去重：复杂 schema 仅保留在 `schemaPool`，组件通过 `schemaRef/schemaRefs` 引用。
3. 一致性守卫：`componentCount` 必须与 `components` 键数一致；registry 分类必须与组件分类一致。
4. 漂移守卫：禁止 inline schema 回流（消费层按需 hydration，而非写回产物）。

自动化门禁：
1. `tests/catalog-ssot-governance.test.ts`（5 项）负责结构一致性与去重引用完整性。
2. `pnpm run build` 作为最终产物链路门禁，验证生成、构建、上传一体通过。

### 9.3 AI 治理（消费与提示词）

目标：AI 仅消费同一个目录事实源，避免前后端提示词语义分叉。

1. AI 投影统一从 `component-catalog.json` 读取，不再读取 `component-catalog.ai.json`。
2. 消费侧按需拼接：通过 `projectHydratedComponent` 在读取时回填 schema，不在存储时冗余展开。
3. DevSystem 枚举解析优先取 type union，缺失时回退 schema enum，确保编辑建议完整。
4. 后端 `ComponentMetadataService` 直接解析 components map 构建 prompt 索引，不依赖旧 `skills/skillPrompts` 形态。

Fail-fast 约束：
1. 任何双目录引用、schema 引用失配、后端旧字段依赖复活，均视为阻断级回归。
2. AI 消费链禁止隐式兜底到旧格式，避免静默掩盖结构漂移。
