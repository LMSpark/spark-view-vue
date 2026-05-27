/**
 * 节点类型（nodeKind）条件标志 — 跨属性编辑子组件共享
 */
import { computed } from 'vue'
import type { DevState } from '../useDevState'

export function useNodeKindFlags(state: DevState) {
  const isDirectoryNode = computed(() => {
    const kind = state.navDraft.nodeKind
    return kind === 'system-directory' || kind === 'module'
  })
  const isSystemPageNode = computed(() => state.navDraft.nodeKind === 'system-page')
  const isSystemActionNode = computed(() => state.navDraft.nodeKind === 'system-action')
  const isPageNode = computed(() => state.navDraft.nodeKind === 'page')
  const isLinkNode = computed(() => state.navDraft.nodeKind === 'link')
  const isSubPageNode = computed(() => state.navDraft.nodeKind === 'sub-page')
  const isRefNode = computed(() => state.navDraft.nodeKind === 'ref')

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
  }
}
