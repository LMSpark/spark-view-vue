# 构建管线 SSoT 重构方案 v4

> **日期**：2026-04-13
> **协议**：`docs/ai/AI_CODE_CHANGE_PROTOCOL.md`（6 阶段严格流程）
> **状态**：待审批
> **修订**：v3→v4，基于 VCM 实验 + 5 子代理审计 + 循环验证（37 处缺口修复）

---

## 1. 任务目标

深度重构组件元数据构建管线，实现真正的 SSoT（Single Source of Truth）：

```
SFC @JSDoc（唯一标注源）
  ↓ parseSkillMeta（组件级：@skill / @category / @binding 等）
  ↓ VCM 静态提取（prop 级：类型 / 默认值 / @api tag）
  ↓ json-catalog-generator 合并
component-catalog.json（唯一产出物）
  ↓ 消费
AI / DevSystem / Java / 上传
```

清除冗余工具、死代码、重复类型定义。

### 1.1 核心架构决策：Path C（混合方案）

**VCM 实验实锤结论**（4 组实验，v3.2.6）：
- `ComponentMeta` 只有 7 个字段（name, description, type, props, events, slots, exposed）——**无 tags 字段**
- `<script setup>` 的 `ComponentMeta.description` 始终返回 `undefined`
- `PropertyMeta.tags[]` 在 **prop 级** 正常工作

**因此**：VCM 无法替代 parseSkillMeta 提取组件级元数据。采用 Path C 混合方案：

| 数据层 | 来源 | 状态 |
|--------|------|------|
| Props 类型/默认值/JSDoc | VCM `PropertyMeta` | ✅ 已在工作 |
| Prop 级 tags（@api/@internal） | VCM `PropertyMeta.tags[]` | ✅ 已在工作 |
| Emits 类型/schema | VCM `EmitMeta` | ✅ 已在工作 |
| 组件级 @skill/@category/@binding/@provides/@consumes/@notes | **parseSkillMeta** | ✅ 保留 |

---

## 2. Q&A 决策记录（10 题全量）

| Q# | 问题 | 决策 |
|----|------|------|
| Q1 | types.ts 双写消除 | JSON 唯一 SSoT，AI/DevSystem/Java 统一消费 |
| Q2 | supplement.ts 硬编码覆盖 | 删硬编码（OVERRIDES/ADDENDUMS 均为死代码），只留 sharedTypes |
| Q3 | SFC JSDoc 标注位置 | 统一到 `<script setup>` 顶部 JSDoc（去除 HTML `<!-- -->` 副本） |
| Q4 | ~~VCM tags 流设计~~ | ~~从 VCM tags 提取，删 parseSkillMeta~~ → **v4 修正**：VCM 无法提取组件级 JSDoc（实验实锤），保留 parseSkillMeta，VCM 仅负责 prop/emit 级提取 |
| Q5 | api-diff-report.ts 保留 | 删除——SSoT 下无用途 |
| Q6 | 注册插件 vs catalog 插件 | 注册插件删元数据输出（`writeBundle`+`generateMetadataJson`），保留 `parseSkillMeta` 副本（驱动 `virtual:spark-skill-catalog`） |
| Q7 | 容器 Props 对外语义 | defineProps 只内部，对外用 @api JSDoc |
| Q8 | 元数据上传数据源 | 上传 component-catalog.json，删 dist/spark-component-metadata.json |
| Q9 | 变更范围边界 | 全量：所有 SFC JSDoc 标准化 + 管线清理（~~含 parseSkillMeta 删除~~ → v4：不删） |
| Q10 | 验证策略 | 组件数 ≥111 + typecheck + build:check + 测试全绿 |

---

## 3. 审计发现（3 轮交叉检查 + 循环验证）

### 3.1 死代码确认

| 代码 | 位置 | 状态 | 验证方式 |
|------|------|------|----------|
| `CATALOG_OVERRIDES` | supplement.ts L70（14 条条目） | **死代码** — 全仓库无消费者 | `grep_search` 零命中 |
| `CATALOG_ADDENDUMS` | supplement.ts L302（**7 条**条目） | **死代码** — 全仓库无消费者 | `grep_search` 零命中 + `read_file` 实测 7 条 |

