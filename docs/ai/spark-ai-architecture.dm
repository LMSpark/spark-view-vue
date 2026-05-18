@startuml spark-ai-layered-architecture
!theme plain
skinparam defaultFontSize 13
skinparam defaultFontName "Microsoft YaHei"
skinparam roundCorner 8
skinparam shadowing false

skinparam rectangle {
  BackgroundColor<<app>> #E3F2FD
  BorderColor<<app>> #1565C0
  BackgroundColor<<core>> #FFF3E0
  BorderColor<<core>> #E65100
  BackgroundColor<<registration>> #F3E5F5
  BorderColor<<registration>> #6A1B9A
  BackgroundColor<<service>> #E8F5E9
  BorderColor<<service>> #2E7D32
}

title spark-ai 分层架构

rectangle "APP 层（通用宿主层）" <<app>> as app {
  rectangle "AppAiHost" as appHost
  rectangle "FetchAppAiHostTransport" as transport
  rectangle "AppAiBusinessSelector" as selector
  rectangle "AppAiToolLoopRunner" as toolLoop
  rectangle "registerAppAiBusinesses()" as registerBiz
  rectangle "PageDesignBusinessRuntime\nLeaveRequestBusinessRuntime" as bizRuntime
}

rectangle "核心层（Core）" <<core>> as core {
  rectangle "AiRuntime\n(组合根)" as aiRuntime #FFCC80
  rectangle "AiRegistrationRepository" as repo
  rectangle "AiSessionLedger" as ledger
  rectangle "AiProjectionService" as projection
  rectangle "AiFunctionCallTranslator" as translator
  rectangle "AiFunctionCallExecutor" as executor
  rectangle "AiRegisteredApiFactory" as apiFactory
  rectangle "AiKnowledgeProjector" as knowledge
  rectangle "LlmParamsValidator" as validator
  rectangle "createAiRuntimeToolCodec()" as toolCodec
  rectangle "Protocol 类型定义\nruntime/session/tool/..." as protocol
}

rectangle "业务注册层（Registrations）" <<registration>> as reg {
  rectangle "PageDesignModule\n(AiBusinessRegistration)" as pageDesign #CE93D8
  rectangle "PageDesignLifecycleCatalog" as lifecycle
  rectangle "PageDesignTextModelCatalog" as textModel
  rectangle "PageDesignKnowledgeCatalog" as knowledgeCatalog
  rectangle "PageDesignNodeTreeCatalog" as nodeTree
  rectangle "PageDesignDatasetCatalog" as dataset
  rectangle "PageDesignToolCatalog\n(抽象基类)" as toolCatalog
  rectangle "ComponentPayloadCatalog\n(组件荷载目录)" as payloadCatalog
}

rectangle "业务服务层" <<service>> as svc {
  rectangle "PageDesignService" as pdService #A5D6A7
  rectangle "PageDesignEditSession" as editSession
  rectangle "PageDesignEditHost\n(接口)" as editHost
  rectangle "PageDesignNodeTree" as nodeTreeModel
  rectangle "DataSetCrudTool" as dataSetTool
}

' APP Layer internal
appHost --> transport : 使用
appHost --> selector : 创建
appHost --> toolLoop : 创建
registerBiz ..> bizRuntime : 注册
bizRuntime ..> selector : 路由候选

' APP to Core
transport --> core : HTTP SSE 流 / 协议类型
selector --> core : AiInvocationProtocol
toolLoop --> core : AiRuntimeKnowledgeProjection / 工具翻译
bizRuntime --> core : executeFunctionCall / appendMessage / startSession

' Core internal
aiRuntime --> repo : 组合
aiRuntime --> ledger : 组合
aiRuntime --> projection : 组合
aiRuntime --> translator : 组合
aiRuntime --> executor : 组合
aiRuntime --> apiFactory : 组合
apiFactory --> repo : 依赖
apiFactory --> ledger : 依赖
apiFactory --> projection : 依赖
apiFactory --> translator : 依赖
apiFactory --> executor : 依赖
translator --> projection : 依赖
translator --> repo : 依赖
translator --> ledger : 依赖
executor --> ledger : 依赖
executor --> translator : 依赖
projection --> repo : 依赖
projection --> ledger : 依赖
projection --> knowledge : 组合
knowledge --> protocol : 类型引用
toolCodec --> knowledge : 投影转 tool specs

' Core to Registration
repo ..> reg : 注册 AiModuleRegistration
aiRuntime ..> reg : registerBusiness / registerModule
toolCodec ..> reg : 读取注册信息

