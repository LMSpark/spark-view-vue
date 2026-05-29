# @spark-view/spark-page-config 架构文档

> 版本 0.3.6 | 2026-05-30 | 包大小 ~35 源文件 | 12 测试文件 · 169 用例

---

## 一、包定位

`spark-page-config` = **PageModel（数据）+ 围绕它的增删改查工具链**。

```
                        ┌─────────────────────┐
                        │      PageModel       │
                        │     （数据真源）        │
                        │  navigation / rule   │
                        │  dataSet / style     │
                        │  script              │
                        └──────────┬───────────┘
                                   │
        ┌──────────────┬───────────┼───────────┬──────────────┐
        │              │           │           │              │
        ▼              ▼           │           ▼              ▼
   ┌─────────┐   ┌─────────┐      │      ┌─────────┐   ┌─────────┐
   │ Create  │   │  Read   │      │      │ Update  │   │ Delete  │
   │FileApi  │   │Loader   │      │      │Editor   │   │FileApi  │
   │createPg │   │loadRule │      │      │AiModule │   │deletePg │
   │mount    │   │loadData │      │      │NavEdit  │   │unmount  │
   └─────────┘   └─────────┘      │      └─────────┘   └─────────┘
                                  │
                    独立子系统（不操作 PageModel）：
                    json-document/  leave-request/
```