> ⚠️ v3 原文写 "10 条 ADDENDUMS"，实测确认 **7 条**（r-number, r-checkbox, r-color, r-date, r-upload, r-column-group, r-file-browser）。

### 3.2 残留引用

| 引用 | 位置 | 问题 |
|------|------|------|
| `dist/spark-component-metadata.json` | vite-plugin-spark-components.ts writeBundle() L762 | 旧管线产物，build-all.mjs 不再消费 |
| `dist/spark-component-metadata.json` | scripts/iterate-ai-dataset-quality.ts L72 | 残留引用，需同步清理 |
| `spark-component-metadata.json` | .github/copilot-instructions.md L1597, L1613 | 文档残留 |

### 3.3 类型重复

| vite-plugin-spark-catalog/component-catalog-schema.ts | spark-ai/catalog/types.ts | 差异 |
|-------------------------------------------------------|--------------------------|------|
| `ComponentCatalog.version: '2.0.0'` | `version: string` | 类型宽度 |
| `CatalogBindingDescriptor` | `BindingDescriptor` | 命名 |
| `ApiSurface` 等 4 个类型 | ❌ 不存在 | 缺失 |
| 有详细 JSDoc | 简化注释 | 文档 |

types.ts 注释明确写道 `⚠️ 保持与 component-catalog-schema.ts 同步`。

**附加发现**：`RawComponentCatalog` 只有 4 个字段，而 `component-catalog.json` 实际有 10 个顶层字段（version, buildTime, componentCount, registry, sharedTypes, components, schemaPool, apiSurface, constraints, bindingDescriptors）——对齐的是 `ComponentCatalog`，非 `RawComponentCatalog`。

### 3.4 parseSkillMeta 调用点（catalog 插件版本——保留）

| 位置 | 行号 | 上下文 | v4 处理 |
|------|------|--------|---------|
| json-catalog-generator.ts | L89 | `scanRendererComponents()` — `parseSkillMeta(path, type)` | **保留** |
| json-catalog-generator.ts | L112 | `scanFeatureComponents()` — `parseSkillMeta(path, type, { requireSkillTag: true })` | **保留** |
| index.ts | L78 | 公开导出 | **保留** |

> v3 拟删 parseSkillMeta，v4 因 VCM 实验实锤（无法提取组件级 JSDoc）**全部保留**。

### 3.5 注册插件内独立 parseSkillMeta 副本

`tools/vite-plugin-spark-components.ts` 内有**独立实现**的 `parseSkillMeta` + `SkillMeta`（非 import，是自己的副本）。
该函数驱动两条链路：

| 链路 | 产出 | 消费者 | 本次处理 |
|------|------|--------|----------|
| `generateMetadataJson()` | `dist/spark-component-metadata.json` | **无**（已确认死链） | ✅ 删除（Step 6） |
| `generateSkillCatalog()` | `virtual:spark-skill-catalog` 虚拟模块 | `SkillCatalog.vue` 运行时消费 | ⚠️ **保留**（不在本次清理范围） |

**结论**：注册插件的 `parseSkillMeta` 副本本次**不删除**，因为 `virtual:spark-skill-catalog` 仍被 SkillCatalog.vue 消费。仅删除 `generateMetadataJson()` 调用和 `writeBundle()` 写入。

### 3.6 tests/component-api-e2e.test.ts 消费 api-diff-report

该测试文件 L13-14 导入 `generateDiffReport` / `formatDiffReport`，L115-116 调用。
模块级 `diffCatalog`、`COMPONENT_CATALOG` 变量仅被第二个 describe 块使用。
删除 `api-diff-report.ts` 后需连带清理这些变量和整个第二个 describe 块。
**第一个 describe 块（VCM 4 case）保持独立可运行。**

### 3.7 @skill 标签审计（循环验证）

