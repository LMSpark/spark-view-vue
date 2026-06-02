/**
 * 导航编辑器：节点 DTO、补丁应用、树遍历和编辑会话。
 *
 * 为项目树编辑器提供从 ProjectNodeData 到编辑 DTO 的双向转换，
 * 以及编辑会话的内存状态管理。
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  类型分组（按编辑会话生命周期）                        │
 * │                                                      │
 * │  1. 编辑 DTO：NavigationNodeEditDto                     │
 * │              NavigationContextEditDto                   │
 * │              NavigationNodeEditInputDto                 │
 * │              NavigationNodeEditApplyResultDto           │
 * │  2. 树遍历：  ProjectNodeLocation                     │
 * │  3. 常量表：  DEFAULT_NAV_ICON_BY_KIND                │
 * │  4. 类型守卫：isNavContextConfig / isChildPlacement    │
 * │  5. 节点正规化：normalizePageIdFromPath               │
 * │                normalizeProjectNodeData / normalizeNavRoot │
 * │                buildNavRoot                           │
 * │  6. 树查找：  findNodeById / findParentNodeById       │
 * │              findNodeLocation / findConfigNodeByPageId│
 * │  7. DTO 操作：createNavigationNodeEditDto               │
 * │              applyNodeKindPresetToEditDto               │
 * │              createNavigationNodePatch                │
 * │              applyNavigationNodeEditDtoToNode           │
 * │  8. 工厂函数：createRootModuleNode                    │
 * │              createChildPageNode                      │
 * │              createReservedRootGroup                  │
 * │  9. 编辑会话：NavigationEditSession                   │
 * └──────────────────────────────────────────────────────┘
 */

import { deepClone } from '@spark-view/spark-utils'
import type {
  ProjectModelData,
  ChildPlacement,
  NavContextItem,
  NavNodeKind,
  ProjectNodeData,
} from '../../entity/node/node-base.entity'
import type { NavContextConfig } from '../../entity/node/node-base.entity'
import {
  buildNavRoot,
  inferNavNodeKind,
  normalizeNavRoot,
  normalizePageIdFromPath,
  normalizeProjectNodeData,
} from '../../entity/node/node-helpers'
import type {
  ProjectNodeLocation,
  NavigationContextEditConfigDto,
  NavigationNodeEditDto,
  NavigationNodeEditApplyResultDto,
  NavigationNodeEditInputDto,
  NavigationNodeEditPatchDto,
} from '../../entity/navigation/edit.entity'

export type {
  ProjectNodeLocation,
  NavigationContextEditDto,
  NavigationContextEditConfigDto,
  NavigationNodeEditDto,
  NavigationNodeEditApplyResultDto,
  NavigationNodeEditInputDto,
  NavigationNodeAddRequestDto,
  NavigationNodeMoveRequestDto,
  NavigationNodeEditPatchDto,
} from '../../entity/navigation/edit.entity'

// ═══════════════════════════════════════════════════════
// 3. 常量表
// ═══════════════════════════════════════════════════════

/** 各节点类型的默认图标映射 */
export const DEFAULT_NAV_ICON_BY_KIND: Record<NavNodeKind, string> = {
  'system-directory': 'FolderOpened',
  'module': 'FolderOpened',
  'system-page': 'Monitor',
  'system-action': 'Lightning',
  'page': 'Document',
  'link': 'Link',
  'sub-page': 'Document',
  'ref': 'Connection',
}

// ═══════════════════════════════════════════════════════
// 4. 类型守卫与判断
// ═══════════════════════════════════════════════════════

function isNavContextConfig(value: string | NavContextItem[] | NavContextConfig | undefined): value is NavContextConfig {
  return typeof value === 'object' && !Array.isArray(value) && 'source' in value
}

const CHILD_PLACEMENT_VALUES: ReadonlySet<string> = new Set(['header', 'sidebar', 'toolbar', 'user-menu', 'parent', 'flat'])

function isChildPlacement(value: string): value is ChildPlacement {
  return CHILD_PLACEMENT_VALUES.has(value)
}

// ═══════════════════════════════════════════════════════
// 5. 节点正规化
//
// 将不完整或不规范的 ProjectNodeData / ProjectModelData 转为合法形态。
// ═══════════════════════════════════════════════════════

export { buildNavRoot, inferNavNodeKind, normalizeNavRoot, normalizePageIdFromPath, normalizeProjectNodeData }

/** 判断节点类型是否为可配置的页面节点 */
export function isConfigNodeKind(nodeKind: NavNodeKind): boolean {
  return nodeKind === 'page' || nodeKind === 'sub-page'
}

/** 判断节点类型是否为页面类（含系统页面、操作、外链等） */
export function isPageLikeKind(kind: NavNodeKind): boolean {
  return kind === 'page'
    || kind === 'system-page'
    || kind === 'system-action'
    || kind === 'link'
    || kind === 'sub-page'
}

