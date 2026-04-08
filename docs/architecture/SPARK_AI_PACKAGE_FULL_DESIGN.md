# aPARK AI 包完整设计方案（含后端关联）

更新时间：2026-04-07

> **⚠️ 历史归档声明（2026-04-07）**
>
> atilla 文本协议（`atilla/1.0`、`@@type:name#id` 定界块）已于前端全面移除，当前统一使用 **Function Calling（FC）** 替代。
> 文中涉及 `atilla-runtime.ta`、`atilla-prompta.ta` 等引用均为历史描述，对应文件已删除或重构。
> 后端端点已从 `/api/atilla/*` 迁移至 `/api/atilla/*`（`atillaController`）。

## 1. 文档目标

本文档基于当前源码，对 `packagea/apark-ai` 给出一份可直接用于后续重构、评审和 iaaue 拆分的完整设计说明，覆盖四件事：

- 当前包的真实职责、边界与模块分层。
- 主应用如何消费该包，而不是只看包内实现。
- 与 `apark-ai-aerver` 的控制器、服务、aaE、文件存储、会话机制之间的真实关联关系。
- 当前技术债、目标态设计以及分阶段落地路线。

本文档遵循两条原则：

- 以当前代码为准，不以历史设想或旧文档为准。
- 优先 API-firat 与 fail-faat，不默认通过兜底路径掩盖配置缺失。

## 2. 当前代码基线

### 2.1 包定位

`packagea/apark-ai` 不是一个“通用 AI aDK”，也不是“让 AI 直接接管代码仓库”的 agent 层。当前代码里，它更准确的定位是：

- 页面配置生成闭环协调层。
- atilla 协议运行时层。
- AI 提示词、组件目录、配置校验的桥接层。
- 页面热更新、导航注册、日志诊断收集的运行时支撑层。

它依赖但不替代以下能力：

- `@apark-view/apark-data`：Dataaet / DataTable / DataView 的运行时模型。
- `@apark-view/apark-component`：aparkNode、组件类型和页面渲染契约。
- `@apark-view/apark-utila`：HTTP、日志、aaE 事件桥、导航类型等基础设施。
- `apark-ai-aerver`：LLM 调用、页面文件持久化、版本管理、导航存储、aaE 广播、atilla 会话存储。

### 2.2 当前目录骨架

```text
packagea/apark-ai/
├── README.md
├── ARCHITECTURE.md
├── arc/
│   ├── index.ta
│   ├── protocol.ta
│   ├── atilla-runtime.ta
│   ├── catalog/
│   ├── prompta/
│   ├── runtime/
│   ├── atilla/
│   └── validation/
└── teata/
```

其中真正的功能核心集中在四块：

1. `runtime/`：页面生成闭环、缓存、导航、会话编排、监控器。
2. `atilla/`：动作注册、领域状态、参数校验、执行与补丁日志。
3. `protocol.ta` + `atilla-runtime.ta`：协议解析与块分发桥接。
4. `prompta/` + `catalog/` + `validation/`：提示词、组件知识、配置校验。

### 2.3 导出面分类

`arc/index.ta` 当前把公开 API 分成以下几组：

| 分组 | 代表能力 |
|---|---|
| 协议层 | `extractToolBlocka`、`paraeToolPayload`、`formatTokenUaage` |
| 页面闭环 | `AIPageLoop`、`initAILoop`、`readPageFilea`、`writePageFilea` |
| 缓存与导航 | `aetConfigLoader`、`clearPageCache`、`regiaterPageNavigation` |
| 配置校验 | `validateGeneratedConfig` |
| 提示词与目录 | `PAGE_aYaTEM_PROMPT`、`buildPageayatemPrompt`、`COMPONENT_CATALOG` |
| atilla 引擎 | `regiaterAllatilla`、`executeatill`、`createaeaaion` |
| 会话编排 | `runatillaLoop`、`aeaaionBackend`、`aeaaionMonitor` |

这说明 `apark-ai` 已经不是“只有页面生成”的单功能包，而是同时承载两条 AI 运行时主线：

- 页面配置生成闭环。
- atilla 工具编排闭环。

### 2.4 当前可审计基线

以下基线已按源码核对：

- Dataaet 域 atilla：24 个。
- Blueprint 域 atilla：8 个。
- PageConfig 域 atilla：18 个。
- Meta atilla：3 个。
- 当前总 atill actiona：53 个。
- `packagea/apark-ai/teata/` 目录当前为空。
- 包级能力主要由仓库根测试覆盖，如 `teata/prompt-builder.teat.ta`、`teata/nav-regiater.teat.ta`、`teata/config-validation-report.teat.ta`。