| 维度 | 数量 | 验证方式 |
|------|------|----------|
| 同时含 HTML JSDoc + script JSDoc 的 SFC（双写） | **24** | 终端 `Select-String + Compare-Object` |
| @skill 值不一致的 SFC | **3** | 终端 MISMATCH 匹配 |
| Options API SFC（createPickerPreset 工厂） | **3** | FieldDeptPicker / FieldProductPicker / FieldUserPicker |

**3 处 @skill 不一致明细**：

| SFC | HTML 注释 | script 注释 | 应以何为准 |
|-----|-----------|-------------|------------|
| RendererStepItem.vue | `r-step` | `r-step-item` | `r-step-item`（与 Spark.register 注册名一致） |
| RendererFieldScope.vue | `(internal)` | `r-field-scope` | `r-field-scope` |
| RendererListItemScope.vue | `(internal)` | `r-list-item-scope` | `r-list-item-scope` |

### 3.8 @skill vs @skill-description 是不同标签

parseSkillMeta L148 正则 `@(skill|skill-description|description)` 同时识别三个标签：
- `@skill` = **组件类型名覆盖**（如 `@skill r-table`）
- `@skill-description` = **描述文字**（等价于 `@description`）
- `src/views/` 下的 SFC 仅使用 `@skill-description`（合法——类型名从文件名推断）

> v3 子代理报 "S1.1 两种格式需统一" 为**错误断言**，已移除。

### 3.9 VCM 实验结论（v3.2.6，4 组实验实锤）

| 实验 | 结果 |
|------|------|
| ComponentMeta 字段 | 7 个：name, description, type, props, events, slots, exposed——**无 tags** |
| `<script setup>` description | 始终 `undefined` |
| `<script>` + defineComponent({}) description | 可返回字符串 |
| PropertyMeta.tags | ✅ 正常工作（prop 级 `@api` 等标签可提取） |

**结论**：VCM 在组件级元数据提取上**不可用**，plan v3 的 Q4/Step 2/Step 3/Step 5 基于错误假设。

---

## 4. 完整影响范围

| 文件 / 目录 | 操作 | 步骤 |
|-------------|------|------|
| 24 个双写 SFC（见 3.7） | 改（去 HTML 副本） | Step 1 |
| 3 个 @skill 不一致 SFC（见 3.7） | 改（统一） | Step 1 |
| 7 条 ADDENDUMS 对应 SFC | 改（迁入 @api JSDoc） | Step 1 |
| 3 个 Options API SFC | 验证（createPickerPreset 兼容性） | Step 1 |
| `vite-plugin-spark-catalog/src/supplement.ts` | 改（删 OVERRIDES + ADDENDUMS + 更新头部 JSDoc） | Step 2 |
| `vite-plugin-spark-catalog/src/api-diff-report.ts` | 删 | Step 3 |
| `vite-plugin-spark-catalog/src/index.ts` | 改（删 api-diff-report 导出） | Step 3 |
| `tests/component-api-e2e.test.ts` | 改（删第二个 describe + 孤立变量） | Step 3 |
| `tools/vite-plugin-spark-components.ts` | 改（删 writeBundle + generateMetadataJson） | Step 4 |
| `scripts/iterate-ai-dataset-quality.ts` | 改（更新 fallback 路径） | Step 4 |
| `scripts/build-all.mjs` | 验证 | Step 4 |
| `scripts/upload-component-metadata.mjs` | 验证 | Step 4 |
| `spark-ai/src/catalog/types.ts` | 改（消除双写） | Step 5 |
| `spark-ai/src/catalog/catalog-projections.ts` | 改（适配类型变更） | Step 5 |
| `spark-ai/src/catalog/catalog-dev-exports.ts` | 验证 | Step 5 |
| `spark-ai/src/index.ts` | 改 | Step 5 |
| `.github/copilot-instructions.md` | 改（L1597, L1613） | Step 7 |

