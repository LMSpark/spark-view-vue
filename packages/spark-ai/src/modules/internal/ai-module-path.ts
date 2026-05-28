/**
 * ═══════════════════════════════════════════════════════════════
 * modules/internal/ai-module-path.ts — AiModule 父链拓扑解析
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】modules 内部的拓扑工具。负责从 AiModule 图的 parentKind
 *   链推导出完整的 kind 路径（从根到目标）。被 knowledge 投影层消费，
 *   用于生成 LLM 可见的 toolName 和 payload 查找步骤。
 *
 * 【核心函数】
 *   resolveAiModulePath  — 从 moduleKind 沿 parentKind 链回溯至根，返回有序 kind 数组
 *
 * 【错误策略】
 *   父链缺失（parentKind 指向未注册 kind）和循环引用（parentKind 链成环）
 *   都是启动期配置错误，直接抛出 AiModuleTopologyError，不做静默回退。
 *
 * 【消费方】ai-module-knowledge.ts（知识投影时计算 kindPath）
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiModule } from '../protocol'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 拓扑错误类型
// ═══════════════════════════════════════════════════════════════

/** 拓扑错误：父链循环或缺失父 kind */
class AiModuleTopologyError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'AiModuleTopologyError'
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 父链解析
// ═══════════════════════════════════════════════════════════════

/**
 * 解析模块的完整 kind 路径（从根到目标）。
 *
 * 算法：
 *   1. 从 moduleKind.kind 出发，沿 parentKind 链逐级向上回溯
 *   2. 每步查重（seen set），检测循环引用
 *   3. 每步查表（byKind map），检测缺失父 kind
 *   4. 到达根（parentKind === undefined）后，将收集的路径正序返回
 *
 * 返回值：按从根到目标的顺序排列的 kind 名数组。
 *   例如：PageDesignModule → ["PageDesignModule"]
 *   若它有 parentKind="SparkApp" → ["SparkApp", "PageDesignModule"]
 */
export function resolveAiModulePath(
  moduleKind: AiModule,
  allKinds: readonly AiModule[],
): readonly string[] {
  const byKind = new Map(allKinds.map((candidate) => [candidate.kind, candidate]))
  const path = [moduleKind.kind]
  const seen = new Set<string>(path)
  let parentKind = moduleKind.parentKind
  while (parentKind !== undefined) {
    if (seen.has(parentKind)) {
      throw new AiModuleTopologyError(`AiModule parent cycle detected at "${parentKind}"`)
    }
    const parent = byKind.get(parentKind)
    if (parent === undefined) {
      throw new AiModuleTopologyError(
        `AiModule "${moduleKind.kind}" references missing parentKind "${parentKind}"`,
      )
    }
    path.unshift(parent.kind)
    seen.add(parent.kind)
    parentKind = parent.parentKind
  }
  return path
}
