import { AiModule, AiModuleResult } from '../protocol'
import type { AiModuleChildrenLister } from '../protocol/module-context'

const GUIDE_ONLY_CHILD_LISTER: AiModuleChildrenLister = () => AiModuleResult.failCode(
  'DIRECT_CHILD_LIST_NOT_SUPPORTED',
  'guide-only 子 kind 不可通过 module_list 枚举。',
  '先打开父上下文，再通过 module_script 链式调用。',
)

/**
 * 将 companion 模块的 parentKind 反向合并为父模块 children 声明，满足 runtime.inspect 双向拓扑校验。
 * guide-only 子 kind 仅用于知识投影，list 委托返回明确失败提示。
 */
export function mergeCompanionChildDeclarations(modules: readonly AiModule[]): readonly AiModule[] {
  const childKindsByParent = new Map<string, string[]>()
  for (const moduleKind of modules) {
    const parentKind = moduleKind.parentKind
    if (parentKind === undefined) continue
    const existing = childKindsByParent.get(parentKind) ?? []
    if (!existing.includes(moduleKind.kind)) {
      childKindsByParent.set(parentKind, [...existing, moduleKind.kind])
    }
  }

  return modules.map((moduleKind) => {
    const additions = childKindsByParent.get(moduleKind.kind)
    if (additions === undefined || additions.length === 0) {
      return moduleKind
    }

    const mergedChildren = [...moduleKind.children]
    let changed = false
    for (const childKind of additions) {
      if (!mergedChildren.includes(childKind)) {
        mergedChildren.push(childKind)
        changed = true
      }
    }
    if (!changed) {
      return moduleKind
    }

    const options = moduleKind.toRuntimeOptions()
    const gainedFirstChildren = moduleKind.children.length === 0
    return new AiModule({
      ...options,
      children: mergedChildren,
      ...(gainedFirstChildren ? { list: GUIDE_ONLY_CHILD_LISTER } : {}),
    })
  })
}
