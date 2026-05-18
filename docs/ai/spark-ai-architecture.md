# spark-ai 前端 TypeScript 架构图

## 图 1：分层架构

```mermaid
flowchart TB
    subgraph APP["APP 层（通用宿主层）"]
        direction TB
        appHost["AppAiHost"]
        transport["FetchAppAiHostTransport"]
        selector["AppAiBusinessSelector"]
        toolLoop["AppAiToolLoopRunner"]
        registerBiz["registerAppAiBusinesses()"]
        bizRuntime["PageDesignBusinessRuntime<br/>LeaveRequestBusinessRuntime"]

        appHost --> transport
        appHost --> selector
        appHost --> toolLoop
        registerBiz -.-> bizRuntime
        bizRuntime -.-> selector
    end

    subgraph CORE["核心层（Core）"]
        direction TB
        aiRuntime["AiRuntime<br/>(组合根)"]
        repo["AiRegistrationRepository"]
        ledger["AiSessionLedger"]
        projection["AiProjectionService"]
        translator["AiFunctionCallTranslator"]
        executor["AiFunctionCallExecutor"]
        apiFactory["AiRegisteredApiFactory"]
        knowledge["AiKnowledgeProjector"]
        validator["LlmParamsValidator"]
        toolCodec["createAiRuntimeToolCodec()"]
        protocol["Protocol 类型定义"]

        aiRuntime --> repo
        aiRuntime --> ledger
        aiRuntime --> projection
        aiRuntime --> translator
        aiRuntime --> executor
        aiRuntime --> apiFactory
        apiFactory --> repo
        apiFactory --> ledger
        apiFactory --> projection
        apiFactory --> translator
        apiFactory --> executor
        translator --> projection
        translator --> repo
        translator --> ledger
        executor --> ledger
        executor --> translator
        projection --> repo
        projection --> ledger
        projection --> knowledge
        knowledge --> protocol
        toolCodec --> knowledge
    end

    subgraph REG["业务注册层（Registrations）"]
        direction TB
        pageDesign["PageDesignModule<br/>(AiBusinessRegistration)"]
        lifecycle["PageDesignLifecycleCatalog"]
        textModel["PageDesignTextModelCatalog"]
        knowledgeCatalog["PageDesignKnowledgeCatalog"]
        nodeTree["PageDesignNodeTreeCatalog"]
        dataset["PageDesignDatasetCatalog"]
        toolCatalog["PageDesignToolCatalog<br/>(抽象基类)"]
        payloadCatalog["ComponentPayloadCatalog<br/>(组件荷载目录)"]

        pageDesign --> lifecycle
        pageDesign --> textModel
        pageDesign --> knowledgeCatalog
        pageDesign --> nodeTree
        pageDesign --> dataset
        lifecycle -.-> toolCatalog
        textModel -.-> toolCatalog
        knowledgeCatalog -.-> toolCatalog
        nodeTree -.-> toolCatalog
        dataset -.-> toolCatalog
        pageDesign --> payloadCatalog
    end

    subgraph SVC["业务服务层"]
        direction TB
        pdService["PageDesignService"]
        editSession["PageDesignEditSession"]
        editHost["PageDesignEditHost<br/>(接口)"]
        nodeTreeModel["PageDesignNodeTree"]
        dataSetTool["DataSetCrudTool"]

        pdService --> editSession
        pdService --> editHost
        pdService --> nodeTreeModel
        pdService --> dataSetTool
    end

    APP --> CORE
    CORE -.-> REG
    pageDesign --> pdService
    pageDesign --> aiRuntime

    bindingNote["runtimeBinding 派发机制:<br/>service → PageDesignService<br/>knowledge → AiKnowledgeProjector"]
    lifecycle -.-> bindingNote
    knowledgeCatalog -.-> bindingNote
    bindingNote -.-> pdService
    bindingNote -.-> knowledge
```

---

## 图 2：ReAct 工具循环数据流

```mermaid
flowchart LR
    subgraph 阶段1["阶段1: 用户输入与业务路由"]
        User["用户"]
        host["AppAiHost"]
        selector2["AppAiBusinessSelector"]
        transport2["FetchAppAiHostTransport"]
        llmServer["后端 LLM Server"]
        registration["PageDesignModule"]

        User --> host
        host --> selector2
        selector2 --> transport2
        transport2 --> llmServer
        llmServer --> transport2
        transport2 --> selector2
        selector2 --> registration
        registration --> selector2
        selector2 --> host
    end

    subgraph 阶段2["阶段2: ReAct 工具循环"]
        runtime["AiRuntime"]
        host2["AppAiHost"]

        host2 --> runtime
        runtime --> host2
        host2 --> runtime
        runtime --> host2
    end

    subgraph 阶段3["阶段3: 工具调用执行"]
        reg2["PageDesignModule"]
        service["PageDesignService"]
        editHost2["PageDesignEditHost"]

        host2 --> runtime
        runtime --> reg2
        reg2 --> service
        service --> editHost2
        editHost2 --> service
        service --> reg2
        reg2 --> runtime
        runtime --> host2
    end

    subgraph 阶段4["阶段4: LLM 继续推理"]
        host3["AppAiHost"]
        transport3["FetchAppAiHostTransport"]
        llmServer2["后端 LLM Server"]

        host3 --> transport3
        transport3 --> llmServer2
        llmServer2 --> transport3
        transport3 --> host3
    end

    阶段1 --> 阶段2
    阶段2 --> 阶段3
    阶段3 --> 阶段4
```