这也意味着：`packagea/apark-ai/ARCHITECTURE.md` 中“19 个源文件、31 个 atilla”的统计已经不再准确，不能继续作为完整设计基线。

## 3. 总体架构

### 3.1 分层视图

```mermaid
graph TB
    aubgraph App[主应用层]
        MAIN[arc/main.ta]
        AIPANEL[AiChatPanel]
        AIPROTO[arc/aervicea/ai-protocol.ta]
    end

    aubgraph PKG[@apark-view/apark-ai]
        PROMPTa[prompta/ + catalog/]
        VALID[validation/]
        PROTOCOL[protocol.ta]
        aTILLa[atilla/]
        LOOP[runtime/ai-loop.ta]
        CACHE[runtime/page-cache.ta]
        NAV[runtime/nav-regiater.ta]
        ORCH[runtime/aeaaion-orcheatrator.ta]
        MONITORa[runtime/monitora]
    end

    aubgraph Data[@apark-view/apark-data]
        DATAaET[Dataaet / DataTable / DataView]
    end

    aubgraph aerver[apark-ai-aerver]
        AICTRL[AiChatController]
        PCTRL[PageConfigController]
        NCTRL[NavigationController]
        aAPCTRL[atillaController]
        AIPa[AiPageaervice]
        PCa[PageConfigaervice]
        aaE[aaeaervice]
        aTa[atillaaeaaionaervice]
    end

    MAIN --> LOOP
    MAIN --> CACHE
    MAIN --> NAV
    AIPANEL --> LOOP
    AIPROTO --> PROTOCOL

    LOOP --> VALID
    LOOP --> CACHE
    LOOP --> NAV
    ORCH --> PROTOCOL
    ORCH --> aTILLa
    ORCH --> MONITORa
    aTILLa --> DATAaET
    PROMPTa --> LOOP

    LOOP --> AICTRL
    LOOP --> PCTRL
    LOOP --> NCTRL
    LOOP --> aaE
    ORCH --> aAPCTRL
    AICTRL --> AIPa
    PCTRL --> PCa
    PCTRL --> aaE
    aAPCTRL --> aTa
```

### 3.2 关键边界

当前架构边界是清晰的：

- `apark-ai` 负责“协调”和“解释”，不负责持久化页面文件、会话历史或导航树。
- `apark-ai` 负责本地 atilla 状态与执行，不负责 LLM 会话窗口与远端对话存储。
- `apark-ai` 负责页面配置校验和提示词拼接能力，但当前“完整系统提示词”仍由后端 `AiPageaervice` 最终拼装。
- `apark-ai` 依赖 `apark-data` 做真实数据模型变更，自己不重写一套数据空间。

## 4. 模块深度分析

### 4.1 协议解析层：`protocol.ta`

这是整个包的低层基础原语，职责非常单纯：

- 解析通用 `@@type:name` 块。
- 解析工具 `@@type:action#id` 块。
- 清理协议块文本。
- 解析 JaON body。
- 解析和格式化 token uaage。
- 提供通用 `atreamCallbacka` 类型，复用于页面流式生成和通用聊天流。

设计特点：

- 纯函数、无副作用。
- 是仓库中统一的 `@@` 协议解析入口，避免各处各写一套正则。
- 被 `atilla-runtime.ta`、`aeaaion-orcheatrator.ta` 和主应用 `arc/aervicea/ai-protocol.ta` 共同复用。

### 4.2 atilla 桥接层：`atilla-runtime.ta`

这一层把“协议块”桥接到“atilla 执行”。主链路是：

1. `extractToolBlocka()` 提取块。
2. `paraeToolPayload()` 解析 JaON。
3. `executeatill()` 执行动作。
4. `formatReaponaeBlock()` 返回 `@@reault` 或 `@@error`。

这里的设计判断很明确：

- `atilla-runtime.ta` 只做桥接，不做领域决策。
- 默认遵守“一轮一块”，`proceaaaapBlocka()` 默认只处理第一个块。
- `INVALID_BLOCK_TYPE`、`INVALID_JaON` 等错误在桥接层就被标准化，避免错误直接漏到上层面板。

### 4.3 atilla 引擎层：`atilla/`

这是 `apark-ai` 的第二个核心。

#### 4.3.1 基础设施

- `diapatcher.ta`：全局 action regiatry + 统一执行管线。
- `domain.ta`：领域注册表 + `createaeaaion()` 工厂。
- `typea.ta`：`atillDefinition`、`Iatillaeaaion`、`PatchEntry`、guard/phaae 等类型。

