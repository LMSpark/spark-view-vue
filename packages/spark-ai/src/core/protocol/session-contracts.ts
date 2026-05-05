import type { FunctionResult, FunctionRuntimeContext, PostValidationWarning } from './function-contracts'

/**
 * 会话编排协议。
 *
 * 这个文件只定义函数循环会话的公共通信契约，供后端适配器、FC 调度器、
 * 编排器与监控器共享：
 * 1. 工具 schema 与 Function Calling 调用消息
 * 2. 会话后端的请求/响应协议
 * 3. 对话回放、监控与 follow-up 协议
 * 4. 编排器配置与最终结果
 *
 * 这里只描述“会话级数据形状”，不承载任何执行逻辑。
 */

/**
 * 功能分区一：FC 工具描述与调用协议
 * 时序说明：
 * 1. 编排器先把 ToolDefinition 列表交给后端，声明本轮可调用工具。
 * 2. 后端返回 LLMResponse，其中 toolCalls 描述模型想调用的工具及参数。
 * 3. 本地执行后产出 ToolResult，再组装为 FcDispatchResult 交回上层。
 */

/**
 * JSON Schema 属性节点。
 * 输入语义：作为 ToolDefinition.parameters 中的属性描述单元。
 * 输出语义：向后端声明每个参数字段的类型、枚举、嵌套属性与必填约束。
 * 调用时机：生成 Function Calling 工具定义时使用。
 */
export interface JsonSchemaProperty {
  type: string | string[]
  description?: string
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  enum?: Array<string | number | null>
}

/**
 * JSON Schema 根对象。
 * 输入语义：描述单个工具参数对象的整体结构。
 * 输出语义：作为 Function Calling `parameters` 的稳定协议形状。
 * 调用时机：工具定义生成阶段由协议层或 runtime adapter 输出。
 */
export interface JsonSchema {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
}

/**
 * 工具函数描述体。
 * 输入语义：承载单个可调用工具的名称、说明和参数 JSON Schema。
 * 输出语义：作为 ToolDefinition.function 的稳定载荷。
 * 调用时机：向后端注册一轮 FC 工具列表时使用。
 */
export interface ToolFunctionDefinition {
  name: string
  description: string
  parameters: JsonSchema
}

/**
 * 单个 Function Calling 工具定义。
 * 输入语义：声明本轮对话允许模型调用的一个工具。
 * 输出语义：后端把这些定义传给模型，用于约束可用工具集合。
 * 调用时机：createSession 或单轮执行前准备 tools 参数时使用。
 */
export interface ToolDefinition {
  type: 'function'
  function: ToolFunctionDefinition
}

/**
 * 工具调用中的函数载荷。
 * 输入语义：模型返回的 function 名称与 arguments 原始 JSON 字符串。
 * 输出语义：供本地 dispatcher 做 action 解析、参数反序列化与执行。
 * 调用时机：读取 LLM 返回的 toolCalls 时使用。
 */
export interface ToolCallFunctionPayload {
  name: string
  arguments: string
}

/**
 * 单次工具调用请求。
 * 输入语义：来自后端/模型的一条 tool call 记录。
 * 输出语义：本地执行层据此定位 action、解析参数并返回结果。
 * 调用时机：编排器处理 LLMResponse.toolCalls 时使用。
 */
export interface ToolCall {
  id: string
  function: ToolCallFunctionPayload
}

/**
 * 单次工具执行回包。
 * 输入语义：把本地执行结果序列化后，按 OpenAI/兼容后端需要的字段组装。
 * 输出语义：作为 tool 消息追加回对话历史。
 * 调用时机：本地函数执行完成、需要回传给后端继续编排时使用。
 */
export interface ToolResult {
  tool_call_id: string
  content: string
}

/**
 * 单次 FC 调度结果。
 * 输入语义：把 toolCall、本地 action、统一 FunctionResult 与序列化后的 ToolResult 聚合到一起。
 * 输出语义：供编排器记录 turn、喂给 monitor，并把 toolResult 回传后端。
 * 调用时机：dispatchToolCall / dispatchToolCallAsync 完成后返回。
 */
export interface FcDispatchResult {
  toolCall: ToolCall
  action: string
  result: FunctionResult
  toolResult: ToolResult
}

/**
 * 功能分区二：会话后端通信协议
 * 时序说明：
 * 1. 编排器先调用 createSession 创建后端会话。
 * 2. 后续每轮通过 executeTurn 拉取模型响应，并可监听 SSE 事件。
 * 3. 本地工具执行后用 appendMessages 把 tool 消息写回会话历史。
 * 4. 结束时可读取会话历史或销毁单会话/全部会话。
 */