---

## 图 3：核心层内部组件关系

```mermaid
flowchart TB
    subgraph runtime["runtime"]
        direction TB
        aiRuntime["AiRuntime<br/>(组合根)"]
        repo["AiRegistrationRepository"]
        ledger["AiSessionLedger"]
        projection["AiProjectionService"]
        translator["AiFunctionCallTranslator"]
        executor["AiFunctionCallExecutor"]
        apiFactory["AiRegisteredApiFactory"]
        projector["AiRuntimeProjector"]
    end

    subgraph knowledge["knowledge"]
        knowledgeProj["AiKnowledgeProjector"]
    end

    subgraph protocol["protocol"]
        direction TB
        api1["AiRuntimeApi"]
        api2["AiRegisteredModuleApi"]
        api3["AiRegisteredBusinessApi"]
        api4["AiKnowledgeProjection"]
        validator["LlmParamsValidator"]
        invocation["AiInvocationProtocol"]
    end

    %% Composition
    aiRuntime *-- repo
    aiRuntime *-- ledger
    aiRuntime *-- projection
    aiRuntime *-- translator
    aiRuntime *-- executor
    aiRuntime *-- apiFactory
    aiRuntime *-- projector
    projection *-- knowledgeProj

    %% Dependencies
    apiFactory --> repo
    apiFactory --> ledger
    apiFactory --> projection
    apiFactory --> translator
    apiFactory --> executor
    translator --> repo
    translator --> ledger
    translator --> projection
    executor --> ledger
    executor --> translator
    projection --> repo
    projection --> ledger

    %% Interface implementation
    aiRuntime -.-> api1
    apiFactory -.-> api2
    apiFactory -.-> api3
    knowledgeProj -.-> api4
    validator -.-> executor
```

---

## 图 4：业务注册层模块关系与 runtimeBinding 派发

```mermaid
flowchart TB
    subgraph registrations["spark-ai/registrations/page-design"]
        direction TB
        pageDesign["PageDesignModule<br/>businessId: pageDesign"]
        pdReg["PageDesignModuleRegistration"]
        toolCatalog["PageDesignToolCatalog<br/>(抽象基类)"]
        lifecycle["PageDesignLifecycleCatalog<br/>(2 函数)"]
        textModel["PageDesignTextModelCatalog<br/>(4 函数)"]
        knowledge["PageDesignKnowledgeCatalog<br/>(5 函数)"]
        nodeTree["PageDesignNodeTreeCatalog<br/>(19 函数)"]
        dataset["PageDesignDatasetCatalog<br/>(40+ 函数)"]
        payload["ComponentPayloadCatalog"]
        catalogRow["PageDesignFunctionCatalogRow"]
    end

    subgraph dispatch["runtimeBinding 派发"]
        direction TB
        applyBinding["applyRuntimeBinding"]
        svcAppliers["PAGE_DESIGN_SERVICE_BINDING_APPLIERS<br/>bootstrap, describeProgress,<br/>readTextModel, writeTextModel,<br/>useNodeTreeMethod, useDatasetMethod"]
        knAppliers["PAGE_DESIGN_KNOWLEDGE_BINDING_APPLIERS<br/>queryFunctions, queryModules,<br/>guideFunction, queryPayloads, guidePayload"]
    end

    subgraph external["外部依赖"]
        direction TB
        pdService["PageDesignService"]
        knowledgeProj["AiKnowledgeProjector"]
    end

    %% Composition
    pageDesign o-- pdReg
    pageDesign --> pdService
    pageDesign --> runtime_core["AiRuntime"]

    %% Catalogs
    lifecycle --> pdReg
    textModel --> pdReg
    knowledge --> pdReg
    nodeTree --> pdReg
    dataset --> pdReg

    %% Inheritance
    lifecycle --> toolCatalog
    textModel --> toolCatalog
    knowledge --> toolCatalog
    nodeTree --> toolCatalog
    dataset --> toolCatalog

    %% Payload
    payload --> pageDesign

    %% runtimeBinding
    catalogRow --> applyBinding
    applyBinding --> svcAppliers
    applyBinding --> knAppliers

    %% Service dispatch
    svcAppliers --> pdService
    knAppliers --> knowledgeProj
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