**v4 vs v3 变更**：
- ❌ ~~`extract-component-api-vcm.ts` 改（扩展 VcmApiDescriptor）~~ — 取消，VCM 无法提取组件级数据
- ❌ ~~`utils.ts` 改（删 parseSkillMeta）~~ — 取消，保留
- ❌ ~~`json-catalog-generator.ts` 改（适配 VCM tags）~~ — 取消，parseSkillMeta 路径不变
- Step 编号从 10 精简到 **7**（合并+删除无效步骤）

---

## 5. 实施步骤 & 逐步检查表

> **v4 重组**：v3 的 10 步精简为 7 步——删除 Step 2（VCM 扩展）、Step 3（删 parseSkillMeta）、Step 5（generator 适配 VCM），因为 VCM 无法提取组件级元数据。原 Step 4/6/7/8/9/10 重编号为 Step 2-7。

### Step 1: SFC JSDoc 标准化（去双写 + 修不一致）

**目标**：消除 24 个 SFC 的 HTML/script 双写副本，统一 @skill 值，迁移 ADDENDUMS 说明到 SFC。

**具体动作**：
1. 24 个双写 SFC：删除 `<!-- @skill ... -->` HTML 注释块，保留 `<script setup>` JSDoc
2. 3 个 @skill 不一致 SFC：以 `<script setup>` 中的值为准（与 Spark.register 注册名一致）
3. 7 条 ADDENDUMS 对应 SFC：将透传说明文本迁入 `<script setup>` 的 `@api` 或 `@description` JSDoc
4. 3 个 Options API SFC（FieldDeptPicker/ProductPicker/UserPicker）：验证 parseSkillMeta 兼容（使用 `createPickerPreset` 工厂，JSDoc 在 60 行 fallback 范围内）
5. 定义 `@api` 标签精确格式（当前全仓 0 匹配）

**JSDoc 标准格式（保持现有双标签语义）**：
```typescript
/**
 * @skill r-table
 * @skill-description 表格容器，通过 DataKey 绑定 DataView 展示行数据
 * @category container
 * @api dataKey - 数据绑定键（格式：table@rows）
 * @api children - 子组件配置数组（SparkNode[]）
 */
```

> **标签语义**：`@skill` = 类型名覆盖（可选，缺省从文件名推断），`@skill-description` / `@description` = 描述文字，`@category` / `@binding` / `@provides` / `@consumes` / `@notes` = 组件元数据字段。三者均被 parseSkillMeta L148 正则识别为有效标注。

| # | 检查项 | 通过标准 | ☐ |
|---|--------|---------|---|
| 1.1 | HTML 副本清除 | 每个双写 SFC 的 `<!--` 块中不再包含 `@skill` / `@skill-description` / `@category` 等元数据标签 | ☐ |
| 1.2 | 24 个双写 SFC 全部完成 | 终端脚本验证双写数 = 0 | ☐ |
| 1.3 | @skill 不一致修复 | RendererStepItem→`r-step-item`，RendererFieldScope→`r-field-scope`，RendererListItemScope→`r-list-item-scope`（HTML 值与 script 值一致） | ☐ |
| 1.4 | ADDENDUMS 内容迁移 | 7 条透传说明已写入对应 SFC 的 @api / @description JSDoc | ☐ |
| 1.5 | 3 个 Options API SFC 兼容 | parseSkillMeta 对 FieldDeptPicker/ProductPicker/UserPicker 仍能提取 @skill | ☐ |
| 1.6 | @api 格式定义 | 文档中定义 `@api propName - description` 格式 | ☐ |
| 1.7 | generate:catalog 通过 | `pnpm run generate:catalog` 组件数 ≥111 | ☐ |
| 1.8 | typecheck 通过 | `pnpm run typecheck` 退出码 0 | ☐ |

---

### Step 2: supplement.ts 精简（删死代码）

**目标**：删除死代码，只保留有消费者的导出。更新头部 JSDoc。