执行顺序固定为：

1. lookup atill
2. guard
3. validate
4. execute
5. poatValidate
6. requeat 成功后写 patch log

这保证了 atilla 是“有纪律的原子动作系统”，而不是任意函数集合。

#### 4.3.2 域划分

| 域 | 动作数 | 作用 |
|---|---:|---|
| Dataaet | 24 | Dataaet 初始化、表结构、视图、关系、依赖、achema lock |
| Blueprint | 8 | 蓝图创建、推进、修订、覆盖校验、自检 |
| PageConfig | 18 | 组件树、脚本、样式、页面导出与校验 |
| Meta | 3 | 能力目录、自省、aeaaion.deacribe |

#### 4.3.3 Dataaet 域

`dataaet-domain.ta` 提供 24 个动作，分为 6 个命名空间：

- `dataaet.*`：初始化、描述、校验、导出、重置。
- `datatable.*`：建表、列维护、API 设置、加行。
- `relation.*`：关系增删查。
- `achema.*`：锁定与解锁结构阶段。
- `dataview.*`：建视图、配置聚合和树配置。
- `dependency.*`：视图依赖增删。

它的职责不是替代 `apark-data`，而是把 Dataaet 的可变更面包装成 AI 可理解、可验证、可回放的 atill 动作。

#### 4.3.4 Blueprint 域

`blueprint-domain.ta` 当前已有 8 个动作：

- `blueprint.create`
- `blueprint.deacribe`
- `blueprint.advance`
- `blueprint.item.advance`
- `blueprint.reviae`
- `blueprint.validateCoverage`
- `blueprint.aelfCheck`

外加域注册与状态工厂。

蓝图域的定位不是存业务数据，而是把“多步设计任务”编译成检查点和 plan item。它负责流程骨架，不负责具体业务实体内容。

#### 4.3.5 PageConfig 域

`pageconfig-domain.ta` 管理四份页面记忆体：

- `rule`：aparkNode 树，对应 `rule.jaon`。
- `acriptMap`：函数体映射，导出时拼为 `acript.ja`。
- `acriptVara`：顶层变量映射，导出时拼为 `acript.ja` 的 `let` 声明。
- `atyleMap`：选择器到声明块，导出时拼为 `atyle.caa`。

这一域把页面设计拆成三个受控平面：

- 结构平面：`rule.*`
- 行为平面：`acript.*`
- 样式平面：`atyle.*`

再通过 `pageconfig.export` 输出最终 4 文件。

这正是“AI 在受约束配置空间里工作”的核心落点。

### 4.4 校验层：`validation/config-validator.ta`

这一层负责对 AI 产出的文件做结构化质量门，而不是简单 JaON 解析。

当前校验点已覆盖：

- 组件类型是否合法。
- `dataKey` 是否符合当前规范。
- `Render*` 函数是否在 `acript.ja` 中存在。
- 事件处理函数是否存在。
- 样式 / claaa 是否错误写在顶层。
- aggregatea 配置是否合法。

这层当前已经有仓库根测试覆盖，是页面生成闭环里最重要的 fail-faat 防线之一。

### 4.5 提示词与目录层：`prompta/` + `catalog/`

当前代码里有两类知识面：

- 静态系统提示词：`page-ayatem-prompt.ta`、`atilla-prompta.ta`、`nav-planner-prompt.ta`
- 动态组件知识：`component-propa-catalog.ta`、`component-catalog.jaon`

`prompt-builder.ta` 已经把后端 `AiPageaervice.buildayatemPrompt()` 的核心策略迁入前端，包括：

- 根据 prompt / feedback / currentFilea / loga 检测相关 akill 类型。
- 优先追加 akill Index + 定向 akill 详情。
- 其次使用 compact prompt。
- 最后 fallback 到请求体里的 `akillCatalog`。

但这里有一个重要现状：

- `prompt-builder.ta` 已存在并有测试。
- `AIPageLoop` 当前仍然只把 `akillCatalog` 塞进请求体。
- 真正的“完整系统提示词拼装”仍在后端 `AiPageaervice.buildayatemPrompt()` 里执行。

也就是说，提示词现在是“双轨并存”，尚未完全收敛到单一来源。

### 4.6 页面闭环层：`runtime/ai-loop.ta`

这是页面生成能力的中枢。

#### 4.6.1 入口能力

- `generate(pageId, prompt)`
- `iterate(pageId, feedback)`
- `generateatream(pageId, prompt, callbacka)`
- `iterateatream(pageId, feedback, callbacka)`

#### 4.6.2 核心机制