' Registration internal
pageDesign --> lifecycle : 子模块
pageDesign --> textModel : 子模块
pageDesign --> knowledgeCatalog : 子模块
pageDesign --> nodeTree : 子模块
pageDesign --> dataset : 子模块
lifecycle ..> toolCatalog : 继承
textModel ..> toolCatalog : 继承
knowledgeCatalog ..> toolCatalog : 继承
nodeTree ..> toolCatalog : 继承
dataset ..> toolCatalog : 继承
pageDesign --> payloadCatalog : 组件荷载
pageDesign --> core : 内部持有 AiRuntime

' Registration to Service
pageDesign --> pdService : 创建
pdService --> editSession : 管理
pdService --> editHost : 依赖注入
pdService --> nodeTreeModel : 操作
pdService --> dataSetTool : 操作

' runtimeBinding 派发
note as bindingNote
  runtimeBinding 派发机制:
  - kind = 'page-design-service'
    路由到 PageDesignService 方法
  - kind = 'page-design-knowledge'
    路由到 AiKnowledgeProjector 查询
end note

lifecycle ..> bindingNote
textModel ..> bindingNote
knowledgeCatalog ..> bindingNote
nodeTree ..> bindingNote
dataset ..> bindingNote
bindingNote ..> pdService
bindingNote ..> knowledge

@enduml


@startuml spark-ai-dataflow-sequence
!theme plain
skinparam defaultFontSize 12
skinparam defaultFontName "Microsoft YaHei"
skinparam sequenceMessageAlign center
skinparam shadowing false

title spark-ai ReAct 工具循环数据流

actor 用户 as User
participant "AppAiHost" as host #E3F2FD
participant "AppAiBusinessSelector" as selector #E3F2FD
participant "FetchAppAiHostTransport" as transport #BBDEFB
participant "后端 LLM Server" as llmServer #FFCDD2
participant "AiRuntime" as runtime #FFCC80
participant "业务注册层\n(PageDesignModule)" as registration #CE93D8
participant "PageDesignService" as service #A5D6A7
participant "PageDesignEditHost" as editHost #C8E6C9

== 阶段 1：用户输入与业务路由 ==

User -> host : send(userInput)
activate host
host -> selector : selectBusiness(userInput, turn)
activate selector

alt 已有选中业务 && 可复用
  selector --> host : 返回当前 AppAiSelectedBusiness
else 需要重新路由
  selector -> transport : routeBusiness(candidates, userInput)
  activate transport
  transport -> llmServer : POST /route (LLM 推理业务意图)
  activate llmServer
  llmServer --> transport : { moduleId, confidence, reason }
  deactivate llmServer
  transport --> selector : AppAiRouteDecision
  deactivate transport

  selector -> registration : resolveBusinessInstance(input)
  activate registration
  selector -> registration : startSession(context)
  registration --> selector : AiRuntimeStartSessionResult
  deactivate registration
  selector --> host : AppAiSelectedBusiness {runtime, scope, projection}
end

deactivate selector

== 阶段 2：ReAct 工具循环 ==

host -> runtime : appendMessage(role=user, content=userInput)
activate runtime
runtime --> host : 消息已追加
deactivate runtime