// ═══════════════════════════════════════════════════════
// 6. 树查找
//
// 在导航树中按 ID 或 pageId 定位节点。
// ═══════════════════════════════════════════════════════

/** 按 ID 查找节点（深度优先） */
export function findNodeById(nodes: readonly ProjectNodeData[], targetId: string): ProjectNodeData | null {
  for (const node of nodes) {
    if (node.id === targetId) return node
    if (Array.isArray(node.children)) {
      const found = findNodeById(node.children, targetId)
      if (found) return found
    }
  }
  return null
}

/** 按 ID 查找节点的父节点 */
export function findParentNodeById(nodes: readonly ProjectNodeData[], targetId: string, parent: ProjectNodeData | null = null): ProjectNodeData | null {
  for (const node of nodes) {
    if (node.id === targetId) return parent
    if (Array.isArray(node.children)) {
      const found = findParentNodeById(node.children, targetId, node)
      if (found) return found
    }
  }
  return null
}

/** 查找节点及其在树中的位置 */
export function findNodeLocation(nodes: readonly ProjectNodeData[], targetId: string, parent: ProjectNodeData | null = null): ProjectNodeLocation | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node === undefined) continue
    if (node.id === targetId) {
      return { node, parent, parentId: parent?.id ?? null, index }
    }
    if (Array.isArray(node.children)) {
      const found = findNodeLocation(node.children, targetId, node)
      if (found) return found
    }
  }
  return null
}

/** 按 pageId 查找可配置的页面节点 */
export function findConfigNodeByPageId(nodes: readonly ProjectNodeData[], pageId: string): ProjectNodeData | null {
  for (const node of nodes) {
    if (isConfigNodeKind(node.nodeKind ?? 'page') && normalizePageIdFromPath(node.path) === pageId) {
      return node
    }
    if (Array.isArray(node.children)) {
      const found = findConfigNodeByPageId(node.children, pageId)
      if (found) return found
    }
  }
  return null
}

/** 判断节点是否为顶层系统目录 */
export function isSystemRootDirectory(node: ProjectNodeData | null | undefined, rootNodes: readonly ProjectNodeData[]): boolean {
  return Boolean(node?.nodeKind === 'system-directory' && rootNodes.some(rootNode => rootNode.id === node.id))
}

/** 判断节点是否可以使用 module 类型（父节点不是页面类） */
export function canUseModuleNodeKind(node: ProjectNodeData | null | undefined, rootNodes: readonly ProjectNodeData[]): boolean {
  if (!node) return true
  const parent = findParentNodeById(rootNodes, node.id)
  if (!parent) return true
  return !isPageLikeKind(parent.nodeKind ?? 'module')
}

/** 获取节点类型的默认图标 */
export function defaultNavIconByKind(kind: NavNodeKind): string {
  return DEFAULT_NAV_ICON_BY_KIND[kind]
}

// ═══════════════════════════════════════════════════════
// 7. DTO 操作
//
// ProjectNodeData ↔ NavigationNodeEditDto 双向转换 + 补丁应用。
// ═══════════════════════════════════════════════════════

function emptyContextConfig(): NavigationContextEditConfigDto {
  return { placeholder: '', defaultValue: '', paramName: '' }
}

function normalizeContextItems(items: readonly NavContextItem[]): Array<{ id: string; title: string }> {
  return items.map(item => ({ id: String(item.id), title: item.title }))
}

/** 从 ProjectNodeData 创建编辑器 DTO */
export function createNavigationNodeEditDto(navNode: ProjectNodeData): NavigationNodeEditInputDto {
  const nodeDto: NavigationNodeEditDto = {
    id: navNode.id,
    title: navNode.title,
    icon: navNode.icon ?? defaultNavIconByKind(navNode.nodeKind ?? 'page'),
    nodeKind: navNode.nodeKind ?? 'page',
    dividerAfter: navNode.dividerAfter ?? false,
    description: navNode.description ?? '',
    path: navNode.path ?? '',
    linkTarget: navNode.linkTarget === 'new-tab' || navNode.linkTarget === 'self' ? navNode.linkTarget : 'iframe',
    refId: navNode.refId ?? '',
    childPlacement: navNode.childPlacement ?? '',
    order: navNode.order ?? 0,
    hidden: navNode.hidden ?? false,
    disabled: navNode.disabled ?? false,
    permissionMode: navNode.permissionMode ?? 'masked',
  }

  if (navNode.context === undefined) {
    return {
      node: nodeDto,
      context: { hasContext: false, items: [], config: emptyContextConfig() },
    }
  }

  if (Array.isArray(navNode.context)) {
    return {
      node: nodeDto,
      context: {
        hasContext: true,
        items: normalizeContextItems(navNode.context),
        config: emptyContextConfig(),
      },
    }
  }

  if (isNavContextConfig(navNode.context)) {
    const source = navNode.context.source
    return {
      node: nodeDto,
      context: {
        hasContext: true,
        items: Array.isArray(source) ? normalizeContextItems(source) : [],
        config: {
          placeholder: navNode.context.placeholder ?? '',
          defaultValue: navNode.context.defaultValue !== undefined
            ? String(navNode.context.defaultValue)
            : '',
          paramName: navNode.context.paramName ?? '',
        },
      },
    }
  }

  return {
    node: nodeDto,
    context: { hasContext: false, items: [], config: emptyContextConfig() },
  }
}