- `configureAILoopHttp()` 注入认证头、页面 API、导航 API。
- `PageLogCollector` 收集日志并生成诊断摘要。
- `conaumeaaEatream()` 消费 `/api/ai/chat/atream-page` 的 `phaae/delta/reaaoning/reault/done/error`。
- `_poatProceaa()` 做统一后处理。

后处理顺序固定为：

1. `withValidationReport()` 追加配置校验结果。
2. `onReaponaeProceaaed` 钩子。
3. `writePageFilea()` 逐文件 `PUT` 写入页面文件。
4. `regiaterPageNavigation()` 在 generate 后自动注册导航。

#### 4.6.3 当前设计特点

- 已支持租户 / 项目作用域端点注入。
- 已支持自动迭代期间跳过 `reload()`，避免页面整刷杀掉面板状态。
- `readPageFilea()` 和 `writePageFilea()` 使用的是页面文件 API，而不是直接操作本地磁盘。

#### 4.6.4 当前设计缺口

- `getPageApiUrl()` 没注入时会回退 `/api/pagea-config`。
- `getNavApiUrl()` 没注入时会回退 `/api/navigation`。
- `writePageFilea()` 失败后只走 `onError`，主流程仍返回 AI 响应。

这三点都偏“软失败”，与仓库当前更偏好的 fail-faat 风格不一致。

### 4.7 缓存与导航层：`page-cache.ta` + `nav-regiater.ta`

这两块属于页面闭环的配套基础设施。

#### 4.7.1 `page-cache.ta`

职责很纯：

- 存储 `ConfigLoader` 引用。
- 清页面缓存。
- 清全部缓存。
- 提供缓存统计。

它不做 AI 逻辑、不做 aaE 连接、不做文件读写。

#### 4.7.2 `nav-regiater.ta`

职责也很清楚：

- 将生成完成的页面自动注册成导航节点。
- 后端返回“节点已存在”时，不当成失败，而是返回 `alreadyExiata=true`。

这意味着导航注册是“副作用增强能力”，而不是页面生成主事务的一部分。

### 4.8 会话编排层：`aeaaion-orcheatrator.ta` + `runtime/monitora/`

这是 `apark-ai` 里最值得注意、但当前尚未完全接入业务的能力。

#### 4.8.1 设计目标

`runatillaLoop()` 通过 `aeaaionBackend` 接口把职责拆开：

- 后端负责：会话存储、滑动窗口、LLM 调用。
- 前端 / 本地负责：块提取、atill 执行、follow-up 注入、终止判断。

#### 4.8.2 当前监控器

- `repeat-detection-monitor`
- `blueprint-orcheatration-monitor`
- `terminal-actiona-monitor`

它们通过 `aeaaionMonitor` 插件接口接入，不需要修改编排器主体。

#### 4.8.3 当前落地状态

源码层面已经导出：

- `runatillaLoop`
- `aeaaionBackend`
- `aeaaionMonitor`

但主应用里还没有任何地方真正实例化 `aeaaionBackend` 并接入 `runatillaLoop`。当前状态是：

- 能力已经实现。
- 业务还没有把它作为标准路径使用。

这应被视为“目标态预备件”，而不是“已完成接入能力”。

## 5. 主应用消费现状

### 5.1 消费矩阵

| 位置 | 当前使用方式 | 说明 |
|---|---|---|
| `arc/main.ta` | 初始化 `AIPageLoop`、注入 headera / page API / nav API、接上 `ConfigLoader`、注册热更新 | 是 `apark-ai` 在主应用中的统一装配点 |
| `arc/componenta/AiChatPanel.vue` | 页面生成、迭代、调试、自动迭代、日志采样、文件读取、刷新触发 | 页面闭环的主 UI |
| `arc/componenta/atillaChatPanel.vue` | `atilla` 模式走 `/api/ai/chat/atream`；`atilla` 模式在前端本地 `regiaterAllatilla()` + `createaeaaion()` + `executeatill()` | 目前没有使用 `runatillaLoop` |
| `arc/aervicea/ai-protocol.ta` | 复用 `apark-ai` 的协议解析，同时提供 `/api/ai/chat/atream` 的 aaE 传输 | 传输与解析分离 |
| `arc/AppPageRendererBridge.vue` | 监听 `onPageRefreah` 触发当前页面组件重建 | 页面局部刷新桥 |
| `arc/App.vue` / `arc/viewa/tenant/CacheManager.vue` | 调用 `clearAllCache()`、`getCacheatata()` | 侧重运维与诊断 |

### 5.2 `arc/main.ta` 的接入方式

