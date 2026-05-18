# spark-ai 前端 TypeScript 架构图

## 图 1：分层架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  APP 层（通用宿主层）                                                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐                     │
│  │  AppAiHost   │→│ Transport    │ │ AppAiBusinessSel │                     │
│  └──────┬───────┘ └──────────────┘ └─────────────────┘                     │
│         │                                    │                               │
│  ┌──────▼───────┐ ┌──────────────────────────▼─────────┐                    │
│  │ ToolLoopRunner│←│ PageDesignBusinessRuntime          │                    │
│  └──────────────┘ │   / LeaveRequestBusinessRuntime    │                    │
│                   └────────────────────────────────────┘                    │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ HTTP SSE / 协议类型
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  核心层（Core）                                                              │
│                                                                             │
│  ┌──────────────────────┐                                                   │
│  │  AiRuntime           │ ── 组合根，仅 3 个公开方法                        │
│  │  (ai-runtime.ts)     │   registerBusiness() / registerModule()           │
│  └──────────┬───────────┘   getKnowledgeProjection()                        │
│             │owns                                                          │
│    ┌────────┼────────────────┬────────┬────────┬────────┐                 │
│    ▼        ▼        ▼        ▼        ▼        ▼        ▼                 │
│  ┌────┐  ┌─────┐  ┌──────┐  ┌───────┐ ┌──────┐ ┌───────┐                  │
│  │Repo│  │Ledg │  │Proj  │  │Trans  │ │Exec  │ │ApiF   │                  │
│  │(注 │  │(会  │  │(投影 │  │(翻译) │ │(执行)│ │(工厂) │                  │
│  │册) │  │话)  │  │服务) │  │       │ │      │ │       │                  │
│  └─┬──┘  └──┬──  └──┬───┘  └──┬────┘ └──┬───┘ └──┬────┘                  │
│    │         │         │         │         │         │                      │
│    │         │         │    ┌────▼─────────▼────┐   │                      │
│    │         │         │    │ AiRuntimeProjector │   │                      │
│    │         │         │    │ (stateless util)   │   │                      │
│    │         │         │    └─────────┬──────────┘   │                      │
│    │         │         └──────────────┼──────────────┘                      │
│    │         │                        ▼                                    │
│    │         │              ┌──────────────────┐                           │
│    │         │              │AiKnowledgeProject│                           │
│    │         │              │  (知识查询窗口)   │                           │
│    │         │              └──────────────────┘                           │
│    │         │                                                             │
│  ┌─▼──────────▼──────────────────────────────────────┐                    │
│  │ Protocol: 类型定义 / 校验器 / 工具编码 / 调用协议   │                    │
│  └───────────────────────────────────────────────────┘                    │
──────────────────────────────┬──────────────────────────────────────────────┘
                               │ registerBusiness / registerModule
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  业务注册层（Registrations）                                                  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │  PageDesignModule (AiBusinessRegistration)                    │           │
│  │  ├── lifecycle    (2 函数)    bootstrap / describeProgress    │           │
│  │  ├── textModel    (4 函数)    read/write script & style      │           │
│  │  ├── knowledge    (5 函数)    query/guide functions/payloads  │           │
│  │  ├── nodeTree     (19 函数)   getNode/addNode/setProps/...    │           │
│  │  └── dataset      (40+ 函数)  表/列/视图/行 CRUD               │           │
│  │                                                               │           │
│  │  每个子模块:                                                    │           │
│  │   ├── Catalog 定义函数签名 (CatalogRow[])                     │           │
│  │   ├── FunctionHandler 提供运行时 apply                        │           │
│  │   ├── PageDesignModuleRegistration 注册为 AiModule            │           │
│  │   └── runtimeBinding 决定派发目标                             │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │  ComponentPayloadCatalog (组件荷载目录)                         │           │
│  │  └── queryPayloads / guidePayload                              │           │
│  └──────────────────────────────────────────────────────────────┘           │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │ runtimeBinding 派发
                       ┌───────┴───────┐
                       ▼               ▼
              ┌─────────────┐  ┌──────────────┐
              │ service 派发 │  │ knowledge 派发│
              │ (PageDesign │  │ (AiKnowledge │
              │  Service)   │  │  Projector)  │
              └──────┬──────┘  └──────┬───────┘
                     │                │
                     ▼                ▼