`PageModel` 是页面在运行时的唯一数据真源。包内所有其他模块按 CRUD 角色组织——详见[第三章](#三crud-操作总览)。独立子系统 `json-document/` 和 `leave-request/` 不依赖 PageModel，详见该章末尾。

---

## 二、PageModel 聚合根 — 数据层

`PageModel` 是本包所有模块 Create / Read / Update / Delete 的**目标数据**。它组合 5 个子模型，是页面在内存中的唯一投影。

```
PageModel (聚合根)
  │
  ├── pageId: string                          ← 页面唯一标识
  ├── isLoaded: boolean                       ← 四文件是否已加载
  ├── navigation: NavigationDraftModel        ← 导航草稿模型 (18 字段)
  ├── rule: PageRuleModel                     ← rule.json (SparkNodeTree)
  ├── dataSet: PageDataSetModel               ← pagedata.json (DataSetCrudTool)
  ├── script: PageTextModel                   ← script.js (SnapshotHistory)
  ├── style: PageTextModel                    ← style.css (SnapshotHistory)
  │
  ├── load(loader, options?)                  ← Promise.all 并行加载 4 子模型
  ├── save(config?)                           ← 保存单个文件
  ├── saveDirtyFiles()                        ← 保存所有脏文件
  ├── createFiles(api, rule?, data?)          ← 创建新页面四文件
  ├── deleteFiles(api)                        ← 删除页面四文件
  ├── mount(navClient, parentPageId, index?)  ← 挂载到导航
  ├── createMounted(...)                      ← 创建并挂载新页面
  ├── removeMounted(...)                      ← 卸载并删除页面
  ├── isDirty() / dirtyParts()                ← 脏状态追踪
  └── listVersions() / restoreVersion()       ← 版本管理
```

**PageModel 方法按 CRUD 分类：**

| CRUD | 方法 | 说明 |
|------|------|------|
| **Create** | `createFiles`, `mount`, `createMounted` | 创建四文件、挂载导航、或两者合并 |
| **Read** | `toRenderConfig`, `isDirty`, `dirtyParts`, `isLoaded`, `getFileText` | 渲染层唯一读口、脏状态查询 |
| **Update** | `save`, `saveDirtyFiles`, `saveFile`, `restoreVersion`, `load`, `loadFile` | 持久化修改、版本恢复、重新加载 |
| **Delete** | `deleteFiles`, `unmount`, `removeMounted` | 删除文件、卸载导航、或两者合并 |

> **navigation 不在四文件中。** navigation 是 PageModel 的子模型，但持久化走 `NavigationConfigClient`（导航树 API），不走 `PageConfigFileApi`（四文件 API）。四文件是 `rule.json` / `pagedata.json` / `script.js` / `style.css`，是页面模型的持久化资产，但不是完整页面模型。

**子模型统一契约：**

```
每个子模型都实现:
  load(pageId, configLoader)    ← 从 ConfigLoader 加载
  save(pageId, fileApi)         ← 通过 FileApi 保存
  restoreVersion(command)       ← 恢复历史版本
  resetToEmpty()                ← 重置为空状态
  markDirty() / markSaved()     ← 脏状态标记
  isDirty                       ← 是否脏
  undo() / redo() / canUndo / canRedo  ← 撤销/重做
```

这个统一契约让所有 CRUD 操作可以一致地处理任意子模型——Read（load）、Update（save / restoreVersion）、Delete（resetToEmpty）都通过同一接口工作。

---

## 三、CRUD 操作总览

以 PageModel 为数据中心的四类操作：

```
                         ┌──────────────────────────────────┐
                         │           spark-app              │
                         │         (Vue 应用层消费)           │
                         └───┬──────────┬──────────┬────────┘
                             │          │          │
                    ┌────────▼──┐ ┌─────▼────┐ ┌──▼──────────┐
                    │   Read    │ │  Update  │ │Create/Delete│
                    └────┬──────┘ └─────┬────┘ └──┬──────────┘
                         │              │          │
                    ┌────▼──────────────▼──────────▼────────┐
                    │            PageModel                  │
                    │           （数据真源）                   │
                    │                                       │
                    │  navigation  rule  dataSet  style     │
                    │  (草稿)      (树)  (表)     (文本)     │
                    │  script                                │
                    │                                       │
                    │  isDirty / load / save / toRenderConf │
                    └───────────────────────────────────────┘
```

| CRUD | 模块 | 关键入口 | 涉及远端 |
|------|------|----------|----------|
| **Create** | `config/` + `editor/` | `PageConfigFileApi.createPage()`, `PageEditor.createMountedPage()` | 是 |
| **Read** | `config/` | `PageConfigLoader` — 远端四文件 → 编译 → 装入 PageModel | 是 |
| **Update** | `editor/` + `design/` + `ai/` + `navigation/` | `PageEditor`(手动), `PageDesignService`(AI 桥接), 5 子 AiModule(LLM 工具, ~68 action) | 否（仅内存，save 时才持久化） |
| **Delete** | `config/` + `editor/` | `PageConfigFileApi.deletePage()`, `PageEditor.removeMountedPage()` | 是 |

**关键区别：** Create / Read / Delete 必定涉及远端 API（文件 API + 导航 API）。Update 操作仅修改内存 PageModel 并标记 dirty；持久化由 `PageModel.saveDirtyFiles()` 单独触发。

### 数据流：Read → PageModel → Update → 写回

```
PageConfigLoader (Read: 远端 → 编译 → PageModel)
  │
  ├── fileLoader.load("/{pageId}/rule.json")    ──→ compileRule()    ──→ page.rule.tree
  ├── fileLoader.load("/{pageId}/pagedata.json") ──→ parsePageData()  ──→ page.dataSet.tool
  ├── fileLoader.load("/{pageId}/script.js")    ──→ parseScript()    ──→ page.script.text
  └── fileLoader.load("/{pageId}/style.css")    ──→ parseCss()       ──→ page.style.text
         │
         ▼
  PageModel (内存数据真源，5 子模型各维护 dirty/undo/redo)
         │
         ▼  (用户操作 / AI 工具调用 → 修改 PageModel 子模型)
         │
         ▼
  PageModel.saveDirtyFiles() (Update → 写回远端)
    ├── rule.save()    → PageConfigFileApi.saveFileContent()
    ├── dataSet.save() → PageConfigFileApi.saveFileContent()
    ├── script.save()  → PageConfigFileApi.saveFileContent()
    └── style.save()   → PageConfigFileApi.saveFileContent()
```

### 独立子系统（不操作 PageModel）

| 子系统 | 定位 | 关键入口 |
|------|------|----------|
| `json-document/` | 通用 JSON 树编辑 | `JsonDocumentRuntime` |
| `leave-request/` | 独立 AI 业务参考实现 | `createLeaveRequestBusinessRegistration()` |

---

## 四、Read — 配置加载与编译

Read 操作负责将远端四文件拉取、编译并装入 PageModel。它是**唯一有编译步骤的 CRUD 操作**——其他三个操作直接操作内存 PageModel 结构。

### 职责分离

```
PageConfigLoader (管"怎么加载")
  └── FileLoader.withTransform(compileRule)  ← 编译缓存
        └── compileRule (管"怎么解析")  ← page-config-compiler.ts
```

| 组件 | 文件 | 职责 |
|------|------|------|
| `BasePageConfigLoader` | `config/config-types.ts` | 抽象类：定义 `loadPageConfig` / `loadRule` / `loadPageData` / `loadScript` / `loadCss` / `loadPageFileContent` 契约 |
| `PageConfigLoader` | `config/page-config-loader.ts` | 具体实现：FileLoader + 编译缓存 + 作用域管理 |
| `compileRule` | `config/page-config-compiler.ts` | rule.json 文本 → `SparkNode[]` |
| `parsePageData` | `config/page-config-compiler.ts` | pagedata.json 文本 → `DataSet` |
| `parseScript` | `config/page-config-compiler.ts` | script.js 文本 → `string` |
| `parseCss` | `config/page-config-compiler.ts` | style.css 文本 → `string` |
| `PageConfigFileRegistry` | `config/config-types.ts` | 文件注册表：声明哪些文件存在且是否必需 |
| `ConfigLoaderOptions` | `config/config-types.ts` | 加载器配置：apiBaseUrl、缓存策略、超时、请求头 |

### Read 的多条路径

除了 PageConfigLoader 的主路径，还有其他 Read 入口：

| 路径 | 入口 | 说明 |
|------|------|------|
| 主加载 | `PageConfigLoader.loadPageFileContent()` | 远端 → 编译 → PageModel |
| 快照读取 | `PageEditor.readSnapshot()` | 内存 PageModel → 消费层即时投影 |
| 渲染读取 | `PageModel.toRenderConfig()` | 渲染层唯一读口，直接投影内存数据 |
| AI 知识读取 | `payload-catalog.queryPayloads / guidePayload` | 读取组件目录（不修改 PageModel，见第七章） |
| AI 流程读取 | `lifecycle.describeProgress / describeDesignFlow` | 读取编辑状态和流程知识 |

---

## 五、Create & Delete — 页面生命周期

Create 和 Delete 共享同一组模块（`PageConfigFileApi`、`PageEditor`、`PageModel`），代表页面在系统中的生灭。

### Create 三级操作

| 操作 | 方法 | 创建四文件 | 注册导航 | 说明 |
|------|------|-----------|----------|------|
| 仅文件 | `PageModel.createFiles()` | 是 | 否 | 创建四文件，不挂载到导航树 |
| 仅导航 | `PageModel.mount()` | 否 | 是 | 在导航树中添加页面节点 |
| 文件 + 导航 | `PageModel.createMounted()` | 是 | 是 | 创建文件并挂载导航（最常用） |

`PageEditor` 提供对应的聚合入口：`createPageFiles()`、`createMountedPage()`、`createPageForSelectedNode()`，额外处理选中节点绑定和导航草稿。

### Delete 三级操作

| 操作 | 方法 | 删除四文件 | 卸载导航 | 说明 |
|------|------|-----------|----------|------|
| 仅文件 | `PageModel.deleteFiles()` | 是 | 否 | 删除四文件，保留导航节点 |
| 仅导航 | `PageModel.unmount()` | 否 | 是 | 从导航树移除，保留文件 |
| 文件 + 导航 | `PageModel.removeMounted()` | 是 | 是 | 卸载并删除（最常用） |

### 导航 CRUD 独立管线

导航的 Create / Update / Delete 走独立的 `NavigationConfigClient`（远端 CRUD），不经过四文件 API。`NavigationEditSession` 在内存中维护导航树副本，`NavigationDraftModel` 跟踪单个页面导航节点的脏状态。

---

## 六、Update — 编辑子系统

Update 是唯一**不直接涉及远端**的 CRUD 操作。它修改内存 PageModel 子模型并标记 dirty，持久化由独立的 save 步骤触发。

### 三条 Update 路径

```
spark-app (用户 / AI)
  │
  ├── 1. 手动编辑 ──→ PageEditor ──→ PageModel 子模型
  │
  ├── 2. AI 编辑   ──→ PageDesignService ──→ PageDesignEditHost (8 槽位) ──→ PageModel 子模型
  │
  └── 3. 导航编辑  ──→ NavigationEditSession ──→ PageModel.navigation
```

### PageDesignEditHost — Update 的 AI 契约

AI 系统通过 8 个可选回调槽位操作 PageModel，不直接访问子模型：

| 槽位 | 类型 | 目标子模型 |
|------|------|-----------|
| `getNodeTree` / `onNodeTreeChanged` | Read / Write | `rule` |
| `getDataSetTool` / `onDataSetChanged` | Read / Write | `dataSet` |
| `readScript` / `writeScript` | Read / Write | `script` |
| `readStyle` / `writeStyle` | Read / Write | `style` |

`PageEditor.createPageDesignEditHost({ pageId })` 创建此契约实例。AI 会话必须绑定目标 pageId，写入只进入内存 PageModel 标 dirty，不自动保存、不创建版本、不刷新路由。

### save 管线

```
PageModel.saveDirtyFiles()
  ├── rule.isDirty    → rule.save()    → PageConfigFileApi.saveFileContent(rule.json)
  ├── dataSet.isDirty → dataSet.save() → PageConfigFileApi.saveFileContent(pagedata.json)
  ├── script.isDirty  → script.save()  → PageConfigFileApi.saveFileContent(script.js)
  └── style.isDirty   → style.save()   → PageConfigFileApi.saveFileContent(style.css)

PageModel.navigation.isDirty → navigation.save() → NavigationConfigClient.updateNode()
```

---

## 七、AI 子系统深度剖析

AI 子系统是 Update 支柱中最复杂的实现。LLM 通过 5 个子 kind 的 ~68 个 action 读取 PageModel 状态并写入修改。

### 7.1 模块编排

```
createPageDesignBusinessRegistration(options)
  │
  └── createPageDesignBusinessKindDefinition(options)
        │
        ├── new PageDesignService({ getEditHost })     ← 业务服务层
        ├── new AiModuleRuntime()                     ← AI 模块运行时
        │
        ├── register(PageDesignRootAiModule)           ← 根 kind: 实例发现
        ├── register(PageDesignLifecycleAiModule)      ← 流程控制
        ├── register(PageDesignTextModelAiModule)      ← script/style 编辑
        ├── register(PageDesignPayloadCatalogAiModule) ← 组件知识库
        ├── register(PageDesignNodeTreeAiModule)       ← rule.json 编辑
        └── register(PageDesignDatasetAiModule)        ← pagedata.json 编辑
              │
              ▼
        AiAgentDefinition {
          runtime, inputContract, sessionStore,
          systemPrompt, onStartSession,
          afterFunctionCall, releaseModuleInstance
        }
```

### 7.2 五个子 Kind 职责矩阵

每个子 kind 的 action 按 Read / Write 区分。**关键修正：payload-catalog 是纯 Read**——它查询组件目录，不修改 PageModel 任何子模型。

```
pageDesign (root) ──实例发现与子模块路由
  │
  ├── lifecycle (3 动作) ── 元操作
  │   bootstrap()          写入：自动校验 live binding          ← Write (setup)
  │   describeProgress()   读取：查询编辑运行状态               ← Read
  │   describeDesignFlow() 读取：查询 100 步流程/任务知识       ← Read
  │
  ├── payload-catalog (2 动作) ── 【纯 Read】
  │   queryPayloads()      读取：按 category/keyword 浏览组件   ← Read
  │   guidePayload()       读取：获取单个组件的完整 paramsSchema  ← Read
  │   → 不修改 PageModel，作为 node-tree Write 的知识前置
  │
  ├── dataset (~40 动作) ── 【纯 Write】步骤 21-88
  │   表/列/视图/行/关系/依赖/聚合/计算列 的 CRUD   ← Write (dataSet)
  │
  ├── node-tree (19 动作) ── 【Read + Write】步骤 89-92
  │   10 读取 + 9 写入 + 8 步写入前校验流水线
  │   Read:  getNode, findNode, listNodes...      ← Read
  │   Write: addNode, updateNode, deleteNode...   ← Write (rule)
  │
  └── text-model (4 动作) ── 【Read + Write】步骤 93-96
      Read:  readScript, readStyle                ← Read
      Write: writeScript, writeStyle              ← Write (script/style)
```

**AI 子系统 action 统计：**

| 分类 | 数量 | 子 kind |
|------|------|---------|
| 纯 Read | ~17 | lifecycle 2 + payload-catalog 2 + node-tree 10 + text-model 2 + 少量 dataset read |
| 纯 Write | ~49 | dataset ~40 + node-tree 9 + text-model 2 |
| 元操作 | 1 | lifecycle.bootstrap（Write setup） |

### 7.3 写入顺序强制

Update 操作的数据完整性保障——LLM 必须按 dataset → node-tree → text-model 顺序写入：

```
dataset（先建数据表）
  │
  ▼
node-tree（再搭页面结构）
  │  validateDataFirst(): 没有 DataTable 时拒绝写目录组件
  │  validateWritableNodeTypes(): 只允许 catalog 组件或 native HTML
  │  validateWrittenNodeIds(): 每个节点必须有稳定 id
  │  validateCompleteContainerWrite(): 禁止只写空容器壳
  │  ensurePayloadGuides(): 组件 guide 必须存在
  │  validateNodePayloadProps(): 按 paramsSchema 校验 props
  │  validateRequiredDataBindings(): r-form/r-detail 需要 contextDataMember
  ▼
text-model（最后补脚本和样式）
  validateScriptServiceContract(): 检查禁止的伪 API
```

### 7.4 AI 会话生命周期

```
1. onStartSession
   └── service.bootstrap() → 校验 nodeTree/dataset/text-model binding 是否就绪

2. toOrchestration → 生成首轮 tool_call
   └── module_find("pageDesign") → describeProgress() → describeDesignFlow(intent)

3. LLM 自主循环
   └── 按 100 步流程，通过 5 子 kind 的 module_call 读/写 PageModel

4. afterFunctionCall
   └── 检测 "PageDesign edit host unavailable" → abort 会话

5. releaseModuleInstance
   └── service.releasePage(pageId) → 清理编辑会话
```

> **AI 写入只进入内存 PageModel 并标 dirty，不自动保存、不创建版本、不刷新路由。** 保存由用户或调用方通过 `PageEditor.saveAll()` 单独触发。

### 7.5 两层查询设计（Read 优化模式）

payload-catalog 是 Read 优化：LLM 先做低成本 Read（摘要），再按需做高成本 Read（完整 schema）。这服务于 node-tree Write 的前置校验。

```
LLM 想写一个 r-table:
  │
  ├── 1. queryPayloads({ keyword: "table" })          ← Read（摘要）
  │       → 返回摘要列表 [{ key, type, category, description, requiredProps }]
  │       → 不包含 paramsSchema（避免上下文膨胀）
  │
  ├── 2. guidePayload({ key: "renderer-table" })      ← Read（完整）
  │       → 返回完整 paramsSchema + props + emits + usageRules
  │       → 自动记录到 PageDesignService（供事后诊断）
  │
  └── 3. node-tree.addNode({ node: { type: "r-table", ... } })  ← Write
          → 写入前自动按 type 提取 guide 并校验 props
```

---

## 八、包出口架构（5 条子路径）

```
@spark-view/spark-page-config
│
├── "."                    (主入口)    → Data + 全 CRUD 工厂
│   PageModel, PageModelFactory, createPageModel, createPageModelFactory
│   PageEditor, createPageEditor, componentCatalog, PAGE_DATA_JSON_SCHEMA
│   JsonDocumentRuntime (namespace)
│
├── "./editor"             (编辑器)    → Update (手动)
│   PageEditor, componentCatalog, createRuleTreePolicy
│
├── "./ai"                 (AI)       → Update (AI)
│   createPageDesignBusinessRegistration, createPageDesignBusinessKindDefinition
│   ensurePageDesignBusiness, PAGE_DESIGN_MODULE_ID
│   全部 kind ID 常量 + 会话诊断工具
│
├── "./leave-request"      (请假)     → Independent
│   createLeaveRequestBusinessRegistration, createLeaveRequestDraftId
│   LEAVE_REQUEST_KIND, LEAVE_REQUEST_MODULE_ID, LEAVE_REQUEST_PERSON_KIND
│
└── "./json-document"      (JSON 编辑) → Independent
    buildTreeModel, exportJsonDocument, toDisplayRows
    addChildNode, deleteNode, renameNodeKey, updateNodeValue
    flattenJsonDocumentForEdit, restoreJsonDocumentFromFlat
```

| 子路径 | CRUD 角色 | 消费方 |
|--------|----------|--------|
| `.` | Data + Read/Update 入口 | 应用路由、渲染器 |
| `./editor` | Update (手动编辑) | DevSystem 编辑器 |
| `./ai` | Update (AI 驱动) | AI Agent Host |
| `./leave-request` | 独立 AI 业务 | AI Agent Host |
| `./json-document` | 独立 JSON 编辑 | 任意消费方 |

**暴露原则：** 只暴露消费者需要的公共符号。`BasePageConfigLoader`、`PageConfigLoader`、各 `AiModule` 子类等内部实现不从此 barrel 导出。包根入口必须收敛——不重新导出 loader、compiler、file-api、子模型或已移除的子路径。

---

## 九、完整目录结构（35 源文件）

每个一级目录标注 CRUD 角色：

```
src/
├── index.ts                         ← 公共 barrel（主入口）
├── json-document-public.ts          ← json-document 子路径 barrel
│
├── config/                          ← [Read + Write(FileApi Create/Delete)]
│   ├── index.ts                     barrel: re-export 5 个编译函数
│   ├── config-types.ts              PageConfig, ConfigLoadResult, BasePageConfigLoader
│   ├── page-config-compiler.ts      compileRule / parsePageData / parseScript / parseCss
│   ├── page-config-file-api.ts      PageConfigFileApi (Create/Delete 远端 + 版本 API)
│   └── page-config-loader.ts        PageConfigLoader (Read: FileLoader + 编译缓存)
│
├── editor/                          ← [Data (PageModel) + Update + Create/Delete]
│   ├── page-model.ts                PageModel (数据真源 — 五子模型聚合根)
│   ├── page-model-factory.ts        PageModelFactory (Create: 装配依赖)
│   ├── page-editor.ts               PageEditor (Update: 框架无关编辑入口)
│   ├── page-rule-model.ts           PageRuleModel (rule.json)
│   ├── page-data-set-model.ts       PageDataSetModel (pagedata.json)
│   ├── page-text-model.ts           PageTextModel (script.js / style.css)
│   ├── navigation-draft-model.ts    NavigationDraftModel (18 个导航字段)
│   ├── page-file-serialization.ts   parse/serialize 四文件
│   └── page-file-restore-command.ts PageFileRestoreCommand 类型
│
├── design/                          ← [Update (AI bridge)]
│   ├── page-design-service.ts       PageDesignService (live-edit 桥接)
│   ├── page-edit-session.ts         PageDesignEditSession + PageDesignEditHost
│   ├── page-file-lifecycle.ts       PageConfigFileLifecycle (文件+导航生命周期)
│   ├── page-data-canonicalize.ts    canonicalizePageDataJson
│   └── artifacts/
│       ├── design-flow.ts           100 步设计流程 + 任务知识 (Read: AI 知识)
│       ├── rule-artifacts.ts        rule.json JSON Schema + TreePolicy
│       └── data-artifacts.ts        pagedata.json JSON Schema + Designer 投影
│
├── ai/                              ← [Update (LLM tools) + Read (知识查询)]
│   ├── index.ts                     AI 子系统 barrel
│   ├── page-design-module.ts        编排入口（组装 5 子 kind → AiAgentRegistration）
│   ├── page-design-kind-ids.ts      常量注册（root + 5 子 kind ID + 元数据）
│   ├── page-design-helpers.ts       共享工具（createCurrentPageRef, findCurrentPageInstance）
│   ├── page-design-session-diagnostics.ts  事后诊断（payload guide 覆盖率）
│   ├── lifecycle-tool-catalog.ts    PageDesignLifecycleAiModule（3 动作: 1 Write + 2 Read）
│   ├── text-model-tool-catalog.ts   PageDesignTextModelAiModule（4 动作: 2 Read + 2 Write）
│   ├── payload-catalog-tool-catalog.ts  PageDesignPayloadCatalogAiModule（2 动作: 纯 Read）
│   ├── node-tree-tool-catalog.ts    PageDesignNodeTreeAiModule（19 动作: 10 Read + 9 Write）
│   ├── dataset-tool-catalog.ts      PageDesignDatasetAiModule（~40 动作: 纯 Write）
│   └── payloads/
│       └── component-catalog.json   VCM 构建产物：组件 payload 定义 (Read)
│
├── navigation/                      ← [Update (nav edit) + Read (nav load)]
│   ├── nav-model.ts                 类型 re-export（NavNode, AppNavRoot...）
│   ├── nav-editing.ts              导航编辑（draft/patch/traverse/factory）
│   └── nav-client.ts               NavigationConfigClient（远端 CRUD）
│
├── json-document/                   ← [Independent — 通用 JSON 编辑器]
│   └── index.ts                    JsonDocumentRuntime（1006 行）
│
├── leave-request/                   ← [Independent — AI 业务示例]
│   ├── index.ts                     barrel
│   └── leave-request.ts            LeaveRequestService + AiModule
│
└── internal/                        ← [Shared utility]
    └── assert-page-id.ts           assertNonEmptyPageId
```

> **为什么 PageModel 在 `editor/` 目录下？** PageModel 与 PageEditor 和五个子模型物理上同目录，这是打包便利性设计：PageEditor 是 PageModel 的主要 Update 入口，五子模型唯一消费者是 PageModel。逻辑上 PageModel 是数据中心，`config/`、`ai/`、`design/`、`navigation/` 都是对它的 CRUD 操作。把 PageModel 提取到独立目录会增加层间导入距离，但不会改变逻辑关系。

---

## 十、跨模块依赖关系图

依赖按 CRUD 分层：数据层 (PageModel) 居中，Read 层 (config/) 在左，Update 层 (editor/ + design/ + ai/ + navigation/) 在右，独立子系统在底部。箭头方向表示「谁读取/写入谁」。

```
  ┌──────────────────────────────────────────────────────────┐
  │                  spark-app (Vue 应用层)                    │
  │         消费 PageEditor / PageModel / AI 注册入口           │
  └────┬──────────────┬──────────────┬───────────────────────┘
       │              │              │
       ▼              ▼              ▼
  ┌─────────────────────────────────────────────────────────┐
  │              spark-page-config                           │
  │                                                         │
  │   ┌──────────────────────────────────────────┐          │
  │   │              PageModel (数据)              │          │
  │   │  navigation / rule / dataSet /           │          │
  │   │  style / script                         │          │
  │   └──────────────────────────────────────────┘          │
  │     ▲              ▲              ▲          ▲           │
  │     │              │              │          │           │
  │  ┌──┴──────┐  ┌───┴──────┐  ┌───┴─────┐ ┌──┴─────────┐ │
  │  │ config/ │  │ editor/  │  │ design/ │ │navigation/ │ │
  │  │ Read    │  │ C/U/D    │  │ AI 桥接  │ │ Nav C/U/D   │ │
  │  │ Loader  │  │Editor    │  │Service  │ │ Session     │ │
  │  │ FileApi │  │Snapshot  │  │Session  │ │ Client      │ │
  │  └─────────┘  └──────────┘  └───┬─────┘ └─────────────┘ │
  │                                 │                        │
  │                          ┌──────▼────────┐              │
  │                          │     ai/       │              │
  │                          │ 5 子 AiModule  │              │
  │                          │ (LLM Update    │              │
  │                          │  工具目录)      │              │
  │                          └───────────────┘              │
  │                                                         │
  │   ┌──────────────┐  ┌──────────────┐                    │
  │   │leave-request/│  │json-document/│                    │
  │   │ (独立系统)    │  │ (独立系统)    │                    │
  │   └──────────────┘  └──────────────┘                    │
  └────────────┬──────────────┬──────────────┬──────────────┘
               │              │              │
               ▼              ▼              ▼
       ┌───────────┐ ┌───────────┐ ┌────────────────┐
       │ spark-data│ │spark-utils│ │    spark-ai    │
       └───────────┘ └───────────┘ └────────────────┘
```

---

## 十一、SSOT 分析

SSOT（单一真源）是 CRUD 正确性的基础。如果同一数据有多个真源，Create / Update 可能冲突写入，Read 可能读到过期数据。

### 11.1 已落实的 SSOT

| 真源 | 位置 | 保障的 CRUD 操作 | 消费方 |
|------|------|-----------------|--------|
| 导航配置（页面列表） | `NavigationConfigClient.loadRoot()` | Read (页面列表), Update (挂载/卸载) | DevSystem pageList、PageEditor |
| 页面四文件内容 | `PageConfigLoader` 后端 API | Read (加载到 PageModel) | PageModel、PageEditor |
| kind ID 常量 | `ai/page-design-kind-ids.ts` | Update (AI 工具路由) | 全部 5 个 tool-catalog + page-design-module |
| 组件参数目录 | `ai/payloads/component-catalog.json` | Read (AI 查询), Update (写入校验) | payload-catalog、node-tree 校验 |
| 100 步设计流程 | `design/artifacts/design-flow.ts` | Read (AI 流程指导) | lifecycle.describeDesignFlow |
| 四文件名 | `PAGE_CONFIG_FILE_NAMES` / `PAGE_MODEL_FILE_NAMES` | Read + Write (文件寻址) | config-types、page-model |
| PageDesign 业务注册 | `page-design-module.ts` | Update (唯一 AI 注册入口) | App 服务层 |

### 11.2 SSOT 一致性验证

- **页面列表**：已从导航派生（`buildPageListFromNavigation`），不再请求 `__list` API
- **文件 API 路径**：统一由 `PageConfigLoader.pagesConfigBase` + `toPageFilePath()` 计算
- **缓存前缀**：由 `cacheScopePrefix(baseUrl)` 派生，避免不同后端路径的缓存冲突
- **写入校验规则**：只在 `node-tree-tool-catalog.ts` 的 `runFunction` 中定义，不散落

---

## 十二、SOLID 原则对照

| 原则 | 实现 | 证据 | CRUD 语义 |
|------|------|------|-----------|
| **S** 单一职责 | config/ 管 Read + FileApi Write, editor/ 管 Data + Update, design/ 管 Update(AI 桥接), ai/ 管 Update(LLM 工具) | 6 个子系统各负责一到两个 CRUD 角色 | 边界清晰 = CRUD 操作不交叉污染 |
| **O** 开闭原则 | `BasePageConfigLoader` 抽象类，`PageConfigFileRegistry` 可扩展 | 测试可创建 `TestPageConfigLoader` 子类 | Read 策略可扩展而不改现有代码 |
| **L** 里氏替换 | PageRuleModel / PageDataSetModel / PageTextModel 统一契约 | 都实现 load/save/restoreVersion/resetToEmpty | 五子模型共享 CRUD 契约，任意子模型可替换 |
| **I** 接口隔离 | `PageDesignEditHost` 8 个可选回调槽位，`ConfigLoaderOptions` 只含加载选项 | 调用方只依赖需要的方法 | 每个槽位服务不同 Update 子任务 |
| **D** 依赖反转 | `PageModelFactory` 创建 `PageConfigLoader`/`PageConfigFileApi` 依赖；`PageEditor` 组合而非继承 | 高层模块不直接实例化低层模块 | Read(loader) + Write(fileApi) + Update(navClient) 注入 PageModel |

---

## 十三、测试架构

### 13.1 CRUD 覆盖矩阵

| CRUD 操作 | 测试文件 | 覆盖内容 |
|-----------|---------|---------|
| **Read** | `page-config-loader.test.ts` (852 行) | 加载/缓存/编译/错误路径 |
| **Create** | `page-editor.test.ts` (707 行) | 完整生命周期含创建 |
| | `leave-application-page-design.test.ts` (467 行) | E2E 从零创建页面 |
| | `devsystem-ssot.test.ts` (467 行) | 导航+编辑器创建 SSOT |
| **Update** | `page-editor.test.ts` | PageEditor 编辑操作 |
| | `page-design-business-definition.test.ts` (876 行) | AI 业务注册全流程 |
| | `page-design-node-tree-module-semantic.test.ts` (204 行) | NodeTree AI 工具语义 |
| | `page-design-session-diagnostics.test.ts` (81 行) | 会话诊断 |
| | `devsystem-ssot.test.ts` | 编辑器+导航 SSOT |
| **Delete** | `page-editor.test.ts` | 完整生命周期含删除 |
| | `devsystem-ssot.test.ts` | 导航+编辑器删除 SSOT |
| **Independent** | `spark-node-tree.test.ts` (578 行) | 底层数据结构 |
| | `json-tree-*.test.ts` (150 行) | JSON 编辑器 |
| | `leave-request-module.test.ts` (306 行) | 请假 AI 模块 |
| | `public-api-imports.test.ts` (107 行) | 5 条子路径冒烟 |

**覆盖分析：** Read 和 Update 拥有最深的测试覆盖（loader 852 行 + AI 业务注册 876 行），因为它们是系统中最复杂的操作。Create / Delete 通过 `page-editor` 和 `devsystem-ssot` 的完整生命周期测试间接覆盖。Delete 直接测试最少——`page-editor` 中的 `removeMountedPage` 和 `deletePageFiles` 是主要覆盖入口。

### 13.2 测试文件总览

```
tests/                             12 文件 · 169 用例
├── helpers/test-utils.ts          getRecord / getArray 解包工具
│
├── spark-node-tree.test.ts        (578 行) SparkNodeTree 数据结构
├── json-tree-editor-array-root.test.ts  (38 行) JSON 编辑器数组根
├── json-tree-flat-uuid-roundtrip.test.ts (112 行) 扁平化往返
│
├── page-config-loader.test.ts     (852 行) Read: 加载/缓存/编译/错误
├── page-editor.test.ts            (707 行) Update + Create + Delete
├── devsystem-ssot.test.ts         (467 行) 导航+编辑器+Designer SSOT
│
├── page-design-business-definition.test.ts (876 行) Update: AI 业务注册全流程
├── page-design-node-tree-module-semantic.test.ts (204 行) Update: NodeTree AI 语义
├── page-design-session-diagnostics.test.ts (81 行) Update: 会话诊断
├── leave-application-page-design.test.ts (467 行) Create: E2E 页面设计
├── leave-request-module.test.ts   (306 行) Independent: 请假 AI 模块
│
└── public-api-imports.test.ts     (107 行) 公共 API 冒烟
```

---

## 十四、关键设计决策

| # | 决策 | CRUD 亲和 | 说明 |
|---|------|----------|------|
| 1 | PageEditor 不直接注入 Vue | **Update** | 框架无关确保 Update 操作在任何 UI 层一致 |
| 2 | Loader / Compiler 职责分离 | **Read** | 加载策略与解析逻辑解耦 |
| 3 | AI 两层查询设计 | **Read (within Update)** | 按需加载避免 LLM 上下文膨胀 |
| 4 | 写入校验集中在 node-tree | **Update** | 数据完整性保障集中在 Write 前 |
| 5 | leave-request 独立性 | **Independent** | 作为非 PageModel CRUD 的参考实现 |

### 14.1 PageEditor 不直接注入 Vue

`PageEditor` 是框架无关的纯 TypeScript 类，通过 `createPageDesignEditHost()` 暴露 `PageDesignEditHost` 接口供 AI 系统调用。Vue 组件通过 `useDevState()` 消费其状态。这确保 Update 操作在任何 UI 层执行一致。

### 14.2 配置加载和编译的职责分离

```
PageConfigLoader (管"怎么加载")
  └── FileLoader.withTransform(compileRule)  ← 编译缓存
        └── compileRule (管"怎么解析")  ← page-config-compiler.ts
```

Read 操作的两个维度解耦：加载策略（缓存、超时、作用域）与解析逻辑（JSON → 领域对象）可独立变化。

### 14.3 AI 工具的两层查询设计

`queryPayloads` 不返回完整 `paramsSchema`，LLM 先浏览摘要再按需深入 `guidePayload`。避免把 VCM 构建产物整体灌入 LLM 上下文。这是 Read 优化嵌入 Update 子系统的模式。

### 14.4 写入校验集中在 node-tree

rule.json 的 8 步写入前校验全部在 `PageDesignNodeTreeAiModule.runFunction()` 中按序执行。不在 smoke/test 中重复校验规则。所有 Update 操作共享同一套数据完整性门禁。

### 14.5 leave-request 的独立性

人工请假模块与 PageDesign 完全解耦：不共享类型、服务、AiModule 或 runtime 状态。它是"如何用 spark-ai 注册独立业务模块"的参考实现，证明本包可作为任意 AI 业务宿主，不限于 PageModel CRUD。

---

## 十五、构建与验证

构建和测试验证 CRUD 管线的完整性：TypeScript 严格类型检查确保 Read 输出类型与 Update 输入类型一致，169 个测试用例覆盖所有四个 CRUD 操作路径。

```bash
# 测试（watch 模式）
pnpm run --filter @spark-view/spark-page-config test

# 单次测试
pnpm run --filter @spark-view/spark-page-config test:run

# 构建
pnpm run --filter @spark-view/spark-page-config build
# → vite build (ES module JS)
# → tsc -p tsconfig.build.json (declaration .d.ts)

# 类型检查
pnpm run --filter @spark-view/spark-page-config typecheck
```

**测试基础设施：** Vitest 4.x + jsdom + 24 条 Vite alias（解析全部 workspace 包到源文件）
