# spark-project-model 代理说明

这些规则适用于 `packages/spark-project-model/` 下的修改。

## 目标方向

**设计即编辑**，不要在文档或命名里制造「设计层 vs 编辑层」对立。

**模型是 class 层级**：`ProjectModel` 为根，导航/页面用 `ProjectNode` 子类树，页面内容为 `PageRuleFile` 等 class；`ProjectNodeData` 等 type 仅用于 API/序列化，不要当包内主模型。新增能力优先加 class/子类或 `ProjectModel.design` 聚合，而不是扩一套平行 DTO。

```text
ProjectModel — 设计内容 + runtime（领域结构与类型）
ProjectEditor — 设计门面：API + session + subscribe + 落盘（实现分工，语义同属设计）
```

- `design` / `runtime` 的划分是「塑造中的软件」vs「跑起来的投影」，不是 design vs edit。
- selected、dirty、working DTO 是设计过程态，放在 ProjectEditor 是为避免 HTTP/会话耦进类型包，不是另一套业务语义。

## 当前结构优先

当前运行源码使用：

```text
model/project/       ProjectModel、ProjectDesign、NavigationDesign、ProjectRuntime
model/navigation/    ProjectNode 子类、NavigationIndex
model/page/          ConfigPageNode、PageDesign、四文件
model/serialization/ compiler 纯函数（禁止 model→io）
facade/              ProjectEditor + editor-session + 协作者
factory/             PageNodeFactory
io/                  file/navigation/loader/reference/http
```

根入口：`index.ts`（model + factory）、`project.ts`（facade）。DevSystem 设计器制品在 `src/services/project-model-artifacts/`。改代码时先归位到正确目录，再改 import。

`src/MODEL-HIERARCHY.md` 与 `src/STRUCTURE.md` 是当前源码地图。

## 边界文化

- **存储真源**只有 DB navigation + page files；commit 只落这里。
- **领域模型不必与存储同构**：允许树/索引/派生字段；禁止再养一份可独立落盘的第二业务真源。
- load/save 由 `ProjectEditor` 与 infra 适配；保存必须映射到 `nodeId`、`pageId`、文件锚点，不要求模型内存形状等于表或文件布局。
- ProjectModel 可持有 headless runtime；运行诊断应能指回设计节点或存储锚点。
- ProjectModel 不得直接持有 Vue component instance、DOM、Vue Router instance、Element Plus API 或浏览器全局对象作为状态。
- `ProjectEditor` 是 AI + DevSystem 共用的**设计门面**；CRUD/save/diagnostics 都是设计动作。
- **模型 vs 实例**：包内是 class **类型**（`ProjectModel`、`ProjectEditor`）；运行时 **领域实例** 为 `editor.project`，**门面实例** 由 APP `getAppProjectEditor()` 托管。勿把 `ProjectEditor` 叫「模型实例」。
- **AI 门面**：DevSystem 内 AI 用 `getAppProjectEditor()`；隔离 Host Run 用 headless `createProjectEditor()`（见 app `page-design-host-run-provider.ts`）。
- 包内不持有全局单例；登录后 `ingestNavigationRoot` 写入 `editor.project`。
- DevSystem 只暴露 `editor = getAppProjectEditor()`（门面）；Vue 经 `state.editor.*` 改领域，用 `readSnapshot()` 投影，不得自建 `ProjectModel` 或平行「文件 API」。
- 类型主语仍是 `ProjectModel`；`ProjectEditor` 编排对外设计与存储映射，并用 `subscribe` 通知 UI。
- `ConfigPageNode` 后续应被理解为 ProjectModel 下的 page design + page runtime 节点，而不是孤立页面文件模型。
- 缺失 API、无效配置、未加载页面、状态不一致必须 fail-fast。

## 公共出口

跨包消费只能使用：

```text
@spark-appworks/spark-project-model
@spark-appworks/spark-project-model/project
```

包外不要相对导入本包 `src/*`。包内测试可以测内部函数，但必须引用当前真实路径，例如 `../src/model/navigation/edit`。

## AI 边界

- page-design 的模型根是 `ProjectModel`。
- page-design AI 注册属于 app/service 层，不属于 `spark-project-model`。
- `AiModule` metadata 不得承诺未注册的函数、属性或子模块。
- LLM 可见能力说明优先写在 class/function 首次声明处。

## 验证

文档改动至少做计划中约定的静态核对，确保没有把 ProjectModel 限定回窄模型，也没有把 ProjectEditor 写成模型主语。

实现改动后至少运行：

```bash
pnpm --dir packages/spark-project-model run typecheck
```

触及编辑器、导航、四文件模型、AI metadata 时继续运行：

```bash
pnpm --dir packages/spark-project-model run test:run
```
