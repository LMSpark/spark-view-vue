/**
 * 页面模型会话宿主（Session Host）
 *
 * 时序主线：
 * 1. 先装配后端会话能力（createPageModelSessionBackend）。
 * 2. 再通过 ensureSession 对齐 sessionKey 并挂接 live model adapter。
 * 3. 在 reset/resetSync 阶段清理本地状态与后端会话。
 * 4. 通过 resume 相关方法维护跨轮次会话续跑能力。
 *
 * 角色边界：
 * - 宿主负责 stills session 生命周期与 backend sessionId 管理。
 * - 宿主不直接执行 LLM 编排；编排由上层编辑会话模块触发。
 */

import { SessionBackendImpl } from '../../core/session/session-backend'
import type { SessionBackend } from '../../core/session/session-contracts'
import type { IStillSession } from '../../core/stills/types'
import { clearRegistry } from '../../core/stills/dispatcher'
import { clearDomains, createBareSession as createStillSession } from '../../core/stills/domain'
import { registerPageDesignEditStills } from './register-edit-stills'
import {
  bindLiveModelAdapter,
  getEditState,
  type EditToolHost,
} from './stills'

/** stills 会话类型别名，明确本业务域使用的会话实体。 */
export type PageModelStillsSession = IStillSession

/**
 * 分区 A：宿主运行时能力契约
 */
export interface PageModelSessionHostRuntime {
  /** 会话后端，负责服务端会话创建、续跑与销毁。 */
  backend: SessionBackend

  /**
   * 确保当前会话可用：
   * - sessionKey 未变化时复用。
   * - sessionKey 变化时重建并返回 bootstrapped=true。
   */
  ensureSession: () => { session: PageModelStillsSession; bootstrapped: boolean }

  /** 异步重置：等待后端销毁完成再返回。 */
  reset: () => Promise<void>

  /** 同步重置：发起销毁但不等待完成。 */
  resetSync: () => void

  /** 写入当前 backend sessionId（通常在编排成功后更新）。 */
  setBackendSessionId: (sessionId: string | null) => void

  /** 返回续跑参数，供上层编排调用 backend 时透传。 */
  getResumeSessionOptions: () => { resumeSessionId?: string }

  /** 检测当前本地会话是否与目标 sessionKey 不一致。 */
  hasSessionMismatch: (sessionKey?: string) => boolean
}

export interface PageModelSessionHostState {
  /** 当前 stills 会话实例；未初始化时为 null。 */
  session: PageModelStillsSession | null

  /** 会话锚点键，用于区分页面/上下文。 */
  sessionKey: string

  /** 后端会话 ID，用于续跑；未建立时为 null。 */
  backendSessionId: string | null
}

export interface PageModelSessionHostController extends PageModelSessionHostRuntime {
  /** 获取当前会话实体（可能为 null）。 */
  getSession: () => PageModelStillsSession | null

  /** 获取只读状态快照。 */
  getState: () => Readonly<PageModelSessionHostState>

  /** 订阅状态变化，返回取消订阅函数。 */
  subscribe: (listener: (state: Readonly<PageModelSessionHostState>) => void) => () => void
}

export interface CreatePageModelSessionHostOptions {
  /** 编辑工具宿主：提供 live model 绑定能力。 */
  getEditToolHost: () => EditToolHost

  /** 读取当前上下文会话键。 */
  getSessionKey: () => string

  /** 可选后端地址，默认 /api/ai/sessions。 */
  baseUrl?: string

  /** 可选请求头提供器，支持租户/鉴权透传。 */
  getHeaders?: () => Record<string, string>

  /** 可注入外部 backend，便于测试或上层复用。 */
  backend?: SessionBackend
}

/**
 * 分区 B：后端会话工厂
 */
export function createPageModelSessionBackend(
  baseUrl = '/api/ai/sessions',
  options: ConstructorParameters<typeof SessionBackendImpl>[1] = {},
): SessionBackend {
  return new SessionBackendImpl(baseUrl, options)
}

/**
 * 分区 C：宿主控制器工厂
 */
