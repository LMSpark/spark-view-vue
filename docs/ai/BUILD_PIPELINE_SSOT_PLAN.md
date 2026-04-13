# 构建管线 SSoT 收敛实施计划 v5

> 日期：2026-04-13
> 协议：docs/ai/AI_CODE_CHANGE_PROTOCOL.md
> 阶段：6 / 6 已执行
> 状态：已实施

---

## 任务目标

在不改变“单一 catalog 产物”总体架构的前提下，收敛旧 v4 计划中已经过时或已经完成的部分，实施一轮最小且可验证的代码改造，使组件目录生成链路在生成器层具备更强的单一出口约束、自纠正能力和旧产物清理能力。

本轮目标同时包含两部分：

1. 方案层：将旧的 v4 大计划改写为面向当前代码现实的 v5 收敛实施计划。
2. 代码层：围绕 packages/vite-plugin-spark-catalog 生成器链路实施最小闭环改造，继续巩固 component-catalog.json 作为唯一目录产物的地位。

---

## 阶段 3 充分性评估

基于阶段 1 阅读和阶段 2 的 10 题问答，信息已充分，可以进入方案编写。

### 已锁定的用户决策

1. 本轮不是只改文档，方案和代码都要改。
2. 变更可以跨多类文件，但主线必须始终围绕“单一 catalog 产物”。
3. 本轮不动 packages/spark-ai/src/catalog/types.ts 及其消费侧类型镜像收敛问题。
4. 主要 guard 放在生成器层，优先改 packages/vite-plugin-spark-catalog/src。
5. SFC 元注解仅修会直接影响 catalog 生成结果的问题，其余历史写法不做批量整理。
6. 如发现旧产物名、重复输出口或错误上传源，优先自动纠正到单一产物路径后继续执行。
7. 如磁盘上仍存在旧产物文件，允许自动删除。
8. 自动删除仅限“当前生成目标附近且文件名精确命中旧产物名”的文件，避免误删无关文件。
9. 首次实质改动后的首个验证动作优先执行 pnpm run generate:catalog。
10. 方案文档必须写到“详细实施计划 + 明确不做项”的粒度，避免实施时顺手扩散。

结论：当前不存在必须继续追问才能决定实现路径的关键歧义。

---

## 影响范围

### 计划内修改文件

1. docs/ai/BUILD_PIPELINE_SSOT_PLAN.md
   - 用 v5 正式替换旧 v4 正文。
   - 写入本轮实施目标、影响范围、技术方案、兼容性、验证计划、风险项。
   - 明确列出“本轮不做项”。

2. packages/vite-plugin-spark-catalog/src/json-catalog-generator.ts
   - 抽离或内聚“唯一目录输出目标”的控制逻辑。
   - 在真正写入 component-catalog.json 之前或之后，执行生成器层的旧产物清理逻辑。
   - 保证生成器最终只认一个 canonical 输出路径。

3. packages/vite-plugin-spark-catalog/src/plugin.ts
   - 让 HMR 触发的再生成逻辑与 canonical 输出目标保持一致。
   - 如有需要，将提示信息或调用链对齐到统一的输出目标语义。

4. packages/vite-plugin-spark-catalog/src/cli.ts
   - 让 CLI 层与生成器层共享同一套 canonical 输出语义。
   - 如果发现描述或行为上存在多出口暗示，统一收敛到单一产物表述。

5. tests/catalog-output-guard.test.ts
   - 新增一组面向“单一产物出口 + 旧产物清理”的最小测试。
   - 覆盖 canonical 输出路径、近邻旧产物清理、误删边界这三类场景。

### 计划内可能涉及但默认不改的文件

1. packages/vite-plugin-spark-catalog/src/index.ts
   - 仅当需要导出新的内部辅助方法供测试复用时才调整。
   - 若无需暴露新 API，则不修改。