loop 最大 maxToolRounds 轮（默认无限制）
  host -> runtime : getKnowledgeProjection()
  activate runtime
  runtime --> host : AiRuntimeKnowledgeProjection
  deactivate runtime

  host -> host : 创建 AiRuntimeToolCodec\n(enabledActions, projection)

  host -> transport : streamTurn(sessionId, systemPrompt, tools[], messages[])
  activate transport
  transport -> llmServer : POST /sessions/{id}/turn/stream
  activate llmServer

  llmServer --> transport : SSE delta (推理文本流)
  transport --> host : onDelta(delta)
  host --> User : 流式显示

  llmServer --> transport : SSE result {text, toolCalls[]}
  deactivate llmServer
  transport --> host : AppAiStreamTurnResult
  deactivate transport

  alt toolCalls.length == 0
    host --> User : 回复完成，循环结束
    break 退出循环
  end

  host -> host : appendMessage(role=assistant, content=text)

  == 阶段 3：工具调用执行 ==

  for each toolCall in result.toolCalls
    host -> runtime : executeFunctionCall(action, args, projection)
    activate runtime

    runtime -> registration : 根据 moduleId 派发到对应模块
    activate registration

    registration -> registration : applyRuntimeBinding(runtimeBinding)

    alt binding.kind == 'page-design-service'
      registration -> service : bootstrap / readTextModel / useNodeTreeMethod / useDatasetMethod ...
      activate service
      service -> editHost : getNodeTree / readScript / writeScript ...
      activate editHost
      editHost --> service : 返回前端内存模型数据
      deactivate editHost
      service --> registration : PageDesignServiceResult {ok, data, summary}
      deactivate service
    else binding.kind == 'page-design-knowledge'
      registration -> runtime : knowledge.queryFunctions / queryModules / guideFunction ...
      activate runtime
      runtime --> registration : AiKnowledgeFunctionSummary[]
      deactivate runtime
    end

    registration --> runtime : AiRuntimeFunctionCallResult
    deactivate registration
    runtime --> host : 执行结果
    deactivate runtime

    host -> host : 构建 toolMessage(role=tool)
  end

  host -> transport : appendMessages([assistantMessage, ...toolMessages])
  activate transport
  transport -> llmServer : POST /turn/append (追加上下文)
  llmServer --> transport : OK
  deactivate transport
  deactivate transport
  host -> host : pendingMessages = [assistant, ...tools]

  == 阶段 4：后端 LLM 继续推理（下一轮） ==

  host -> transport : streamTurn(sessionId, systemPrompt, tools[], pendingMessages)
  activate transport
  transport -> llmServer : POST /turn/stream (携带完整上下文)
  activate llmServer
  llmServer --> transport : SSE result {text, toolCalls[]}
  deactivate llmServer
  transport --> host : AppAiStreamTurnResult
  deactivate transport
end

== 阶段 5：循环结束 ==

note over host, editHost
  循环终止条件：
  1. LLM 返回 toolCalls = []（任务完成）
  2. lifecycleDirective.status != 'continue'（业务主动结束）
  3. 达到 maxToolRounds 上限
  4. 用户主动取消（signal.aborted）
end note

host --> User : 最终回复 / 业务状态提示

@enduml


@startuml spark-ai-core-components
!theme plain
skinparam defaultFontSize 12
skinparam defaultFontName "Microsoft YaHei"
skinparam roundCorner 5
skinparam shadowing false

title spark-ai 核心层（Core）内部组件关系