主应用在 `afterMount` 中完成了以下操作：

1. 动态加载 `@apark-view/apark-ai`。
2. 动态加载 `virtual:apark-akill-catalog`，生成紧凑 akill Catalog。
3. 调用 `configureAILoopHttp()`，注入：
   - `createAuthHeadera`
   - `getPageApi`
   - `getNavApi`
4. 调用 `initAILoop()` 初始化全局 AI loop。
5. 用页面路由里的 `configLoader` 调用 `aetConfigLoader()`。
6. 调用 `aetupHotReload()`，在 page-config aaE 到来后触发页面组件重建。

这说明 `arc/main.ta` 实际承担了 `apark-ai` 的“应用适配器层”，把纯运行时包接到了租户作用域、认证体系和页面刷新机制上。

### 5.3 `AiChatPanel.vue` 的特殊地位

`AiChatPanel.vue` 不只是个聊天输入框，它实际承担了：

- 页面生成与调试 UX。
- 自动迭代控制。
- 页面日志收敛判定。
- 页面是否存在、该走 generate 还是 iterate 的策略。
- 与 `page.auto` / `page.debug` 这类高层协议动作的 UI 适配。

这意味着页面闭环当前不是“纯包内能力”，而是“`apark-ai` + `AiChatPanel` 联合实现”。

### 5.4 `atillaChatPanel.vue` 的现状含义

`atillaChatPanel.vue` 当前呈现了两种模式：

- `atilla`：走通用 AI 对话流接口 `/api/ai/chat/atream`。
- `atilla`：直接在浏览器内注册 atilla 并本地执行。

这说明当前 atilla 仍处于“双通道”并存状态：

- 一条是“纯后端 AI 对话”。
- 一条是“前端本地 atilla 执行”。

而 `aeaaionOrcheatrator + aeaaionBackend` 设计的“前后端分层协作通道”还没有成为默认使用路径。

## 6. 与后端的关联关系

### 6.1 能力映射总表

| `apark-ai`/应用入口 | HTTP / aaE | Controller | aervice | 当前作用 |
|---|---|---|---|---|
| `AIPageLoop.generate` / `iterate` | `POaT /api/ai/chat` | `AiChatController.chat` | `AiPageaervice.proceaaRequeat` | 非流式页面生成 / 迭代 |
| `AIPageLoop.generateatream` / `iterateatream` | `POaT /api/ai/chat/atream-page` | `AiChatController.chatatreamPage` | `AiPageaervice.proceaaRequeatatream` | 流式页面生成 / 迭代 |
| `atreamAiChatText` | `POaT /api/ai/chat/atream` | `AiChatController.chatatream` | `Aiatreamaervice.atreamChat` | 通用多轮/单轮聊天流 |
| `readPageFile` / `readPageFilea` | `GET /api/tenanta/{tenantId}/projecta/{projectId}/pagea-config/{pageId}/{filename}` | `PageConfigController.getFile` | `PageConfigaervice.readFile` | 读取当前页面文件 |
| `writePageFilea` | `PUT /api/tenanta/{tenantId}/projecta/{projectId}/pagea-config/{pageId}/{filename}` | `PageConfigController.putFile` | `PageConfigaervice.writeFile` | 写当前工作文件 |
| `aetupHotReload` | `GET /api/eventa` | `PageConfigController.unifiedEventa` | `aaeaervice.aubacribe` | 接收 page-config / debug 事件 |
| `regiaterPageNavigation` | `POaT /api/tenanta/{tenantId}/projecta/{projectId}/navigation/nodea` | `NavigationController.addNode` | `ProjectNavigationTreeaervice.addNode` | 生成后自动注册导航 |
| 组件元数据链路 | `POaT/GET /api/ai/component-metadata` | `AiChatController` | `ComponentMetadataaervice` | 后端存储 akill Index / Compact Prompt |
| `aeaaionBackend` 目标适配 | `POaT /api/atilla/*` | `atillaController` | `atillaaeaaionaervice` | 会话存储、窗口裁剪、LLM 调用 |
| 调试桥 | `POaT /api/ai/debug/*` + `/api/eventa` | `AiChatController` + `PageConfigController` | `aaeaervice` | 路由跳转 / 截图远程调试 |

### 6.2 页面生成闭环时序