/**
 * LLM 单轮回复。
 * 输入语义：后端返回本轮模型的自然语言文本、推理文本与可选工具调用列表。
 * 输出语义：编排器据此判断是直接结束，还是进入工具执行链。
 * 调用时机：每轮 executeTurn 成功返回时使用。
 */
export interface LlmResponse {
  text: string
  reasoning?: string
  toolCalls?: ToolCall[]
}

/**
 * 会话后端 SSE 事件。
 * 输入语义：后端在流式执行过程中推送的最小事件单元。
 * 输出语义：供调试面板、日志系统或页面观测层消费。
 * 调用时机：executeTurn 或其他带流式回调的后端调用期间使用。
 */
export interface SessionBackendSseEvent {
  sessionId: string
  type: string
  data: string
}

/**
 * 单轮执行选项。
 * 输入语义：描述 executeTurn 这一轮的中断信号与 SSE 监听器。
 * 输出语义：后端适配器据此决定是否转发流式事件与是否响应取消。
 * 调用时机：每轮执行 executeTurn 时作为可选配置传入。
 */
export interface SessionBackendTurnOptions {
  signal?: AbortSignal
  onSseEvent?: (event: SessionBackendSseEvent) => void
}

/**
 * 追加到后端会话历史的消息。
 * 输入语义：承载 assistant/tool 等角色消息，以及可选的 tool_call_id 或 tool_calls。
 * 输出语义：作为 appendMessages 的稳定消息协议。
 * 调用时机：本地工具执行后、或需要人工向会话注入消息时使用。
 */
export interface SessionAppendMessage {
  role: string
  content: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

/**
 * 会话历史消息。
 * 输入语义：后端存储后的简化消息视图，只保留角色与文本内容。
 * 输出语义：供调试、回显或测试读取当前会话上下文。
 * 调用时机：调用 getConversation 时返回。
 */
export interface SessionConversationMessage {
  role: string
  content: string
}

/**
 * 会话后端抽象。
 * 输入语义：定义编排器与具体后端实现之间的最小接口边界。
 * 输出语义：任何后端实现只要满足这组方法，即可接入同一套会话编排器。
 * 调用时机：runFunctionLoop 及其相关 runtime 组件通过该接口访问后端。
 */
export interface SessionBackend {
  createSession(
    systemPrompt: string,
    userPrompt: string,
    windowSize: number,
    tools?: ToolDefinition[],
    signal?: AbortSignal,
  ): Promise<string>

  executeTurn(
    sessionId: string,
    options?: SessionBackendTurnOptions,
  ): Promise<LlmResponse | null>

  appendMessages(
    sessionId: string,
    messages: SessionAppendMessage[],
    signal?: AbortSignal,
  ): Promise<void>

  getConversation(sessionId: string): Promise<SessionConversationMessage[]>

  destroySession(sessionId: string): Promise<void>

