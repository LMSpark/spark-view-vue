/**
 * Stills 类型系统
 *
 * 这个文件只定义 still 引擎的公共协议，不承载任何具体 domain 的领域实现：
 * 1. StillDefinition 描述一个原子动作；
 * 2. IStillSession 描述跨 domain 共享的会话容器；
 * 3. DomainProvider 描述一个 domain 如何挂接到 still 引擎。
 */

// ═══════════════════════════════════════════════════════════
// Guard / Result
// ═══════════════════════════════════════════════════════════

/** Guard 检查函数，返回 null 表示通过，返回对象表示被拒原因 */
export type StillGuard = (session: IStillSession) => { code: string; msg: string } | null

/** 后置校验产生的警告（不阻断执行，但需要 LLM 关注修复）。 */
export interface PostValidationWarning {
  /** 校验规则标识 */
  rule: string
  /** 人类可读的问题描述 */
  detail: string
  /** 建议修复动作（可直接拼入 fix 提示） */
  fix?: string
}

/** still 动作统一返回值。ok=true 产出数据，ok=false 产出结构化修复提示。 */
export type StillResult<T = unknown> =
  | { ok: true; data: T; summary: string; warnings?: PostValidationWarning[] }
  | { ok: false; code: string; msg: string; fix: string }

/** still 已知失败模式，用于把 fail-fast 边界显式暴露给 LLM。 */
export interface StillFailureMode {
  code: string
  when: string
  fix: string
}

// ═══════════════════════════════════════════════════════════
// Still Definition
// ═══════════════════════════════════════════════════════════

export interface StillDefinition<TParams = unknown, TResult = unknown> {
  /** action 地址，格式为 业务@模块@函数；函数对应实际 Agent tool。 */
  action: string
  /** 块类型 */
  type: 'request' | 'describe'
  /** 供 AI 查询的说明 */
  description: string
  /** 模块级提示词；同一 业务@模块 下应保持一致，供 knowledge 和 FC tool 描述返回给 AI。 */
  modulePrompt?: string
  /** 函数式准入条件；省略时视为无需 guard。 */
  guard?: StillGuard
  /** 人类可读的 guard 描述（供 core@knowledge@queryTools / core@knowledge@guideTool 返回给 AI） */
  guardDescription?: string
  /** 使用约束 / 关键规则（供 core@knowledge@guideTool 返回，减少 AI 猜测） */
  usageRules?: string[]
  /** 参数结构说明（供 core@knowledge@guideTool 返回） */
  paramsSchema?: Record<string, unknown>
  /** 返回结构说明 */
  resultSchema?: Record<string, unknown>
  /** 最小参数示例 */
  example?: Record<string, unknown>
  /** 常见失败模式（供 core@knowledge@guideTool 返回） */
  failureModes?: StillFailureMode[]
  /** 参数校验，返回 null 表示通过，否则返回错误消息 */
  validate: (params: TParams) => string | null
  /** 纯函数执行，可直接修改 session（dispatcher 负责持久化） */
  execute: (session: IStillSession, params: TParams) => StillResult<TResult>
  /**
   * 后置校验钩子（可选）。
   *
   * dispatcher 在 execute 返回 ok=true 后调用，返回的 warnings 附着到 result。
   * 用于跨实体一致性校验（如 FK 覆盖、options 视图完整性、聚合列交叉验证），
   * 这些校验依赖 execute 的副作用结果，无法在 validate（纯参数校验）阶段运行。
   */
  postValidate?: (session: IStillSession, params: TParams) => PostValidationWarning[]
}

// ═══════════════════════════════════════════════════════════
// Session State
// ═══════════════════════════════════════════════════════════

/**
 * SessionDomainState — stills 会话层中所有 domain state 的最小公共协议。
 *
 * 约束：
 * 1. 所有 domain 都必须声明 `phase`；
 * 2. 只有真正以 `data` 作为主状态的 domain 才扩展 DomainState；
 * 3. 已经收口到专用 facade 的 domain，可直接扩展 SessionDomainState，避免再维护伪 data 槽位。
 */
export interface SessionDomainState<TPhase extends string = string> {
  phase: TPhase
}

/**
 * DomainState — 仍以 `data` 作为主状态槽位的 domain 通用协议。
 */
export interface DomainState<TData = unknown, TPhase extends string = string> extends SessionDomainState<TPhase> {
  data: TData
}

/** 成功 request 动作写入的变更日志。 */
export interface PatchEntry {
  action: string
  requestId: string
  timestamp: number
  summary: string
}

export interface IStillSession {
  /** 操作日志 */
  patchLog: PatchEntry[]
  /** 各域 state 的通用容器，key = 域名 */
  domains: Record<string, SessionDomainState<string>>
}

/** 从 session.domains 中按域名读取强类型 state。 */
export function getDomainState<TState extends SessionDomainState<string>>(session: IStillSession, domainName: string): TState {
  return session.domains[domainName] as TState
}

// ═══════════════════════════════════════════════════════════
// Domain Contract
// ═══════════════════════════════════════════════════════════

export interface DomainProvider<TState extends SessionDomainState<string> = SessionDomainState<string>> {
  /** 域名（作为 session.domains 的 key） */
  name: string
  /** AI 角色描述（core@session@describe 返回给 AI 的角色定义） */
  roleHint: string
  /** 该域提供的全部 stills */
  stills: ReadonlyArray<StillDefinition<never, unknown>>
  /** 创建域 state 初始值 */
  createState(): TState
}

// ═══════════════════════════════════════════════════════════
// Guard Helper
// ═══════════════════════════════════════════════════════════

/** 无准入条件 */
export const noGuard: StillGuard = () => null