/** 切换节点类型时重置 DTO 相关字段 */
export function applyNodeKindPresetToEditDto(node: NavigationNodeEditDto, kind: NavNodeKind): NavigationNodeEditDto {
  const next = { ...node }
  const previousKind = next.nodeKind
  next.nodeKind = kind

  const previousDefault = defaultNavIconByKind(previousKind)
  const nextDefault = defaultNavIconByKind(kind)
  if (!next.icon || next.icon === previousDefault) {
    next.icon = nextDefault
  }

  if (kind === 'system-directory') {
    next.hidden = false
    next.path = ''
    next.linkTarget = 'iframe'
    return next
  }
  if (kind === 'module') {
    next.hidden = false
    next.path = ''
    next.linkTarget = 'iframe'
    return next
  }
  if (kind === 'system-page' || kind === 'page') {
    next.hidden = false
    next.linkTarget = 'iframe'
    return next
  }
  if (kind === 'link') {
    next.hidden = false
    next.path = ''
    next.refId = ''
    return next
  }
  if (kind === 'ref') {
    next.hidden = false
    next.path = ''
    next.linkTarget = 'iframe'
    return next
  }

  next.hidden = true
  next.path = ''
  next.linkTarget = 'iframe'
  return next
}

/** 将编辑 DTO 输入转为 ProjectNodeData 补丁（不修改原始节点） */
export function createNavigationNodePatch(input: NavigationNodeEditInputDto): NavigationNodeEditApplyResultDto {
  const nodeDto = { ...input.node }
  const warnings: string[] = []

  if (nodeDto.nodeKind === 'sub-page') {
    nodeDto.hidden = true
    nodeDto.path = ''
    nodeDto.linkTarget = 'iframe'
  } else if (nodeDto.nodeKind === 'ref') {
    nodeDto.path = ''
    nodeDto.linkTarget = 'iframe'
  } else if (nodeDto.nodeKind === 'system-page' || nodeDto.nodeKind === 'page') {
    nodeDto.linkTarget = 'iframe'
  }

  const patch: NavigationNodeEditPatchDto & Pick<ProjectNodeData, 'title' | 'nodeKind'> = {
    title: nodeDto.title,
    nodeKind: nodeDto.nodeKind,
    icon: nodeDto.icon,
    dividerAfter: nodeDto.dividerAfter,
    description: nodeDto.description,
    path: nodeDto.path,
    linkTarget: nodeDto.linkTarget,
    childPlacement: nodeDto.childPlacement,
    order: nodeDto.order,
    hidden: nodeDto.hidden,
    disabled: nodeDto.disabled,
    refId: nodeDto.refId,
    permissionMode: nodeDto.permissionMode,
  }

  if (nodeDto.nodeKind === 'link') patch.linkTarget = nodeDto.linkTarget
  if (nodeDto.nodeKind === 'ref' && nodeDto.refId) {
    if (nodeDto.refId === nodeDto.id) {
      warnings.push('不能引用自身，已忽略 refId')
      patch.refId = ''
    } else {
      patch.refId = nodeDto.refId
    }
  }
  if (nodeDto.childPlacement && !isChildPlacement(nodeDto.childPlacement)) patch.childPlacement = ''

  patch.context = ''
  if (input.context.hasContext && input.context.items.length > 0) {
    const items = input.context.items.filter(item => item.id && item.title)
    if (items.length > 0) {
      if (
        input.context.config.placeholder
        || input.context.config.defaultValue
        || input.context.config.paramName
      ) {
        const ctx: NavContextConfig = { source: items }
        if (input.context.config.placeholder) ctx.placeholder = input.context.config.placeholder
        if (input.context.config.defaultValue) ctx.defaultValue = input.context.config.defaultValue
        if (input.context.config.paramName) ctx.paramName = input.context.config.paramName
        patch.context = ctx
      } else {
        patch.context = items
      }
    }
  }

  return { patch, warnings }
}