  destroyAllSessions(): Promise<void>
}

/**
 * 功能分区三：对话回放、监控与 follow-up 协议
 * 时序说明：
 * 1. 每轮编排会先记录 AI 文本或工具执行结果形成 DialogueTurn。
 * 2. monitor 基于当前 turn、累计 turn 和运行时上下文决定 follow-up 或中止。
 * 3. follow-up policy 再根据 FunctionResult 组装提示模型继续推进的文本。
 */

/**
 * 单次函数执行结果在对话回放中的投影。
 * 输入语义：从统一 FunctionResult 映射出的轻量结果快照。
 * 输出语义：挂载到 DialogueTurn.functionResult，供 UI、日志和 monitor 消费。
 * 调用时机：工具执行完成并写入对话回放时使用。
 */
export interface FunctionTurnResult {
  ok: boolean
  data?: unknown
  code?: string | undefined
  msg?: string | undefined
  fix?: string | undefined
  summary?: string | undefined
  warnings?: PostValidationWarning[] | undefined
}

/**
 * 对话回放中的工具块快照。
 * 输入语义：记录当前 turn 关联的 action、tool call id 与反序列化后的参数。
 * 输出语义：供页面调试、日志回放与会话隔离逻辑定位是哪次工具调用。
 * 调用时机：phase = function-execute 的 DialogueTurn 中使用。
 */
export interface DialogueToolBlock {
  action: string
  id: string
  params: unknown
}

/**
 * 单轮对话记录。
 * 输入语义：描述一轮编排中的一个稳定节点，可能是 AI 回复，也可能是函数执行结果。
 * 输出语义：作为 turns 数组中的基础记录单元，供 UI、日志与 monitor 统一消费。
 * 调用时机：每次 AI 回复或工具执行完成后写入回放列表。
 */
export interface DialogueTurn {
  round: number
  timestamp: string
  phase: 'ai-response' | 'function-execute'
  aiText?: string | undefined
  aiReasoning?: string | undefined
  toolBlock?: DialogueToolBlock | undefined
  functionResult?: FunctionTurnResult | undefined
  elapsed?: number | undefined
}

/**
 * Monitor 观察上下文。
 * 输入语义：聚合当前函数执行现场、当前 turn、全部 turn、当前 round、参数与结果。
 * 输出语义：为 monitor 提供足够上下文做重复检测、终止判定和 follow-up 构造。
 * 调用时机：每次函数执行完成后传给所有已注册 monitor。
 */
export interface MonitorContext {
  context: FunctionRuntimeContext
  currentTurn: DialogueTurn
  allTurns: DialogueTurn[]
  round: number
  params: unknown
  result: FunctionResult
}

/**
 * Monitor 中止决策。
 * 输入语义：由 monitor.shouldAbort 返回，声明是否中止，以及原因与结束态。
 * 输出语义：编排器据此决定继续执行下一轮，还是结束本次函数循环。
 * 调用时机：每次 monitor 评估中止条件时使用。
 */
export interface MonitorAbortDecision {
  abort: boolean
  reason?: string
  outcome?: 'completed' | 'aborted'
}

/**
 * 会话监控器。
 * 输入语义：接收 MonitorContext，在 afterFunctionExecution 产出 follow-up 片段，或在 shouldAbort 中给出中止决策。
 * 输出语义：为编排器提供可插拔的重复检测、流程推进和终止策略。
 * 调用时机：每次函数执行完成后依次调用。
 */
export interface SessionMonitor {
  name: string
  afterFunctionExecution(ctx: MonitorContext): string[]
  shouldAbort?(ctx: MonitorContext): MonitorAbortDecision
}

/**
 * Follow-up 构建上下文。
 * 输入语义：聚合当前 action、统一 FunctionResult 与 monitor 上下文。
 * 输出语义：供 FollowUpPolicy 构建下一轮提示模型继续推进的文本。
 * 调用时机：函数执行完成、需要从 warnings 或 monitor 结果生成 follow-up 时使用。
 */
export interface FollowUpBuildContext {
  action: string
  result: FunctionResult
  monitorCtx: MonitorContext
}

/**
 * Follow-up 策略。
 * 输入语义：接收当前执行上下文。
 * 输出语义：返回追加给模型的 follow-up 文本列表。
 * 调用时机：函数执行成功或 monitor 给出提示后，由编排器统一调用。
 */
export interface FollowUpPolicy {
  buildFollowUps(ctx: FollowUpBuildContext): string[]
}

/**
 * 功能分区四：编排器输入输出协议
 * 时序说明：
 * 1. 调用方先组装 OrchestratorConfig，声明系统提示词、最大轮次、监控器与可选 hooks。
 * 2. 编排器按 config 驱动整轮函数循环。
 * 3. 最终以 OrchestratorResult 返回 turns、轮次、会话 id 与完成/中止状态。
 */

/**
 * 编排器运行配置。
 * 输入语义：声明一轮 runFunctionLoop 的所有可调参数和回调扩展点。
 * 输出语义：编排器据此决定后端会话创建方式、工具调度器、监控器与 follow-up 策略。
 * 调用时机：启动一轮函数会话前由调用方构造。
 */
export interface OrchestratorConfig {
  maxRounds: number
  slidingWindow: number
  systemPrompt: string
  resumeSessionId?: string
  tools?: ToolDefinition[]
  signal?: AbortSignal
  onSseEvent?: (event: SessionBackendSseEvent) => void
  monitors?: SessionMonitor[]
  onRoundStart?: (round: number) => void
  onTurnComplete?: (turn: DialogueTurn) => void
  onRoundComplete?: (turn: DialogueTurn) => void
  dispatchFc?: (toolCall: ToolCall, context: FunctionRuntimeContext) => FcDispatchResult | Promise<FcDispatchResult>
  followUpPolicy?: FollowUpPolicy
}

/**
 * 编排器最终结果。
 * 输入语义：聚合整轮 runFunctionLoop 过程中积累的对话记录、轮次和结束状态。
 * 输出语义：供页面、日志、测试和上层业务判断本次会话是完成还是中止。
 * 调用时机：编排器结束时作为统一返回值输出。
 */
export interface OrchestratorResult {
  turns: DialogueTurn[]
  rounds: number
  aborted: boolean
  abortReason?: string | undefined
  completed: boolean
  sessionId: string
}