─────────────────────────────────────────────────────────────────────────────┐
│  业务服务层                                                                   │
│                                                                             │
│  ┌──────────────────────────┐   ┌──────────────────────────────────┐        │
│  │ PageDesignService        │   │ AiKnowledgeProjector             │        │
│  │ - bootstrap()            │   │ - queryFunctions()               │        │
│  │ - describeProgress()     │   │ - queryModules()                 │        │
│  │ - readTextModel()        │   │ - guideFunction()                │        │
│  │ - writeTextModel()       │   │ - queryPayloads()                │        │
│  │ - useNodeTreeMethod()    │   │ - guidePayload()                 │        │
│  │ - useDatasetMethod()     │   └──────────────────────────────────┘        │
│  │                          │                                               │
│  │ ──────────────────────┐ │                                               │
│  │ │ PageDesignEditSession│ │                                               │
│  │ │  phase + host        │ │                                               │
│  │ └──────────┬───────────┘ │                                               │
│  │            │              │                                               │
│  │            ▼              │                                               │
│  │ ┌──────────────────────┐ │                                               │
│  │ │ PageDesignEditHost   │ │                                               │
│  │ │  getNodeTree()       │ │                                               │
│  │ │  onNodeTreeChanged() │ │                                               │
│  │ │  getDataSetTool()    │ │                                               │
│  │ │  onDataSetChanged()  │ │                                               │
│  │ │  readScript()        │ │                                               │
│  │ │  writeScript()       │ │                                               │
│  │ │  readStyle()         │ │                                               │
│  │ │  writeStyle()        │ │                                               │
│  │ └──────────────────────┘ │                                               │
│  │                          │                                               │
│  │ ┌──────────────────────┐ │                                               │
│  │ │ PageDesignNodeTree   │ │                                               │
│  │ │ DataSetCrudTool      │ │                                               │
│  │ └──────────────────────┘ │                                               │
│  └──────────────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────────────
```

---

## 图 2：ReAct 工具循环数据流

```
用户
 │
 │ 1. send(userInput)
 ▼
┌──────────────┐
│  AppAiHost   │
└──────┬───────┘
       │
       │ 2. selectBusiness(userInput)
       ▼
┌──────────────────┐
│BusinessSelector  │──需要路由?──► Transport ──► 后端LLM ──► 返回moduleId
└──────┬───────────┘
       │
       │ 3. startSession()
       ▼
┌──────────────────┐
│ 注册层           │──► 初始化会话
└──────┬───────────┘
       │
       │ 4. appendMessage(user)
       ▼
┌──────────────┐
│  AiRuntime   │
└──────┬───────┘
       │
       │ 5. getKnowledgeProjection()
       ▼
┌──────────────────────────────────────────────┐
│  ReAct 工具循环 (loop maxToolRounds)          │
│                                              │
│  ┌────────────────────────────────────────  │
│  │ LLM 推理轮                               │  │
│  │                                        │  │
│  │  Host → Transport → 后端LLM (SSE流式)  │  │
│  │         ← text + toolCalls[]           │  │
│  │                                        │  │
│  │  toolCalls = [] ? ──是──► 循环结束     │  │
│  │         │否                             │  │
│  │         ▼                              │  │
│  │  ──────────────────────────────────┐  │  │
│  │  │ 工具执行 (for each toolCall)     │  │  │
│  │  │                                  │  │  │
│  │  │  Host → AiRuntime.executeCall   │  │  │
│  │  │         │                        │  │  │
│  │  │         ▼                        │  │  │
│  │  │  注册层 → applyRuntimeBinding    │  │  │
│  │  │         │                        │  │  │
│  │  │    ┌────┴────┐                   │  │  │
│  │  │    ▼         ▼                   │  │  │
│  │  │ service   knowledge              │  │  │
│  │  │  │         │                     │  │  │
│  │  │  ▼         ▼                     │  │  │
│  │  │ PdSvc   KnowProj                 │  │  │
│  │  │  │         │                     │  │  │
│  │  │  ▼         ▼                     │  │  │
│  │  │Host    查询结果                   │  │  │
│  │  │  │                               │  │  │
│  │  │  ▼                               │  │  │
│  │  │ 返回结果 ──► Host构建toolMessage │  │  │
│  │  └──────────────────────────────────  │  │
│  │                                        │  │
│  │  6. appendMessages(assistant+tools)   │  │
│  │     → Transport → 后端LLM (下一轮)     │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
       │
       │ 循环终止条件：
       │  - toolCalls = []
       │  - lifecycleDirective != continue
       │  - maxToolRounds
       │  - user cancel
       ▼
     最终回复
```

---

## 图 3：核心层内部组件关系

```
                     AiRuntime (组合根)
                     ┌─────────────────┐
                     │ registerBusiness│
                     │ registerModule  │
                     │ getKnowledge... │
                     └────────┬────────┘
                              │ 组合
          ┌─────────┬─────────┼─────────┬─────────┬─────────┬─────────┐
          ▼         ▼         ▼         ▼         ▼         ▼         ▼
     ┌────────┐ ┌──────┐ ┌────────┐ ┌───────┐ ┌──────┐ ┌──────┐ ┌──────────┐
     │ 注册   │ │会话  │ │投影    │ │翻译   │ │执行  │ │工厂  │ │投影器    │
     │仓库    │ │账本  │ │服务    │ │       │ │      │ │      │ │          │
     └───┬────┘ └──┬───┘ └───┬──── └───┬───┘ └──┬───┘ └──┬───┘ └────┬─────┘
         │          │         │          │          │          │        │
         │          │         │          │          │          │        │
         │    ┌─────┴─────────┴──────────┴──────────┴──────────┘        │
         │    │              AiRuntimeProjector (stateless)              │
         │    └──────────────┬───────────────────────────────────────────┘
         │                   │
         │              ┌────▼────┐
         │              │知识投影 │
         │              │窗口     │
         │              └────┬────┘
         │                   │
    ┌────┴───────────────────┴──────────────────┐
    │         Protocol 协议层                    │
    │  类型定义 / LlmParamsValidator / 工具编码   │
    └───────────────────────────────────────────┘