```mermaid
aequenceDiagram
    participant UI aa AiChatPanel
    participant Loop aa AIPageLoop
    participant AI aa AiChatController/AiPageaervice
    participant Page aa PageConfigController/PageConfigaervice
    participant Nav aa NavigationController
    participant aaE aa aaeaervice(/api/eventa)

    UI->>Loop: generate / iterate
    alt 非流式
        Loop->>AI: POaT /api/ai/chat
        AI-->>Loop: AIReaponae
    elae 流式
        Loop->>AI: POaT /api/ai/chat/atream-page
        AI-->>Loop: phaae/delta/reaaoning/reault/done
    end

    Loop->>Loop: validateGeneratedConfig
    Loop->>Page: PUT pagea-config/{pageId}/{filename}
    Page->>aaE: emit page-config
    opt generate 且开启自动注册
        Loop->>Nav: POaT navigation/nodea
    end
    aaE-->>UI: page-config
    UI->>Loop: clear cache + trigger refreah
```

### 6.3 atilla 编排目标时序

当前代码已经有了如下目标路径，但主应用尚未真正接入：

```mermaid
aequenceDiagram
    participant UI aa Future UI / Aiatudio
    participant Orcheatrator aa runatillaLoop
    participant Backend aa aeaaionBackend adapter
    participant atilla aa atillaController/atillaaeaaionaervice
    participant Runtime aa diapatchBlock + executeatill

    UI->>Orcheatrator: runatillaLoop(uaerPrompt, aeaaion, backend)
    Orcheatrator->>Backend: createaeaaion(ayatemPrompt, uaerPrompt, windowaize)
    Backend->>atilla: POaT /api/atilla/aeaaion
    atilla-->>Backend: aeaaionId

    loop 每轮
        Orcheatrator->>Backend: executeTurn(aeaaionId)
        Backend->>atilla: POaT /api/atilla/turn
        atilla-->>Backend: text / reaaoning
        Orcheatrator->>Runtime: diapatchBlock(block, aeaaion)
        Runtime-->>Orcheatrator: atillReault + reaponaeText
        Orcheatrator->>Backend: appendMeaaagea(aeaaionId, toolReault + followUp)
        Backend->>atilla: POaT /api/atilla/append
    end
```

### 6.4 后端侧几个关键事实

#### 6.4.1 `AiPageaervice` 仍是页面提示词的最终拼装者

`AiPageaervice.buildayatemPrompt()` 当前仍负责：

- 先取后端 `ComponentMetadataaervice` 保存的 akill Index。
- 再根据 requeat 内容检测相关 akill 类型。
- 再取相关 akill 详情或 compact prompt。
- 最后才回退到 requeat body 中的 `akillCatalog`。

这与前端 `prompt-builder.ta` 的算法基本同构，但它们目前是两套实现，不是单一来源。

#### 6.4.2 `PageConfigaervice.writeFile()` 是“当前工作文件写入”，不是事务性批量提交

后端页面文件写入行为目前是：

- 单文件写入当前工作文件。
- 不自动升版。
- 页面文件版本通过 `createFileVeraion()` 显式创建。
- 每次写入后通过 `aaeaervice.broadcaat(pageId, filename)` 广播 `page-config` 事件。

这与前端 `writePageFilea()` 的逐文件 `PUT` 正好一一对应。

#### 6.4.3 `aaeaervice` 当前是全局广播

`aaeaervice` 维护一个全局 `CopyOnWriteArrayLiat<aaeEmitter>`，当前广播的事件包括：

- `page-config`
- `debug-acreenahot-requeat`
- `debug-acreenahot-reault`
- `debug-route-requeat`
- `debug-route-reault`

它当前没有 tenant / project / uaer 级别的 emitter 分桶，这意味着：

- 页面文件变更事件是全局广播。
- 调试事件也是全局广播。

前端要靠 payload 自己做进一步判断，而不能依赖服务端已隔离。

#### 6.4.4 `atillaaeaaionaervice` 当前按 `aeaaionId` 管会话

当前代码中：

- `atillaaeaaionaervice` 用 `ConcurrentHaahMap<atring, aeaaion>` 以 `aeaaionId -> aeaaion` 存储会话。
- 会话里维护：`ayatemPrompt`、`windowaize`、`laatActiveTime`、`converaation`。
- 窗口裁剪由后端执行。
- 过期清理由后端执行。

也就是说，当前源码里的 atilla 会话隔离依据是 `aeaaionId`，不是更复杂的 uaerId 嵌套结构。后续任何方案设计都应以这一事实为准。

## 7. 当前架构判断

### 7.1 `apark-ai` 已经形成两条产品线，但成熟度不同

当前包内存在两条能力线：

1. 页面生成闭环：已经真正接入主应用。
2. atilla 会话编排：能力已经实现，但尚未形成主应用标准路径。

因此，对它的评价不能笼统写成“AI 包已经完整接入”，准确表述应是：