2. packages/vite-plugin-spark-catalog/src/utils.ts
   - 仅在确实需要放置内部辅助函数时考虑。
   - 默认不动。

### 本轮明确不做

1. 不改 packages/spark-ai/src/catalog/types.ts。
2. 不做 spark-ai 消费侧 contract 去重。
3. 不批量整理 SFC 顶部 JSDoc / @skill / @skill-description 历史写法。
4. 不修改 component-catalog.json 的 schema 结构、version、消费协议。
5. 不新增第二份 catalog 产物、镜像产物或兼容产物。
6. 不改 Java 后端 API、上传协议或 component-metadata 持久化格式。
7. 不顺手清理与本轮生成器闭环无关的历史文档或测试。

---

## 技术方案

### 设计判断

当前真实控制点已经很明确：

1. 组件目录的实际写出动作发生在 packages/vite-plugin-spark-catalog/src/json-catalog-generator.ts。
2. 当前 canonical 输出路径已经固定为 packages/spark-ai/src/catalog/component-catalog.json。
3. plugin.ts 与 cli.ts 是生成器的两个主要入口，但目前主要是“调用 generateJsonCatalog”，对单一出口约束没有独立的保护逻辑。
4. 当前仓库代码中虽然旧产物引用已大体清理，但生成器本身仍缺少“看到历史产物就自纠正/自清理”的收口动作。

因此，本轮实现不做架构迁移，而是在生成器层补一层“单一出口守卫”。

### 实现步骤

#### Step 1：重写计划文档为 v5

目标：先把旧 v4 文档替换为符合当前代码现实和用户问答结果的 v5 计划。

动作：

1. 删除旧 v4 的“大范围待实施”叙事。
2. 将本轮实施范围收敛到生成器层守卫和最小验证闭环。
3. 在文档中明确“本轮不做项”，防止实施扩散。

#### Step 2：在生成器层建立 canonical 输出守卫

目标：让 json-catalog-generator.ts 成为单一输出目标的唯一执行锚点。

动作：

1. 将 component-catalog.json 的 canonical 输出路径集中为一处常量或一处内部辅助函数。
2. 所有真正的写文件动作统一从该 canonical 目标落盘。
3. 若调用链上出现与 canonical 路径不一致的目标概念，只允许在生成器层自动纠正，不向外扩散多出口语义。

约束：

1. 不增加新的公开构建配置入口。
2. 不允许引入第二输出路径作为兼容兜底。
3. 不允许为了兼容旧流程而重新写出 component-catalog.ai.json 或 spark-component-metadata.json。

#### Step 3：在生成目标附近清理精确命中的旧产物

目标：把“旧产物回流”处理为生成器层自清理，而不是靠人工记忆。

动作：

1. 只在当前 canonical 输出目录附近执行清理。
2. 只删除文件名精确命中的历史旧产物。
3. 当前优先纳入清理名单的文件名：
   - component-catalog.ai.json
4. 若未来需要扩充清理名单，必须仍满足“精确命名 + 临近 canonical 输出目录”这两个条件。

明确不做：

1. 不进行全仓扫描删除。
2. 不删除 dist 下的任意同名文件，除非它也被纳入“当前生成目标附近”的严格范围。
3. 不对模糊匹配文件名执行删除。

#### Step 4：入口层语义收口

目标：让 plugin.ts / cli.ts 在行为和日志上都只表达“单一 catalog 产物”。

动作：

1. 检查 plugin.ts 的 HMR 再生成调用与输出描述。
2. 检查 cli.ts 的命令说明、日志文案和调用语义。
3. 如存在多出口暗示、旧名暗示或歧义文案，统一改为 canonical 单一产物表述。

注意：

1. 入口层不另起一套清理逻辑。
2. 真正的守卫和清理仍放在生成器层。

#### Step 5：补一组最小防回归测试

目标：为本轮新增的单一出口守卫建立最小自动化约束。

动作：