**具体动作**：
1. 删除 `CATALOG_OVERRIDES`（14 条条目，死代码，全仓库无消费者）
2. 删除 `CATALOG_ADDENDUMS`（7 条条目，死代码且内容已在 Step 1 迁入 SFC）
3. 保留 `SHARED_TYPE_DEFINITIONS`（json-catalog-generator.ts L567 消费）
4. 保留 `COMPONENT_CATEGORIES` + `ComponentCategory`（json-catalog-generator.ts L152 + index.ts 导出）
5. 更新头部 JSDoc（L6-7 仍提及 OVERRIDES/ADDENDUMS，需删除）

| # | 检查项 | 通过标准 | ☐ |
|---|--------|---------|---|
| 2.1 | OVERRIDES 删除 | grep `CATALOG_OVERRIDES` 仅在 git history | ☐ |
| 2.2 | ADDENDUMS 删除 | grep `CATALOG_ADDENDUMS` 仅在 git history | ☐ |
| 2.3 | 头部 JSDoc 更新 | supplement.ts 头部不再提及 OVERRIDES/ADDENDUMS | ☐ |
| 2.4 | 保留项存在 | `SHARED_TYPE_DEFINITIONS` + `COMPONENT_CATEGORIES` 仍导出 | ☐ |
| 2.5 | SHARED_TYPE_DEFINITIONS 消费连通 | json-catalog-generator.ts L567 编译通过 | ☐ |
| 2.6 | 编译通过 | `pnpm run typecheck` 退出码 0 | ☐ |

---

### Step 3: api-diff-report.ts 删除 + 测试清理

**目标**：删除 SSoT 下无用途的 QA 对比工具及其消费者。

**具体动作**：
1. 删除 `packages/vite-plugin-spark-catalog/src/api-diff-report.ts`
2. 更新 `index.ts`：删除 api-diff-report 相关导出（`generateDiffReport`, `formatDiffReport`, `ExtractedComponentApi`, `ComponentGapReport`, `DiffReportSummary`，共 5 个）
3. 更新 `tests/component-api-e2e.test.ts`：
   - 删除模块级 `diffCatalog`、`COMPONENT_CATALOG` 变量
   - 删除 `generateDiffReport`/`formatDiffReport`/`RawComponentCatalog` 的 import
   - 删除整个第二个 describe 块
   - 保留第一个 describe 块（VCM 4 case）并验证独立可运行
4. cli.ts 无需改动（审计确认未引用）

| # | 检查项 | 通过标准 | ☐ |
|---|--------|---------|---|
| 3.1 | 文件删除 | api-diff-report.ts 不存在 | ☐ |
| 3.2 | index.ts 更新 | 无 `generateDiffReport` 等 5 个导出 | ☐ |
| 3.3 | 测试清理 | component-api-e2e.test.ts 无 diff-report 相关 import/调用/变量 | ☐ |
| 3.4 | 孤立变量清理 | 模块级 `diffCatalog` / `COMPONENT_CATALOG` 已删除 | ☐ |
| 3.5 | VCM case 独立运行 | 第一个 describe 块单独运行通过 | ☐ |
| 3.6 | 外部引用清零 | grep `generateDiffReport\|formatDiffReport\|ComponentGapReport\|DiffReportSummary` 返回 0 | ☐ |
| 3.7 | 编译通过 | `pnpm run typecheck` 退出码 0 | ☐ |

---

### Step 4: 注册插件元数据产出删除 + 残留清理

**目标**：删除旧管线 `dist/spark-component-metadata.json` 产出及所有残留引用。

**⚠️ 约束**：注册插件内的 `parseSkillMeta` 副本**不删除**——它驱动 `virtual:spark-skill-catalog` 虚拟模块，被 `SkillCatalog.vue` 运行时消费。仅删除 `generateMetadataJson()` 的产出写入和 `writeBundle()` 钩子。