package "core" {

  package "runtime" {
    class AiRuntime <<(C,#FFCC80)>> {
      - projector: AiRuntimeProjector
      - registrations: AiRegistrationRepository
      - sessions: AiSessionLedger
      - projections: AiProjectionService
      - translator: AiFunctionCallTranslator
      - executor: AiFunctionCallExecutor
      - apiFactory: AiRegisteredApiFactory
      --
      + registerBusiness()
      + registerModule()
      + getKnowledgeProjection()
    }

    class AiRegistrationRepository <<(C,#FFE0B2)>> {
      - _businesses: Map
      - _modules: Map
      --
      + registerBusiness()
      + registerModule()
      + getBusiness()
      + getModule()
    }

    class AiSessionLedger <<(C,#FFE0B2)>> {
      - _sessions: Map
      --
      + startSession()
      + stopSession()
      + getSession()
      + appendMessage()
    }

    class AiProjectionService <<(C,#FFE0B2)>> {
      - registrations: AiRegistrationRepository
      - sessions: AiSessionLedger
      - projector: AiRuntimeProjector
      --
      + getKnowledgeProjection()
      + project()
    }

    class AiFunctionCallTranslator <<(C,#FFE0B2)>> {
      - registrations: AiRegistrationRepository
      - sessions: AiSessionLedger
      - projections: AiProjectionService
      --
      + translate()
      + buildToolSpecs()
    }

    class AiFunctionCallExecutor <<(C,#FFE0B2)>> {
      - sessions: AiSessionLedger
      - translator: AiFunctionCallTranslator
      --
      + executeFunctionCall()
    }

    class AiRegisteredApiFactory <<(C,#FFE0B2)>> {
      - registrations: AiRegistrationRepository
      - sessions: AiSessionLedger
      - projections: AiProjectionService
      - translator: AiFunctionCallTranslator
      - executor: AiFunctionCallExecutor
      --
      + createRegisteredModuleApi()
      + createRegisteredBusinessApi()
    }

    class AiRuntimeProjector <<(C,#FFE0B2)>> {
      + projectModule()
      + projectFunction()
    }
  }

  package "knowledge" {
    class AiKnowledgeProjector <<(C,#C8E6C9)>> {
      - projections: Map<scopeKey, snapshot>
      - payloadRegistry
      --
      + updateProjection()
      + queryFunctions()
      + queryModules()
      + guideFunction()
      + queryPayloads()
      + guidePayload()
    }
  }

  package "protocol" {
    interface AiRuntimeApi
    interface AiRegisteredModuleApi
    interface AiRegisteredBusinessApi
    interface AiKnowledgeProjection
    class LlmParamsValidator <<(C,#E0E0E0)>>
    class AiInvocationProtocol <<(C,#E0E0E0)>>
  }
}

' Composition relationships
AiRuntime *-- AiRegistrationRepository
AiRuntime *-- AiSessionLedger
AiRuntime *-- AiProjectionService
AiRuntime *-- AiFunctionCallTranslator
AiRuntime *-- AiFunctionCallExecutor
AiRuntime *-- AiRegisteredApiFactory
AiRuntime *-- AiRuntimeProjector
AiProjectionService *-- AiKnowledgeProjector

' Dependency relationships
AiRegisteredApiFactory --> AiRegistrationRepository
AiRegisteredApiFactory --> AiSessionLedger
AiRegisteredApiFactory --> AiProjectionService
AiRegisteredApiFactory --> AiFunctionCallTranslator
AiRegisteredApiFactory --> AiFunctionCallExecutor

AiFunctionCallTranslator --> AiRegistrationRepository
AiFunctionCallTranslator --> AiSessionLedger
AiFunctionCallTranslator --> AiProjectionService

AiFunctionCallExecutor --> AiSessionLedger
AiFunctionCallExecutor --> AiFunctionCallTranslator

AiProjectionService --> AiRegistrationRepository
AiProjectionService --> AiSessionLedger

AiRuntime ..> AiRuntimeApi : 实现
AiRegisteredApiFactory ..> AiRegisteredModuleApi : 创建
AiRegisteredApiFactory ..> AiRegisteredBusinessApi : 创建
AiKnowledgeProjector ..> AiKnowledgeProjection : 实现
LlmParamsValidator ..> AiFunctionCallExecutor : 参数校验使用

note bottom of AiRuntime
  组合根：仅负责组合子服务，
  不直接暴露 session/projection 操作，
  强制通过 moduleId 绑定路径访问
end note

note bottom of AiKnowledgeProjector
  知识投影：将注册信息扁平化为
  LLM 可理解的函数/模块/组件摘要，
  支持按 moduleId/keyword 过滤
end note

@enduml


@startuml spark-ai-business-registration
!theme plain
skinparam defaultFontSize 12
skinparam defaultFontName "Microsoft YaHei"
skinparam roundCorner 5
skinparam shadowing false

title PageDesignModule 业务注册层 — 模块关系与 runtimeBinding 派发

package "spark-ai/registrations/page-design" {

  class PageDesignModule <<(C,#CE93D8)>> {
    + businessId: 'pageDesign'
    + moduleId: 'pageDesign'
    - service: PageDesignService
    - core: AiRuntime
    - modules[5]: AiModuleRegistration[]
    - parameterPayloadProviders
    --
    + startSession()
    + stopSession()
    + appendMessage()
    + executeFunctionCall()
    + translateFunctionCall()
    + projectKnowledge()
    + getFunctionBindingRuntime()
  }

  class PageDesignModuleRegistration <<(C,#E1BEE7)>> {
    - catalogRows
    - getRuntimeHandlers
    --
    + getFunctions()
  }

  abstract class PageDesignToolCatalog <<(A,#E1BEE7)>> {
    + parameterTable: CatalogRow[]
    + capabilityTable: CapabilityRow[]
    - parameterIndex: Map
    - capabilityIndex: Map
    --
    # {abstract} buildCatalogRows()
    + validateParams(functionId, params)
  }

  class PageDesignLifecycleCatalog <<(C,#F3E5F5)>> {
    + 2 个函数
    - bootstrap
    - describeProgress
  }

  class PageDesignTextModelCatalog <<(C,#F3E5F5)>> {
    + 4 个函数
    - readScript/writeScript
    - readStyle/writeStyle
  }

  class PageDesignKnowledgeCatalog <<(C,#F3E5F5)>> {
    + 5 个函数
    - queryFunctions
    - queryModules
    - guideFunction
    - queryPayloads
    - guidePayload
  }

  class PageDesignNodeTreeCatalog <<(C,#F3E5F5)>> {
    + 19 个函数
    - getNode/addNode/setProps/removeNode...
  }

  class PageDesignDatasetCatalog <<(C,#F3E5F5)>> {
    + 40+ 个函数
    - 表/列/视图/行 CRUD...
  }

  class ComponentPayloadCatalog <<(C,#F3E5F5)>> {
    + SPARK_COMPONENT_PAYLOAD_REF
    + queryPageDesignComponentPayloads()
    + guidePageDesignComponentPayload()
  }

  class PageDesignFunctionCatalogRow <<(E,#F5F5F5)>> {
    + functionId: string
    + type: 'describe'|'request'
    + target: string
    + paramsSchema: LlmParameterSchemaRoot
    + runtimeBinding: Service|Knowledge
  }
}

package "runtimeBinding 派发" {
  component "applyRuntimeBinding()" as applyBinding

  package "Service 派发\n(kind='page-design-service')" as svcBinding {
    component "PAGE_DESIGN_SERVICE_BINDING_APPLIERS" as svcAppliers
    component "bootstrap/describeProgress" as svcLifecycle
    component "readTextModel/writeTextModel" as svcText
    component "useNodeTreeMethod" as svcNodeTree
    component "useDatasetMethod" as svcDataset
  }

  package "Knowledge 派发\n(kind='page-design-knowledge')" as knBinding {
    component "PAGE_DESIGN_KNOWLEDGE_BINDING_APPLIERS" as knAppliers
    component "queryFunctions/queryModules" as knQuery
    component "guideFunction" as knGuideFn
    component "queryPayloads/guidePayload" as knPayload
  }
}

package "外部依赖" {
  class PageDesignService <<(C,#A5D6A7)>> {
    + bootstrap()
    + describeProgress()
    + readTextModel()
    + writeTextModel()
    + useNodeTreeMethod()
    + useDatasetMethod()
  }

  class AiKnowledgeProjector <<(C,#C8E6C9)>> {
    + queryFunctions()
    + queryModules()
    + guideFunction()
    + queryPayloads()
    + guidePayload()
  }
}

' PageDesignModule composition
PageDesignModule o-- PageDesignModuleRegistration : 创建 5 个子模块注册
PageDesignModule *-- PageDesignService : 持有
PageDesignModule *-- AiRuntime : 内部核心

' ModuleRegistration to Catalogs
PageDesignModuleRegistration <|-- PageDesignModule : 使用
PageDesignLifecycleCatalog -- PageDesignModuleRegistration : lifecycle
PageDesignTextModelCatalog -- PageDesignModuleRegistration : textModel
PageDesignKnowledgeCatalog -- PageDesignModuleRegistration : knowledge
PageDesignNodeTreeCatalog -- PageDesignModuleRegistration : nodeTree
PageDesignDatasetCatalog -- PageDesignModuleRegistration : dataset

' Catalog inheritance
PageDesignLifecycleCatalog --|> PageDesignToolCatalog
PageDesignTextModelCatalog --|> PageDesignToolCatalog
PageDesignKnowledgeCatalog --|> PageDesignToolCatalog
PageDesignNodeTreeCatalog --|> PageDesignToolCatalog
PageDesignDatasetCatalog --|> PageDesignToolCatalog

' Payload catalog
ComponentPayloadCatalog --> PageDesignModule : 组件荷载提供

' Catalog row contains runtimeBinding
PageDesignFunctionCatalogRow *-- applyBinding : runtimeBinding 字段

' Service binding dispatch
applyBinding --> svcAppliers : kind == 'page-design-service'
applyBinding --> knAppliers : kind == 'page-design-knowledge'

svcAppliers --> svcLifecycle : bootstrap, describeProgress
svcAppliers --> svcText : readTextModel, writeTextModel
svcAppliers --> svcNodeTree : useNodeTreeMethod
svcAppliers --> svcDataset : useDatasetMethod

knAppliers --> knQuery : queryFunctions, queryModules
knAppliers --> knGuideFn : guideFunction
knAppliers --> knPayload : queryPayloads, guidePayload

' External service calls
svcLifecycle --> PageDesignService : 调用
svcText --> PageDesignService : 调用
svcNodeTree --> PageDesignService : 调用
svcDataset --> PageDesignService : 调用

knQuery --> AiKnowledgeProjector : 调用
knGuideFn --> AiKnowledgeProjector : 调用
knPayload --> AiKnowledgeProjector : 调用

note as catalogNote
  每个 Catalog 子模块：
  1. 定义 CatalogRow[] 描述函数签名
  2. 创建 FunctionHandler[] 提供运行时 apply
  3. 通过 PageDesignModuleRegistration
     注册为 AiModuleRegistration
  4. runtimeBinding 决定执行时派发目标
end note

catalogNote -[hidden]d- PageDesignToolCatalog

@enduml
