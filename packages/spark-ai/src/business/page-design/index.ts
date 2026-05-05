/**
 * 页面设计业务（Page Design）
 *
 * 目标边界：
 * - 仅承载“单页面四文件编辑”运行时及其直接支撑能力。
 * - 不再承担生成编排、蓝图推进、导航策划或生成后校验职责。
 *
 * 排版约定：
 * - 按运行时时序组织导出：预处理 -> 会话宿主 -> 编辑执行。
 * - 在每个分区内按功能职责组织类型与工厂函数，便于调用方按阶段接入。
 */

export const PAGE_DESIGN_BUSINESS = 'page-design'

export { PAGE_DESIGN_EDIT_RUNTIME_PROMPT } from './prompts/edit-runtime-prompt'
export { registerPageDesignEditFunctions } from './register-edit-functions'

export {
  createEditState,
  getActiveNodeTree,
  bindLiveModelAdapter,
  isEditWriteAction,
  isEditNodeTreeWriteAction,
  isEditDataSetWriteAction,
  isEditTextModelWriteAction,
} from './functions'
export type { EditState, EditToolHost } from './functions'

/**
 * 页面设计业务上下文。
 *
 * 字段语义：
 * - pageId: 当前页面唯一标识。用于会话隔离、缓存键隔离和诊断定位。
 * - pageName: 当前页面显示名。用于日志可读性，不参与关键逻辑分支。
 * - phase: 当前业务阶段标签。通常由上层编排传入，用于观测和日志分段。
 */
export interface PageDesignBusinessContext {
  pageId?: string
  pageName?: string
  phase?: string
}

/**
 * 时序分区 1/3：缓存预处理能力
 *
 * 职责说明：
 * - 在会话初始化前清理页面四文件缓存（rule / pagedata / script / style）。
 * - 仅处理缓存层，不介入函数运行时、工具执行或 LLM 循环。
 */
export {
  // 缓存管理工厂：创建针对单页与全局缓存的清理句柄。
  createPageCache,
  // 缓存句柄类型：统一暴露 clear/get stats 等缓存操作入口。
  type PageCacheHandle,
} from './page-cache'

/**
 * 时序分区 2/3：会话宿主能力
 *
 * 职责说明：
 * - 托管函数运行时上下文的创建、复用与重建。
 * - 维护 backend sessionId 并提供 resume/reset 等生命周期能力。
 * - 提供状态订阅和会话一致性检测，但不直接执行编辑工具链。
 */
export {
  // 后端会话适配器工厂：创建 SessionBackend，负责服务端会话交互。
  createPageModelSessionBackend,
  // 会话宿主工厂：聚合会话状态、生命周期与后端会话桥接。
  createPageModelSessionHost,
  // 函数运行时上下文类型：用于跨模块传递 core 执行轨迹。
  type PageModelFunctionContext,
  // 宿主运行时能力类型：会话确保、重置、会话续接等核心接口。
  type PageModelSessionHostRuntime,
  // 宿主状态类型：当前会话、会话键与后端会话键的只读快照结构。
  type PageModelSessionHostState,
  // 宿主控制器类型：在运行时能力基础上扩展 getState/subscribe 等控制面。
  type PageModelSessionHostController,
  // 宿主工厂入参类型：注入 sessionKey、toolHost、headers 等依赖。
  type CreatePageModelSessionHostOptions,
} from './page-model-session-host'

/**
 * 时序分区 3/3：编辑执行能力
 *
 * 职责说明：
 * - 负责 bootstrap、runLlm、reset、dispose 等完整编辑会话控制流。
 * - 暴露运行日志、状态快照、hook 扩展点与运行时替换能力。
 * - 在工具写入后触发页面模型投影同步，驱动可视模型更新。
 */
export {
  // 编辑会话工厂：创建页面模型编辑控制器（业务入口）。
  createPageModelEditSession,
  // 日志项类型：用于承载 info/success/error 分级日志条目。
  type PageModelEditLogEntry,
  // 会话状态类型：ready/dirty/busy/aiBuffer/log/nodeTree 等运行态快照。
  type PageModelEditSessionState,
  // 迭代会话启动参数类型：封装 run loop 所需后端/会话/提示词与回调。
  type StartPageModelIterateSessionOptions,
  // 运行时能力类型：可替换执行器、工具定义生成器与动作判定函数。
  type PageModelEditSessionRuntime,
  // 会话构建参数类型：注入会话宿主、上下文加载器与运行时覆盖项。
  type PageModelEditSessionOptions,
  // 执行阶段 hook 类型：用于监听 delta/reasoning/sse/tool turn 等事件。
  type PageModelEditRunHooks,
  // runLlm 入参类型：在 hooks 基础上扩展 maxRounds/toolMode 等控制参数。
  type PageModelEditRunOptions,
  // bootstrap 入参类型：控制静默初始化与上下文加载行为。
  type PageModelEditBootstrapOptions,
  // 控制器类型：统一暴露 getState/subscribe/bootstrap/run/reset/dispose。
  type PageModelEditSessionController,
} from './page-model-edit-session'