1. 新增 tests/catalog-output-guard.test.ts。
2. 测试至少覆盖以下场景：
   - canonical 输出目标固定为 component-catalog.json
   - 若临近目录存在 component-catalog.ai.json，则生成后会被清理
   - 不会删除非精确命名、非近邻目录的文件

约束：

1. 测试必须聚焦本轮新增守卫，不顺带覆盖 catalog 全量结构。
2. 若实现不需要新增可导出辅助函数，则测试通过现有生成器入口或内部可测试模块完成。

---

## 兼容性分析

### 对现有功能的影响

1. component-catalog.json 的结构和消费者不应变化。
2. build-all.mjs 与 upload-component-metadata.mjs 继续读取同一 canonical 产物。
3. HMR 和 CLI 的再生成行为保持存在，只是输出语义更收敛。
4. 若目录附近存在历史旧产物，本轮会在生成时自动删除，这属于用户明确批准的行为。

### 破坏性变更

存在一项受控破坏性变更：

1. 生成器会自动删除 canonical 输出目录附近、且文件名精确命中的旧产物文件。

缓解条件：

1. 删除范围被严格限制在近邻目录。
2. 删除条件是“精确命名”，不是模糊匹配。
3. 不进行全仓扫描或通配删除。

---

## 验证计划

### 首个最小验证动作

根据用户明确要求，首次实质改动后的第一个验证动作优先为：

1. pnpm run generate:catalog

通过标准：

1. 命令成功退出。
2. packages/spark-ai/src/catalog/component-catalog.json 正常生成或更新。
3. 若近邻旧产物存在，则被按预期清理。

### 后续验证

1. 定向测试：
   - npx vitest run tests/catalog-output-guard.test.ts
2. 类型检查：
   - pnpm run typecheck
3. 如本轮实际改动波及构建入口语义，再补：
   - pnpm run build:check

### 人工验证场景

1. 在 canonical 输出目录旁手动放置 component-catalog.ai.json，执行 pnpm run generate:catalog，确认文件被清理。
2. 确认 component-catalog.json 仍然落在 packages/spark-ai/src/catalog/。
3. 确认 CLI / HMR 日志不再暗示多输出口或历史产物名。

---

## 风险项

1. 风险：自动删除误伤用户自留文件。
   - 缓解：只删近邻目录、只删精确命名的历史旧产物。

2. 风险：生成器层和入口层各自实现一套守卫，导致语义再次分裂。
   - 缓解：守卫逻辑只放生成器层，plugin.ts / cli.ts 仅做语义收口，不复制清理逻辑。

3. 风险：为了写测试而引入不必要的公开 API。
   - 缓解：优先使用内部可测试实现；只有在必要时才新增最小内部导出，且不扩展公共消费面。

4. 风险：顺手把类型镜像、SFC 注解治理等历史议题重新带入本轮。
   - 缓解：文档中明确列入“本轮不做项”，实施时不得越界。

---

## 执行结果

### 本轮实际落地

1. 已将旧 v4 计划重写为当前的 v5 收敛实施计划。
2. 已在 packages/vite-plugin-spark-catalog/src/json-catalog-generator.ts 中落地 canonical 输出路径 helper。
3. 已在同一生成器控制点中加入近邻旧产物 component-catalog.ai.json 的精确清理逻辑。
4. 已新增 tests/catalog-output-guard.test.ts，覆盖 canonical 输出路径、近邻旧产物清理和误删边界。
5. 经检查，plugin.ts 与 cli.ts 当前语义已与单一 component-catalog.json 产物一致，因此本轮未再做额外修改。

### 本轮验证结果

1. 已执行 pnpm run generate:catalog，并验证：
   - component-catalog.json 正常生成
   - 临时放置的 component-catalog.ai.json 被自动清理
2. 已执行 npx vitest run tests/catalog-output-guard.test.ts --reporter verbose，3 个测试全部通过。
3. 已执行 pnpm run typecheck，类型检查通过。