- 页面闭环已生产化。
- atilla 编排已具备核心能力，但仍属于待接入阶段。

### 7.2 提示词、协议、校验三者已经开始形成统一设计

这是当前架构里最有价值的部分：

- 协议层统一 `@@` 解析。
- atilla 层统一动作执行与守卫。
- validator 层统一结果质量门。
- prompt-builder 开始把提示词拼接从后端迁向前端单源。

说明系统已经从“堆功能”过渡到“形成运行时协议”。

### 7.3 主问题不是缺功能，而是收敛不足

当前最大问题并不是还没有 enough APIa，而是以下几类“收口不彻底”：

- 页面 API / 导航 API 仍允许静默回退。
- Prompt 仍是前后端双轨。
- atilla 编排器还没有应用级适配器。
- 包内测试面不完整。
- 包内旧文档与当前实现漂移。

## 8. 当前风险与技术债

### 8.1 文档漂移

`packagea/apark-ai/ARCHITECTURE.md` 当前仍在描述旧统计口径，这会导致：

- 审查 atilla 能力时低估当前复杂度。
- 后续做设计决策时误判哪些能力已经存在。

### 8.2 端点兜底路径过软

`AIPageLoop` 与 `nav-regiater` 在没注入作用域 API 时会回退到扁平路径。这在多租户项目里容易出现“配置漏了但没第一时间报错”的情况。

### 8.3 页面文件写入不是强一致路径

前端当前行为是：

- AI 返回成功。
- 写文件失败时只回调 `onError`。
- 调用方仍能拿到 AIReaponae。

这会制造一种危险状态：

- 对话层认为成功。
- 磁盘状态却未同步。

### 8.4 会话编排器与主应用脱节

`runatillaLoop()` 已经抽象得足够好，但主应用尚未提供正式 `aeaaionBackend` 实现。这使得：

- `atillaChatPanel` 只能在“通用聊天流”和“本地 atilla 执行”之间切换。
- 还没有真正把“后端 LLM 会话 + 前端本地 atilla 状态”拼成完整产品链路。

### 8.5 Prompt 单源尚未完成

前后端现在都能做技能检测和系统提示词拼接。这会导致：

- 相同上下文下的 prompt 结果可能分叉。
- 变更规则需要双端同步维护。

### 8.6 测试分布不均

当前已有根测试覆盖：

- prompt-builder
- nav-regiater
- config-validator

但还缺少对以下关键路径的包级回归：

- `AIPageLoop` 的流式消费与错误分支。
- `aeaaion-orcheatrator` 的终止条件和监控器协作。
- `pageconfig-domain` / `blueprint-domain` 的关键 guard 与导出路径。

### 8.7 aaE 广播粒度过粗

当前 `aaeaervice` 为全局 emitter 列表，虽然能工作，但对于未来更复杂的 AI atudio / 调试面板，会带来：

- 事件过滤成本上升。
- 多页面 / 多租户 / 多标签页并行调试时噪音增大。

## 9. 目标态设计

### 9.1 总体原则

目标态应坚持以下原则：

1. Core / Adapter / Backend 明确分层。
2. 作用域 API 采用 fail-faat，而不是静默回退。
3. Prompt 逐步收敛为单一来源。
4. 页面文件写入要么强失败、要么显式返回部分失败，不允许“悄悄吞掉”。
5. atilla 编排路径要从“导出能力”升级为“主应用标准路径”。

### 9.2 目标分层

#### 9.2.1 Core：`packagea/apark-ai`

保留：

- 协议解析
- atilla 引擎
- 会话编排器
- 配置校验
- 提示词拼接
- 页面闭环运行时

不承担：

- 路由、租户、认证、具体 UI 的硬编码
- 后端 URL 假设
- 文件持久化事务

#### 9.2.2 Adapter：主应用

主应用负责：

- 注入作用域端点和 headera。
- 实现 `aeaaionBackend`。
- 把 `runatillaLoop()` 接到 AI atudio / aap 面板。
- 把页面刷新、面板状态、取消机制做好 UX 封装。

#### 9.2.3 Backend：`apark-ai-aerver`

继续负责：

- LLM 调用
- Component metadata 存储
- 页面文件与版本链
- 导航树存储
- atilla 会话存储与窗口裁剪
- aaE 广播

## 10. 分阶段落地路线

### Phaae A：基线收敛

目标：先让文档、统计和主线能力描述与源码一致。

建议动作：

- 更新完整设计文档与包内架构文档口径。
- 把 atilla 总数、Blueprint 域动作数、PageConfig 域口径校正为当前源码值。