**具体动作**：
1. `tools/vite-plugin-spark-components.ts`：删除 `writeBundle()` 中写入 `spark-component-metadata.json` 的代码块
2. `tools/vite-plugin-spark-components.ts`：删除 `generateMetadataJson()` 方法（旧管线产物生成器，无消费者）
3. `scripts/iterate-ai-dataset-quality.ts` L72：更新第 3 个 fallback 路径（`dist/spark-component-metadata.json` → `component-catalog.json` 或删除该 fallback）
4. 验证 `scripts/build-all.mjs`：确认无 `spark-component-metadata.json` 引用
5. 验证 `scripts/upload-component-metadata.mjs`：确认读取 `component-catalog.json`
6. 验证 `scripts/iterate-ai-dataset-quality.ts` L69-76：`ComponentCatalog` 类型与 3-path fallback 兼容

| # | 检查项 | 通过标准 | ☐ |
|---|--------|---------|---|
| 4.1 | writeBundle 清理 | vite-plugin-spark-components.ts 无 `spark-component-metadata` 写入 | ☐ |
| 4.2 | generateMetadataJson 删除 | vite-plugin-spark-components.ts 无 `generateMetadataJson` 定义 | ☐ |
| 4.3 | 脚本残留清理 | iterate-ai-dataset-quality.ts 无 `spark-component-metadata` 引用 | ☐ |
| 4.4 | 类型兼容验证 | iterate-ai-dataset-quality.ts 的 `ComponentCatalog` 类型与 JSON 结构匹配 | ☐ |
| 4.5 | build-all 确认 | 无 `spark-component-metadata` 引用 | ☐ |
| 4.6 | upload 确认 | 读取 `component-catalog.json` | ☐ |
| 4.7 | 全仓库引用清零 | grep `spark-component-metadata` 仅在 git history + copilot-instructions.md（Step 7 处理） | ☐ |
| 4.8 | build:check 通过 | `pnpm run build:check` 退出码 0 | ☐ |

---

### Step 5: spark-ai/catalog/types.ts 精简（消除双写）

**目标**：消除 component-catalog-schema.ts 与 types.ts 的类型重复。

**⚠️ 约束**：
- **禁止 import from `@spark-view/vite-plugin-spark-catalog`**（spark-ai 不依赖构建工具包）
- `RawComponentCatalog`（4 字段）必须保留手写——无法从 JSON 推断（JSON 有 10 个字段，对齐的是 `ComponentCatalog`）
- `catalog-projections.ts` L53 `catalog.registry ?? { ... }` 如果 registry 变为 required，会触发 `no-unnecessary-condition` lint
- `exactOptionalPropertyTypes: true` 已启用于 3 个 tsconfig——optional→required 变更需注意类型兼容

**具体动作**：
1. `types.ts` 改为从 JSON shape 推断类型（`type ComponentCatalog = typeof import('./component-catalog.json')`），**或**收窄为最小化手写类型（仅保留消费侧真正需要的字段）
2. 保留 `RawComponentCatalog` 手写（4 字段，不可推断）
3. 统一命名：`BindingDescriptor` → `CatalogBindingDescriptor`（或反向，需确认消费侧命名偏好）
4. 连带更新 `catalog-projections.ts` 受影响的 import + `?? fallback` 处 lint 兼容
5. 连带更新 `spark-ai/src/index.ts` 的 re-export（L103-114）
6. 验证 `catalog-dev-exports.ts` 编译通过
7. 验证外部消费者编译通过：
   - `spark-ai/src/stills/meta-methods.ts`
   - `spark-ai/src/generate/generate-tools-catalog.ts`
   - `spark-ai/src/generate/generate-orchestrator.ts`
   - `tests/generate-fc-tools.test.ts`
   - `tests/component-api-e2e.test.ts`
   - `scripts/iterate-ai-dataset-quality.ts`

