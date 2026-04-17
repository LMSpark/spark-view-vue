/**
 * PageConfig Domain — 类型定义
 *
 * 管理页面配置的 4 个记忆体：rule（组件树）、scriptMap（脚本函数映射）、scriptVars（脚本公共变量）、styleMap（样式规则映射）。
 * 与 Dataset 域协作：Dataset 提供数据模型，PageConfig 提供 UI 表现层。
 *
 * 设计原则：
 * - rule 是 SparkNode 树，直接可序列化为 rule.json；
 * - scriptMap 是函数名→函数体的扁平映射，导出时拼接为 script.js 函数声明；
 * - scriptVars 是变量名→初始值表达式的扁平映射，导出时拼接为 script.js 顶层 let 声明；
 * - styleMap 是选择器→声明的扁平映射，导出时拼接为 style.css；
 * - 四个记忆体聚合为单一 IPageConfigData，符合 DomainState<TData, TPhase> 模式。
 */

import type { SparkNode } from '@spark-view/spark-component'
import type { DomainState, IStillSession, StillGuard } from './types'
import { getDomainState, readSessionBlueprint } from './types'

// ═══════════════════════════════════════════════════════════
// 域状态
// ═══════════════════════════════════════════════════════════

/** PageConfig 域管理的 4 个记忆体聚合 */
export interface IPageConfigData {
  /** 组件树（对应 rule.json） */
  rule: SparkNode | null
  /** 函数名 → 函数体（导出时拼接为 script.js 函数声明） */
  scriptMap: Record<string, string>
  /** 变量名 → 初始值表达式（导出时拼接为 script.js 顶层 let 声明） */
  scriptVars: Record<string, string>
  /** CSS 选择器 → 声明块（导出时拼接为 style.css） */
  styleMap: Record<string, string>
}

/**
 * PageConfig 域生命周期阶段。
 *
 * - empty       — 域已创建但未初始化（等待 Dataset 域完成）
 * - bootstrapped — 确定性引导完成（基线 rule + script + style 已生成）
 * - refining     — LLM 正在通过 stills 雕琢
 * - exported     — 已导出为文件
 */
export type PageConfigPhase = 'empty' | 'bootstrapped' | 'refining' | 'exported'

/** PageConfig 域在 session.domains['pageconfig'] 中保存的会话状态 */
export interface PageConfigDomainState extends DomainState<IPageConfigData | null, PageConfigPhase> {}

// ═══════════════════════════════════════════════════════════
// State 访问器 & 工厂
// ═══════════════════════════════════════════════════════════

/** 类型安全的 pageconfig 域 state 访问器 */
export function getPageConfigState(session: IStillSession): PageConfigDomainState {
  return getDomainState<PageConfigDomainState>(session, 'pageconfig')
}

/** 创建域初始 state */
export function createPageConfigState(): PageConfigDomainState {
  return {
    data: null,
    phase: 'empty',
  }
}

// ═══════════════════════════════════════════════════════════
// Guard 工厂
// ═══════════════════════════════════════════════════════════

interface PcGuardOptions {
  /** 是否需要 pageconfig data 已初始化，默认 true */
  requireData?: boolean
  /** 是否需要 blueprint 已创建 */
  requireBlueprint?: boolean
  /** 是否要求已经过 bootstrap（phase >= bootstrapped） */
  requireBootstrapped?: boolean
}

/**
 * 创建 PageConfig 域 guard。
 *
 * 遵循 Dataset 域的 dsGuard 模式：guard 声明前置条件，execute 只做业务逻辑。
 */
export function pcGuard(checks: PcGuardOptions = {}): StillGuard {
  return (session: IStillSession): { code: string; msg: string } | null => {
    if (checks.requireBlueprint === true && readSessionBlueprint(session) === null) {
      return { code: 'NO_BLUEPRINT', msg: 'Blueprint 尚未创建，请先执行 blueprint.create' }
    }
    const state = getPageConfigState(session)
    if (checks.requireData !== false && state.data === null) {
      return { code: 'NO_PAGECONFIG', msg: 'PageConfig 未初始化，请先执行 pageconfig.init' }
    }
    if (checks.requireBootstrapped === true) {
      const validPhases = new Set<PageConfigPhase>(['bootstrapped', 'refining', 'exported'])
      if (!validPhases.has(state.phase)) {
        return { code: 'NOT_BOOTSTRAPPED', msg: 'PageConfig 尚未引导完成，请先执行 pageconfig.init' }
      }
    }
    return null
  }
}

// ═══════════════════════════════════════════════════════════
// 预置 Guard 实例
// ═══════════════════════════════════════════════════════════

/** pageconfig.init 用：需要 blueprint，但 pageconfig data 尚不存在（它正是创建 data 的动作） */
export const guardInitReady = pcGuard({ requireData: false, requireBlueprint: true })
export const guardInitReadyDesc = '需要 blueprint 已创建'

/** 编辑类动作：需要 pageconfig 已初始化且已 bootstrap */
export const guardBootstrapped = pcGuard({ requireBlueprint: true, requireBootstrapped: true })
export const guardBootstrappedDesc = '需要 blueprint + pageconfig 已引导完成'

/** 仅需要 pageconfig data 存在 */
export const guardDataOnly = pcGuard({})
export const guardDataOnlyDesc = '需要 pageconfig 已初始化'

// ═══════════════════════════════════════════════════════════
// 辅助类型
// ═══════════════════════════════════════════════════════════

/** 导出结果 */
export interface PageConfigExportResult {
  ruleJson: string
  scriptJs: string
  styleCss: string
}

/** pageconfig.validate 校验结果 */
export interface PageConfigValidationIssue {
  rule: string
  pass: boolean
  detail?: string
}