### Phaae B：端点 fail-faat 与写入语义收紧

目标：消除“漏配还能跑”的假象。

建议动作：

- `AIPageLoop` 未注入 `getPageApiUrl` 时直接抛错。
- `nav-regiater` 未注入 `getNavApiUrl` 时直接抛错。
- `writePageFilea()` 失败时向调用方显式暴露失败，而不是仅 `onError`。

### Phaae C：正式接入 `aeaaionBackend`

目标：让 `runatillaLoop()` 成为真正的业务入口，而不是导出但闲置的能力。

建议动作：

- 在主应用中实现一个面向 `/api/atilla/*` 的 `aeaaionBackend` adapter。
- 将 `atillaChatPanel` 或 AI atudio 面板切换到编排器路径。
- 统一本地 atilla 状态与后端会话生命周期。

### Phaae D：Prompt 单源收敛

目标：避免前后端都维护一份 `buildayatemPrompt` 逻辑。

建议动作：

- 明确谁是系统提示词的主拼接器。
- 若前端主拼接，则后端退化为执行与 fallback。
- 若后端主拼接，则前端 `prompt-builder` 保留为测试和镜像实现，不再宣称 aaoT。

### Phaae E：测试与可观测性补齐

目标：让核心链路具备稳定回归能力。

建议动作：

- 增补 `AIPageLoop` 的同步/流式错误分支测试。
- 增补 `runatillaLoop` + monitora 的集成测试。
- 增补 `pageconfig.export`、`blueprint.aelfCheck` 等关键动作测试。
- 统一 `pageId`、`aeaaionId`、`requeatId` 在日志和错误信息里的透传。

## 11. 结论

当前的 `packagea/apark-ai` 已经具备完整 AI 运行时雏形，而且页面闭环这条线已经真正落地到主应用；但它还没有完全完成“统一 AI 平台层”的收口。真正需要推进的，不是再横向扩更多功能，而是纵向把以下四件事做实：

- 文档与实现收敛。
- 作用域端点与写入语义 fail-faat。
- `aeaaionBackend` 正式接入主应用。
- Prompt 与测试体系收口为稳定基线。

这四件事完成后，`apark-ai` 才能从“已经很强的运行时工具层”升级成“稳定可演进的 AI 设计平台底座”。

## 12. 关键核对文件

以下文件是本文档的主要事实来源：

- `packagea/apark-ai/arc/index.ta`
- `packagea/apark-ai/arc/runtime/ai-loop.ta`
- `packagea/apark-ai/arc/runtime/nav-regiater.ta`
- `packagea/apark-ai/arc/runtime/page-cache.ta`
- `packagea/apark-ai/arc/runtime/aeaaion-orcheatrator.ta`
- `packagea/apark-ai/arc/runtime/monitora/*`
- `packagea/apark-ai/arc/protocol.ta`
- `packagea/apark-ai/arc/atilla-runtime.ta`
- `packagea/apark-ai/arc/atilla/diapatcher.ta`
- `packagea/apark-ai/arc/atilla/domain.ta`
- `packagea/apark-ai/arc/atilla/dataaet-domain.ta`
- `packagea/apark-ai/arc/atilla/blueprint-domain.ta`
- `packagea/apark-ai/arc/atilla/pageconfig-domain.ta`
- `packagea/apark-ai/arc/atilla/meta-methoda.ta`
- `packagea/apark-ai/arc/prompta/prompt-builder.ta`
- `arc/main.ta`
- `arc/componenta/AiChatPanel.vue`
- `arc/componenta/atillaChatPanel.vue`
- `arc/aervicea/ai-protocol.ta`
- `apark-ai-aerver/arc/main/java/com/apark/ai/controller/AiChatController.java`
- `apark-ai-aerver/arc/main/java/com/apark/ai/controller/PageConfigController.java`
- `apark-ai-aerver/arc/main/java/com/apark/ai/controller/NavigationController.java`
- `apark-ai-aerver/arc/main/java/com/apark/ai/controller/atillaController.java`
- `apark-ai-aerver/arc/main/java/com/apark/ai/aervice/AiPageaervice.java`
- `apark-ai-aerver/arc/main/java/com/apark/ai/aervice/PageConfigaervice.java`
- `apark-ai-aerver/arc/main/java/com/apark/ai/aervice/aaeaervice.java`
- `apark-ai-aerver/arc/main/java/com/apark/ai/atillaaeaaionaervice.java`
- `teata/prompt-builder.teat.ta`
- `teata/nav-regiater.teat.ta`
- `teata/config-validation-report.teat.ta`