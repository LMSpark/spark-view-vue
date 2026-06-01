export type { AppNavRoot, ChildPlacement, LinkTarget, NavNode, NavNodeKind, NavPermissionMode } from '@spark-view/spark-data'
export { isNavNode } from '@spark-view/spark-data'
import type { LinkTarget, NavContextConfig, NavContextItem, NavNode, NavNodeKind, NavPermissionMode } from '@spark-view/spark-data'

export type NavigationNodeEditDto = {
  id: string
  title: string
  icon: string
  nodeKind: NavNodeKind
  dividerAfter: boolean
  description: string
  path: string
  linkTarget: LinkTarget
  childPlacement: string
  order: number
  hidden: boolean
  disabled: boolean
  refId: string
  permissionMode: NavPermissionMode
}

export type NavigationNodeEditPatchDto = Partial<Omit<NavigationNodeEditDto, 'id'>> & {
  context?: string | NavContextItem[] | NavContextConfig
}

export type NavigationNodeAddRequestDto = {
  parentId?: string | null
  index?: number
  node: NavigationNodeEditDto
}

export type NavigationNodeMoveRequestDto = {
  newParentId: string | null
  index: number
}

export type NavigationContextEditConfigDto = {
  placeholder: string
  defaultValue: string
  paramName: string
}

export type NavigationContextEditDto = {
  hasContext: boolean
  items: Array<{ id: string; title: string }>
  config: NavigationContextEditConfigDto
}

export type NavigationNodeEditInputDto = {
  node: NavigationNodeEditDto
  context: NavigationContextEditDto
}

export type NavigationNodeEditApplyResultDto = {
  patch: NavigationNodeEditPatchDto & Pick<NavNode, 'title' | 'nodeKind'>
  warnings: string[]
}

export type NavNodeLocation = { node: NavNode; parent: NavNode | null; parentId: string | null; index: number }
