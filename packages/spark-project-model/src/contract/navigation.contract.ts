export type {
  ProjectModelData,
  ChildPlacement,
  NavNodeKind,
  NavPermissionMode,
  ProjectNodeData,
} from '../entity/node/node-base.entity'
export { isProjectNodeData } from '../entity/node/node-base.entity'
import type {
  NavContextItem,
  NavNodeKind,
  NavPermissionMode,
  ProjectNodeData,
} from '../entity/node/node-base.entity'
import type { LinkTarget } from '../entity/node/leaf-nodes.entity'
import type { NavContextConfig } from '../entity/node/node-base.entity'

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
  patch: NavigationNodeEditPatchDto & Pick<ProjectNodeData, 'title' | 'nodeKind'>
  warnings: string[]
}

export type ProjectNodeLocation = {
  node: ProjectNodeData
  parent: ProjectNodeData | null
  parentId: string | null
  index: number
}