export function createPageModelSessionHost(
  options: CreatePageModelSessionHostOptions,
): PageModelSessionHostController {
  /** 步骤 0：装配基础依赖。 */
  const { getEditToolHost, getSessionKey } = options
  const backend = options.backend
    ?? createPageModelSessionBackend(options.baseUrl, options.getHeaders ? { getHeaders: options.getHeaders } : {})

  /** 本地状态：会话实体、会话键、后端会话键。 */
  let state: PageModelSessionHostState = {
    session: null,
    sessionKey: '',
    backendSessionId: null,
  }

  /** 状态订阅器集合。 */
  const listeners = new Set<(state: Readonly<PageModelSessionHostState>) => void>()

  /** 向所有订阅方广播状态快照。 */
  function notify(): void {
    const snapshot = { ...state }
    for (const listener of listeners) {
      listener(snapshot)
    }
  }

  /** 原子替换状态并触发通知。 */
  function setState(nextState: PageModelSessionHostState): void {
    state = nextState
    notify()
  }

  /**
   * 清空本地会话状态，并返回旧的 backendSessionId（供后续销毁使用）。
   */
  function clearLocalSessionState(): string | null {
    const previousBackendSessionId = state.backendSessionId
    setState({
      session: null,
      sessionKey: '',
      backendSessionId: null,
    })
    return previousBackendSessionId
  }

  /**
   * 发起后端会话销毁（非阻塞）。
   */
  function disposeBackendSession(previousBackendSessionId: string | null): void {
    if (!previousBackendSessionId) return
    void backend.destroySession(previousBackendSessionId)
  }

  /**
   * 安全销毁后端会话（阻塞等待）。
   *
   * 说明：reset 场景允许吞掉销毁异常，避免刷新流程被销毁失败阻断。
   */
  async function disposeBackendSessionSafely(previousBackendSessionId: string | null): Promise<void> {
    if (!previousBackendSessionId) return
    try {
      await backend.destroySession(previousBackendSessionId)
    } catch {
      // reset 场景忽略销毁失败，避免影响后续上下文重建。
    }
  }

  /**
   * 步骤 1：确保会话可用。
   *
   * 判定规则：
   * - 若当前 sessionKey 一致，则直接复用。
   * - 若不一致，则清理旧会话、重建 stills registry/domain 并重新绑定 live adapter。
   */
  function ensureSession(): { session: PageModelStillsSession; bootstrapped: boolean } {
    const nextSessionKey = getSessionKey()
    if (state.session && state.sessionKey === nextSessionKey) {
      return { session: state.session, bootstrapped: false }
    }

    const previousBackendSessionId = clearLocalSessionState()
    disposeBackendSession(previousBackendSessionId)

    clearRegistry()
    clearDomains()
    registerPageDesignEditStills()

    const nextSession = createStillSession()
    const editState = getEditState(nextSession)
    bindLiveModelAdapter(editState, getEditToolHost())

    setState({
      session: nextSession,
      sessionKey: nextSessionKey,
      backendSessionId: null,
    })
    return { session: nextSession, bootstrapped: true }
  }

  /**
   * 步骤 2A：异步重置（等待销毁完成）。
   */
  async function reset(): Promise<void> {
    const previousBackendSessionId = clearLocalSessionState()
    await disposeBackendSessionSafely(previousBackendSessionId)

    clearRegistry()
    clearDomains()
  }

  /**
   * 步骤 2B：同步重置（立即返回）。
   */
  function resetSync(): void {
    const previousBackendSessionId = clearLocalSessionState()
    disposeBackendSession(previousBackendSessionId)

    clearRegistry()
    clearDomains()
  }

  /**
   * 步骤 3：记录最新 backend sessionId。
   */
  function setBackendSessionId(sessionId: string | null): void {
    setState({
      ...state,
      backendSessionId: sessionId,
    })
  }

  /**
   * 步骤 4：导出续跑参数。
   */
  function getResumeSessionOptions(): { resumeSessionId?: string } {
    return state.backendSessionId ? { resumeSessionId: state.backendSessionId } : {}
  }

  /**
   * 步骤 5：会话一致性检查。
   */
  function hasSessionMismatch(nextSessionKey?: string): boolean {
    return state.sessionKey !== '' && state.sessionKey !== (nextSessionKey ?? getSessionKey())
  }

  /** 注册监听器并返回取消函数。 */
  function subscribe(listener: (currentState: Readonly<PageModelSessionHostState>) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return {
    backend,
    getSession: () => state.session,
    getState: () => state,
    subscribe,
    ensureSession,
    reset,
    resetSync,
    setBackendSessionId,
    getResumeSessionOptions,
    hasSessionMismatch,
  }
}