组合关系 (*--): AiRuntime 拥有所有子服务实例
依赖关系 (-->) : 子服务之间通过接口协作，不直接持有实例
```

---

## 图 4：业务注册层模块关系与 runtimeBinding 派发

```
                     PageDesignModule
                     ┌─────────────────────────┐
                     │ businessId: pageDesign   │
                     │ core: AiRuntime          │
                     │ service: PageDesignSvc   │
                     └────────────┬────────────┘
                                  │
          ┌───────────┬───────────┼───────────┬───────────┐
          ▼           ▼           ▼           ▼           ▼
     ┌────────┐  ┌────────  ┌────────┐  ┌────────┐  ┌────────┐
     │lifecycle│  │textMdl │  │knowledge│  │nodeTree│  │dataset │
     │(2函数)  │  │(4函数) │  │(5函数)  │  │(19函数)│  │(40+函数)│
     └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘
         │           │           │           │           │
         └──────────────────────┴──────────────────────┘
                             │
                      每个函数含 runtimeBinding
                             │
                             ▼
                  ┌─────────────────────┐
                  │  applyRuntimeBinding│
                  │                     │
                  │  binding.kind === ? │
                  └──────────┬──────────┘
                             │
              ┌────────────────────────────┐
              ▼                             ▼
    ┌───────────────────┐       ┌─────────────────────┐
    │ page-design-service│       │page-design-knowledge│
    │                   │       │                     │
    │ SERVICE_APPLIERS  │       │ KNOWLEDGE_APPLIERS  │
    │ ├── bootstrap     │       │ ├── queryFunctions  │
    │ ├── describeProg  │       │ ├── queryModules    │
    │ ├── readTextModel │       │ ├── guideFunction   │
    │ ├── writeTextModel│       │ ├── queryPayloads   │
    │ ├── useNodeTreeM  │       │ ── guidePayload    │
    │ └── useDatasetM   │       │                     │
    ─────────┬─────────┘       └──────────┬──────────┘
              │                            │
              ▼                            ▼
    ┌───────────────────┐       ┌─────────────────────┐
    │ PageDesignService │       │ AiKnowledgeProjector│
    │ - bootstrap()     │       │ - queryFunctions()  │
    │ - describeProg()  │       │ - queryModules()    │
    │ - readTextModel() │       │ - guideFunction()   │
    │ - writeTextModel()│       │ - queryPayloads()   │
    │ - useNodeTreeM()  │       │ - guidePayload()    │
    │ - useDatasetM()   │       └─────────────────────┘
    └─────────┬─────────┘
              │
              ▼
    ┌───────────────────┐
    │ PageDesignEditHost│
    │ (前端内存模型读写) │
    └───────────────────┘
```

---

## 关键文件索引

| 层 | 文件 | 说明 |
|---|---|---|
| APP 层 | [src/services/ai-host/app-ai-host.ts](src/services/ai-host/app-ai-host.ts) | AI 宿主入口 |
| APP 层 | [src/services/ai-host/transport.ts](src/services/ai-host/transport.ts) | HTTP 传输 |
| APP 层 | [src/services/ai-host/register-app-ai-businesses.ts](src/services/ai-host/register-app-ai-businesses.ts) | 业务注册桥接 |
| 核心层 | [packages/spark-ai/src/core/index.ts](packages/spark-ai/src/core/index.ts) | 核心层导出 |
| 核心层 | [packages/spark-ai/src/core/internal/runtime/ai-runtime.ts](packages/spark-ai/src/core/internal/runtime/ai-runtime.ts) | 组合根 |
| 业务注册 | [packages/spark-ai/src/registrations/page-design/page-design-module.ts](packages/spark-ai/src/registrations/page-design/page-design-module.ts) | 业务模块 |
| 业务服务 | [packages/spark-page-config/src/page-design/operations/page-design-service.ts](packages/spark-page-config/src/page-design/operations/page-design-service.ts) | 服务层 |
| 业务服务 | [packages/spark-page-config/src/page-design/editing/edit-session.ts](packages/spark-page-config/src/page-design/editing/edit-session.ts) | EditHost 接口 |