/** 将编辑 DTO 补丁应用到已有 ProjectNodeData 实例 */
export function applyNavigationNodeEditDtoToNode(node: ProjectNodeData, input: NavigationNodeEditInputDto): NavigationNodeEditApplyResultDto {
  const result = createNavigationNodePatch(input)
  if (!('icon' in result.patch)) delete node.icon
  if (!('description' in result.patch)) delete node.description
  if (!('path' in result.patch)) delete node.path
  if (!('linkTarget' in result.patch)) delete node.linkTarget
  if (!('childPlacement' in result.patch)) delete node.childPlacement
  if (!('hidden' in result.patch)) delete node.hidden
  if (!('disabled' in result.patch)) delete node.disabled
  if (!('context' in result.patch)) delete node.context
  if (!('dividerAfter' in result.patch)) delete node.dividerAfter
  if (!('nodeKind' in result.patch)) delete node.nodeKind
  if (!('refId' in result.patch)) delete node.refId
  if (!('permissionMode' in result.patch)) delete node.permissionMode
  Object.assign(node, result.patch)
  if (!result.patch.icon) delete node.icon
  if (!result.patch.description) delete node.description
  if (!result.patch.path) delete node.path
  if (result.patch.nodeKind !== 'link' || !result.patch.linkTarget) delete node.linkTarget
  if (!result.patch.childPlacement) delete node.childPlacement
  if (!result.patch.hidden) delete node.hidden
  if (!result.patch.disabled) delete node.disabled
  if (result.patch.context === undefined || result.patch.context === '') delete node.context
  if (!result.patch.dividerAfter) delete node.dividerAfter
  if (result.patch.nodeKind !== 'ref' || !result.patch.refId) delete node.refId
  return result
}

// ═══════════════════════════════════════════════════════
// 8. 节点工厂
//
// 创建新节点时的默认模板。
// ═══════════════════════════════════════════════════════

/** 创建根模块节点 */
export function createRootModuleNode(createId: () => string): ProjectNodeData {
  return {
    id: createId(),
    nodeKind: 'module',
    title: '新模块',
    icon: 'FolderOpened',
    childPlacement: 'sidebar',
    children: [],
  }
}

/** 创建子页面节点 */
export function createChildPageNode(createId: () => string): ProjectNodeData {
  const id = createId()
  return {
    id,
    nodeKind: 'page',
    title: '新页面',
    icon: defaultNavIconByKind('page'),
    path: `/${id}`,
  }
}

/** 创建保留区域根分组（工具栏 / 用户菜单） */
export function createReservedRootGroup(
  placement: 'toolbar' | 'user-menu',
  options: { createId: () => string; templateRoot?: ProjectModelData | null },
): ProjectNodeData {
  const template = options.templateRoot?.children.find(node => node.childPlacement === placement)
  if (template) {
    const cloned = deepClone(template)
    cloned.id = options.createId()
    return normalizeProjectNodeData(cloned)
  }

  if (placement === 'toolbar') {
    return {
      id: options.createId(),
      nodeKind: 'system-directory',
      title: '工具栏',
      icon: 'SetUp',
      childPlacement: 'toolbar',
      children: [],
    }
  }

  return {
    id: options.createId(),
    nodeKind: 'system-directory',
    title: '用户菜单',
    icon: 'User',
    childPlacement: 'user-menu',
    children: [],
  }
}

// ═══════════════════════════════════════════════════════
// 9. 编辑会话
//
// 内存中持有导航根节点的编辑状态，
// 提供查找、替换等操作方法。
// ═══════════════════════════════════════════════════════

/** 导航编辑会话：持有 ProjectModelData 的内存快照，提供查找和替换操作 */
export class NavigationEditSession {
  private rootValue: ProjectModelData = normalizeNavRoot({ title: '', childPlacement: 'header', children: [] })

  /** 当前根节点快照 */
  get root(): ProjectModelData {
    return this.rootValue
  }

  /** 根节点的子节点列表 */
  get children(): ProjectNodeData[] {
    return this.rootValue.children
  }

  /** 替换整个根节点 */
  replaceRoot(root: Partial<ProjectModelData> & { children?: ProjectNodeData[] }): ProjectModelData {
    this.rootValue = normalizeNavRoot(root)
    return this.rootValue
  }

  /** 替换根节点的所有子节点 */
  replaceChildren(children: ProjectNodeData[], options?: Partial<Omit<ProjectModelData, 'children'>>): ProjectModelData {
    this.rootValue = buildNavRoot(children, options)
    return this.rootValue
  }

  /** 按 ID 查找节点 */
  findNode(id: string): ProjectNodeData | null {
    return findNodeById(this.rootValue.children, id)
  }

  /** 查找节点在树中的位置 */
  findLocation(id: string): ProjectNodeLocation | null {
    return findNodeLocation(this.rootValue.children, id)
  }
}
