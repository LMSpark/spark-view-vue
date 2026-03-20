/**
 * 节点类型（nodeKind）条件标志 — 跨属性编辑子组件共享
 */
import { computed } from 'vue'
import type { DevState } from '../useDevState'

export function useNodeKindFlags(state: DevState) {
  const isDirectoryNode = computed(() => {
    const kind = state.editForm.nodeKind
    return kind === 'system-directory' || kind === 'module'
  })
  const isSystemPageNode = computed(() => state.editForm.nodeKind === 'system-page')
  const isSystemActionNode = computed(() => state.editForm.nodeKind === 'system-action')
  const isPageNode = computed(() => state.editForm.nodeKind === 'page')
  const isLinkNode = computed(() => state.editForm.nodeKind === 'link')
  const isSubPageNode = computed(() => state.editForm.nodeKind === 'sub-page')
  const isRefNode = computed(() => state.editForm.nodeKind === 'ref')

  const showTargetSelector = computed(() =>
    isSystemPageNode.value || isPageNode.value || isSystemActionNode.value,
  )
  const showPathStatus = computed(() =>
    isSystemPageNode.value || isPageNode.value || isSystemActionNode.value,
  )

  const routeSectionLabel = computed(() => {
    if (isSystemActionNode.value) return '动作配置'
    if (isLinkNode.value) return '链接配置'
    if (isDirectoryNode.value) return '重定向'
    if (isSubPageNode.value) return '关联页面'
    if (isRefNode.value) return '引用配置'
    return '路由 & 关联页面'
  })

  /** 当前节点是否是"有页面配置文件"的类型 */
  const isPageLikeNode = computed(() =>
    isPageNode.value || isSystemPageNode.value,
  )

  return {
    isDirectoryNode,
    isSystemPageNode,
    isSystemActionNode,
    isPageNode,
    isLinkNode,
    isSubPageNode,
    isRefNode,
    showTargetSelector,
    showPathStatus,
    routeSectionLabel,
    isPageLikeNode,
  }
}