| # | 检查项 | 通过标准 | ☐ |
|---|--------|---------|---|
| 5.1 | 镜像注释删除 | types.ts 无 `⚠️ 保持与 component-catalog-schema.ts 同步` | ☐ |
| 5.2 | RawComponentCatalog 保留 | types.ts 仍导出 RawComponentCatalog（4 字段手写） | ☐ |
| 5.3 | 命名统一 | BindingDescriptor / CatalogBindingDescriptor 确认为同一命名 | ☐ |
| 5.4 | 依赖方向正确 | spark-ai 无 import from vite-plugin-spark-catalog | ☐ |
| 5.5 | projections lint 通过 | catalog-projections.ts 无 `no-unnecessary-condition` 警告 | ☐ |
| 5.6 | exactOptionalPropertyTypes 兼容 | optional→required 变更不破坏 3 个 tsconfig 下的编译 | ☐ |
| 5.7 | dev-exports 编译 | catalog-dev-exports.ts 编译通过 | ☐ |
| 5.8 | index.ts 导出 | spark-ai/src/index.ts re-export 无报错 | ☐ |
| 5.9 | 外部消费者编译 | 6 个外部文件全部编译通过 | ☐ |
| 5.10 | 大 JSON typecheck 性能 | `pnpm run typecheck` 时间无显著回归（111 组件 JSON） | ☐ |
| 5.11 | 编译通过 | `pnpm run typecheck` 退出码 0 | ☐ |

---

### Step 6: 全量验证

**目标**：确认所有变更不影响现有功能。

| # | 检查项 | 通过标准 | ☐ |
|---|--------|---------|---|
| 6.1 | catalog 生成 | `pnpm run generate:catalog` 组件数 ≥111 | ☐ |
| 6.2 | 类型检查 | `pnpm run typecheck` 退出码 0 | ☐ |
| 6.3 | 构建检查 | `pnpm run build:check` 退出码 0 | ☐ |
| 6.4 | 测试全绿 | `pnpm run test` 所有测试通过 | ☐ |
| 6.5 | catalog JSON 结构 | version 2.0.0，字段结构与变更前兼容 | ☐ |
| 6.6 | 死代码清零 | grep 以下模式全部返回 0（仅 git history 残留）：`CATALOG_OVERRIDES`、`CATALOG_ADDENDUMS`、`generateDiffReport`、`formatDiffReport`、`ComponentGapReport`、`DiffReportSummary`、`generateMetadataJson` | ☐ |
| 6.7 | 旧产物清零 | grep `spark-component-metadata` 返回 0（含 copilot-instructions.md 已更新） | ☐ |

---

### Step 7: 文档同步更新

**目标**：更新提示词文档中引用旧管线的描述。

**具体动作**：
1. `.github/copilot-instructions.md` L1597：更新构建管道描述
   - 旧：`dist/ + spark-component-metadata.json`
   - 新：`dist/ + component-catalog.json（唯一组件元数据产出）`
2. `.github/copilot-instructions.md` L1613：更新 Vite 插件描述
   - 旧：`SparkComponentsPlugin`（`tools/vite-plugin-spark-components.ts`）构建时提取组件元数据到 `dist/spark-component-metadata.json`
   - 新：`SparkCatalogPlugin`（`packages/vite-plugin-spark-catalog`）构建时提取组件元数据到 `component-catalog.json`

| # | 检查项 | 通过标准 | ☐ |
|---|--------|---------|---|
| 7.1 | 旧文件名清零 | copilot-instructions.md 无 `spark-component-metadata` 引用 | ☐ |
| 7.2 | 新描述准确 | 构建管道描述反映 `component-catalog.json` 作为唯一产出 | ☐ |
| 7.3 | 替换文本明确 | L1597 和 L1613 的新文本已写入 | ☐ |

---

## 6. 兼容性分析

| 维度 | 影响 | 说明 |
|------|------|------|
| catalog JSON 结构 | **无变更** | version 2.0.0 不变，字段名/结构不变 |
| parseSkillMeta | **保留** | v4 放弃删除，VCM 无法替代组件级元数据提取 |
| 后端 API | **无变更** | 上传路径已是 component-catalog.json |
| SFC 运行时行为 | **无变更** | 只改 JSDoc 注释，不改 defineProps/defineEmits/模板 |
| AI 生成质量 | **不变** | v4 不改 VcmApiDescriptor，parseSkillMeta 路径不变 |
| 外部消费者 | **需适配** | types.ts 形状可能微调，6 个消费文件需验证 |

