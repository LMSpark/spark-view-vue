/**
 * AI 模块注册树导航器。
 *
 * 职责：集中处理 AiModuleRegistration / AiRuntimeModuleExposure 的树形查找。
 * 旧 runtime 的 action 协议仍然使用 rootInstance[/childInstance]@module@function，
 * 但模块树导航逻辑应像 module-semantic 的 ModuleNavigator 一样收敛到单一组件。
 */

import type {
  AiModuleRegistration,
  AiRuntimeModuleExposure,
} from '../../protocol/runtime-contracts'

export class AiModuleRegistrationNavigator {
  /**
   * 按 moduleIds 路径递归查找注册节点。
   *
   * moduleIds[0] 必须等于 root.moduleId，后续元素逐层匹配子模块。
   */
  findByModuleIds(root: AiModuleRegistration, moduleIds: readonly string[]): AiModuleRegistration | null {
    if (moduleIds.length === 0 || root.moduleId !== moduleIds[0]) return null

    let current: AiModuleRegistration = root
    for (const moduleId of moduleIds.slice(1)) {
      const child = (current.modules ?? []).find((candidate) => candidate.moduleId === moduleId)
      if (child === undefined) return null
      current = child
    }
    return current
  }

  /**
   * 按 moduleId 在注册树中查找唯一节点。
   *
   * 新 action 格式只携带末段 moduleId，因此注册树内必须保持唯一；
   * 如发现多个同名模块，直接抛错，由调用方转换为 MODULE_AMBIGUOUS。
   */
  findUniqueByModuleId(root: AiModuleRegistration, moduleId: string): AiModuleRegistration | null {
    const found: AiModuleRegistration[] = []
    this.collectRegistrationsByModuleId(root, moduleId, found)
    if (found.length === 0) return null
    if (found.length === 1) return found[0] ?? null
    throw new Error(`Ambiguous AI module id in registration tree: ${moduleId}`)
  }

  /**
   * 按 modulePath 在曝光树中查找节点。
   *
   * 用于 activePath 归一化：LLM 给出模块实例绑定后，runtime 需要确认
   * 该 modulePath 在当前投影中真实存在，并补全 instanceParam。
   */
  findExposureByModulePath(root: AiRuntimeModuleExposure, modulePath: string): AiRuntimeModuleExposure | null {
    if (root.modulePath === modulePath) return root
    for (const child of root.modules) {
      const found = this.findExposureByModulePath(child, modulePath)
      if (found !== null) return found
    }
    return null
  }

  private collectRegistrationsByModuleId(
    module: AiModuleRegistration,
    moduleId: string,
    out: AiModuleRegistration[],
  ): void {
    if (module.moduleId === moduleId) out.push(module)
    for (const child of module.modules ?? []) {
      this.collectRegistrationsByModuleId(child, moduleId, out)
    }
  }
}