---

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| ~~VCM 无法从 `<script setup>` JSDoc 提取 tags~~ | ~~中~~ **100%** | ~~阻塞~~ | **v4 已 bypass**：保留 parseSkillMeta，不依赖 VCM 组件级提取 |
| types.ts 改为 JSON 推断后形状不兼容 | 中 | 编译失败 | Step 5 逐文件验证 6 个消费者 |
| RawComponentCatalog 不可从 JSON 推断 | **已确认** | 改写失败 | 保留手写 4 字段类型 |
| `catalog.registry ?? fallback` 触发 lint | 中 | CI 红 | optional→required 变更前检查 exactOptionalPropertyTypes |
| ADDENDUMS 迁移后 SFC @api 信息不足 | 低 | 质量降级 | 逐条核对 7 条内容 |
| 3 个 Options API SFC 的 parseSkillMeta 不兼容 | 低 | 个别组件缺注解 | createPickerPreset 工厂 JSDoc 在 60 行 fallback 范围内 |
| 注册插件 parseSkillMeta 副本不能删 | — | SkillCatalog.vue 崩溃 | 明确标注保留，仅删 writeBundle + generateMetadataJson |

---

## 8. 步骤依赖图

```
Step 1 (SFC JSDoc 去双写) ─────────────┐
                                        ├── Step 6 (全量验证)
Step 2 (supplement 精简) ──────────────┤
                                        │
Step 3 (api-diff-report 删除) ─────────┤
                                        │
Step 4 (注册插件清理) ─────────────────┤
                                        │
Step 5 (types.ts 精简) ────────────────┘

Step 7 (文档同步) ── Step 6 之后
```

**关键路径**：Step 1 → Step 2（ADDENDUMS 迁移后才能删死代码）→ Step 6（全量验证）

**可并行**：Step 2/3/4/5 之间互不依赖，Step 1 完成后可并行执行。

**v4 vs v3 变化**：关键路径从 `Step 1→2→5` 缩短为 `Step 1→2`——去除了 VCM 扩展/parseSkillMeta 删除/generator 适配三个无效步骤。

---

## 9. 禁止事项（Protocol 约束）

- **F2**: 阶段 1-5 禁止编辑源码文件
- **F4**: 禁止跳过逆向提问阶段
- **F10**: 禁止跳过充分性自评
- **F13**: 逆向提问必须一问一答
- **F14**: 未经批准禁止实施
- **F15**: 禁止修改协议文件本身

---

## 10. v3→v4 修订摘要

| 项 | v3（已废弃） | v4（当前） | 原因 |
|----|-------------|------------|------|
| 架构方案 | 全量 VCM 替代 parseSkillMeta | **Path C 混合**：VCM（prop 级）+ parseSkillMeta（组件级） | VCM 实验 4 组实锤 |
| Step 数 | 10 | **7** | 删除 3 个无效步骤（VCM 扩展/parseSkillMeta 删除/generator 适配） |
| Q4 决策 | 从 VCM tags 提取，删 parseSkillMeta | 保留 parseSkillMeta，VCM 仅 prop/emit 级 | ComponentMeta 无 tags，description=undefined |
| ADDENDUMS 数量 | 10 条 | **7 条** | read_file 实测确认 |
| 双写 SFC 数量 | 未明确 | **24 个**（含 SparkComponentRenderer.vue） | 终端实测 |
| @skill 不一致 | 未明确 | **3 处**（RendererStepItem/FieldScope/ListItemScope） | 终端实测 |
| VCM 提取组件级概率 | "中" | **100% 不可行** | 实验实锤 |
| "从 description 正则提取" fallback | 列为缓解 | **无效**（description=undefined） | 实验实锤 |
| 检查项总数 | 57（10 步） | **57（7 步）** | 删除 3 个无效步骤（15 项），补齐 15 条遗漏 |
