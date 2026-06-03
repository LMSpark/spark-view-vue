/**
 * 导航编辑领域模型 — PageNode 的导航属性子模型。
 *
 * 持有页面导航节点的全部可编辑属性（dev-system 节点属性表单 + context），
 * 以及到项目树中 ProjectNodeData 的引用。
 * 通过现有 createNavigationNodeEditDto / applyNavigationNodeEditDtoToNode
 * 完成 ProjectNodeData ↔ DTO 双向转换。
 *
 * 所有字段使用 getter/setter：任意字段赋值自动标记 dirty 并通知订阅者。
 * context 通过 setContextItems / updateContextConfig / addContextItem / removeContextItem 修改。
 */

import type {
  ChildPlacement,
  NavContextConfig,
  NavContextItem,
  NavNodeKind,
  NavPermissionMode,
  ProjectNodeData,
} from '../node/node-base.entity'

export type NavigationNodeEditDto = {
  id: string
  title: string
  icon: string
  nodeKind: NavNodeKind
  dividerAfter: boolean
  description: string
  path: string
  linkTarget: NonNullable<ProjectNodeData['linkTarget']>
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

export type NavigationNodePatchWriter = {
  updateNode(id: string, patch: NavigationNodeEditPatchDto): Promise<ProjectNodeData>
}

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

const CHILD_PLACEMENT_VALUES: ReadonlySet<string> = new Set(['header', 'sidebar', 'toolbar', 'user-menu', 'parent', 'flat'])

function cloneConfig(c: NavigationContextEditConfigDto): NavigationContextEditConfigDto {
  return { placeholder: c.placeholder, defaultValue: c.defaultValue, paramName: c.paramName }
}

function emptyContextConfig(): NavigationContextEditConfigDto {
  return { placeholder: '', defaultValue: '', paramName: '' }
}

function isNavContextConfig(value: string | NavContextItem[] | NavContextConfig | undefined): value is NavContextConfig {
  return typeof value === 'object' && !Array.isArray(value) && 'source' in value
}

function isChildPlacement(value: string): value is ChildPlacement {
  return CHILD_PLACEMENT_VALUES.has(value)
}

function normalizeContextItems(items: readonly NavContextItem[]): Array<{ id: string; title: string }> {
  return items.map(item => ({ id: String(item.id), title: item.title }))
}

export function defaultNavIconByKind(kind: NavNodeKind): string {
  return DEFAULT_NAV_ICON_BY_KIND[kind]
}

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

export class NavigationEditModel {
  // ── 私有存储（ECMAScript private，不出现在类型反射中）──
  #id = ''
  #title = ''
  #icon = ''
  #nodeKind: NavNodeKind = 'page'
  #dividerAfter = false
  #description = ''
  #path = ''
  #linkTarget: NavigationNodeEditDto['linkTarget'] = 'iframe'
  #childPlacement = ''
  #order = 0
  #hidden = false
  #disabled = false
  #refId = ''
  #permissionMode: NavigationNodeEditDto['permissionMode'] = 'masked'

  // ── 上下文 ──
  #hasContext = false
  #contextItems: Array<{ id: string; title: string }> = []
  #contextConfig: NavigationContextEditConfigDto = emptyContextConfig()

  // ── 树节点引用 ──
  /** @vcmIgnore */
  navNode: ProjectNodeData | null = null

  // ── Dirty ──
  #dirty = false
  #listeners = new Set<() => void>()

  get isDirty(): boolean {
    return this.#dirty
  }

  /** @vcmIgnore */
  markDirty(): void {
    if (this.#dirty) return
    this.#dirty = true
    this.#notify()
  }

  /** @vcmIgnore */
  markClean(): void {
    if (!this.#dirty) return
    this.#dirty = false
    this.#notify()
  }

  // ── 节点属性 getter/setter（赋值即 dirty）───────────────

  /** @vcmIgnore */
  get id(): string { return this.#id }

  get title(): string { return this.#title }
  set title(v: string) { if (this.#title === v) return; this.#title = v; this.markDirty() }

  get icon(): string { return this.#icon }
  set icon(v: string) { if (this.#icon === v) return; this.#icon = v; this.markDirty() }

  get nodeKind(): NavNodeKind { return this.#nodeKind }
  set nodeKind(v: NavNodeKind) { if (this.#nodeKind === v) return; this.#nodeKind = v; this.markDirty() }

  /** @vcmIgnore */
  get dividerAfter(): boolean { return this.#dividerAfter }
  set dividerAfter(v: boolean) { if (this.#dividerAfter === v) return; this.#dividerAfter = v; this.markDirty() }

  get description(): string { return this.#description }
  set description(v: string) { if (this.#description === v) return; this.#description = v; this.markDirty() }

  get path(): string { return this.#path }
  set path(v: string) { if (this.#path === v) return; this.#path = v; this.markDirty() }

  /** @vcmIgnore */
  get linkTarget(): NavigationNodeEditDto['linkTarget'] { return this.#linkTarget }
  set linkTarget(v: NavigationNodeEditDto['linkTarget']) { if (this.#linkTarget === v) return; this.#linkTarget = v; this.markDirty() }

  /** @vcmIgnore */
  get childPlacement(): string { return this.#childPlacement }
  set childPlacement(v: string) { if (this.#childPlacement === v) return; this.#childPlacement = v; this.markDirty() }

  /** @vcmIgnore */
  get order(): number { return this.#order }
  set order(v: number) { if (this.#order === v) return; this.#order = v; this.markDirty() }

  get hidden(): boolean { return this.#hidden }
  set hidden(v: boolean) { if (this.#hidden === v) return; this.#hidden = v; this.markDirty() }

  get disabled(): boolean { return this.#disabled }
  set disabled(v: boolean) { if (this.#disabled === v) return; this.#disabled = v; this.markDirty() }

  /** @vcmIgnore */
  get refId(): string { return this.#refId }
  set refId(v: string) { if (this.#refId === v) return; this.#refId = v; this.markDirty() }

  /** @vcmIgnore */
  get permissionMode(): NavigationNodeEditDto['permissionMode'] { return this.#permissionMode }
  set permissionMode(v: NavigationNodeEditDto['permissionMode']) { if (this.#permissionMode === v) return; this.#permissionMode = v; this.markDirty() }

  // ── 上下文 getter/setter ───────────────────────────────

  get hasContext(): boolean { return this.#hasContext }
  set hasContext(v: boolean) { if (this.#hasContext === v) return; this.#hasContext = v; this.markDirty() }

  /** 只读上下文项（不可直接 push / splice，请用 setContextItems）。 */
  get contextItems(): ReadonlyArray<{ id: string; title: string }> { return this.#contextItems }

  /** 只读上下文配置（不可直接赋值字段，请用 setContextConfig）。 */
  get contextConfig(): Readonly<NavigationContextEditConfigDto> { return this.#contextConfig }

  // ── 上下文修改方法（自动 dirty）────────────────────────

  setContextItems(items: Array<{ id: string; title: string }>): void {
    this.#contextItems = items.map(i => ({ ...i }))
    this.markDirty()
  }

  /** @vcmIgnore */
  setContextConfig(config: NavigationContextEditConfigDto): void {
    this.#contextConfig = cloneConfig(config)
    this.markDirty()
  }

  // ── 节点操作 ───────────────────────────────────────────

  /** @vcmIgnore */
  loadFromNode(node: ProjectNodeData): void {
    this.navNode = node
    const input = createNavigationNodeEditDto(node)
    this.#bulkLoadEditDto(input.node)
    this.#hasContext = input.context.hasContext
    this.#contextItems = input.context.items.map(i => ({ ...i }))
    this.#contextConfig = cloneConfig(input.context.config)
    this.#dirty = false
  }

  /** @vcmIgnore */
  applyToNode(): NavigationNodeEditApplyResultDto {
    if (!this.navNode) {
      throw new Error('导航节点引用为空，无法应用编辑 DTO')
    }
    return applyNavigationNodeEditDtoToNode(this.navNode, this.toEditInputDto())
  }

  /** 切换节点类型，重置关联字段并标记 dirty。 */
  applyKindPreset(kind: NavNodeKind): void {
    const updated = applyNodeKindPresetToEditDto(this.toEditDto(), kind)
    this.#bulkLoadEditDto(updated)
    this.#dirty = true
    this.#notify()
  }

  private toEditDto(): NavigationNodeEditDto {
    return {
      id: this.#id,
      title: this.#title,
      icon: this.#icon,
      nodeKind: this.#nodeKind,
      dividerAfter: this.#dividerAfter,
      description: this.#description,
      path: this.#path,
      linkTarget: this.#linkTarget,
      childPlacement: this.#childPlacement,
      order: this.#order,
      hidden: this.#hidden,
      disabled: this.#disabled,
      refId: this.#refId,
      permissionMode: this.#permissionMode,
    }
  }

  /** @vcmIgnore */
  toEditInputDto(): { node: NavigationNodeEditDto; context: NavigationContextEditDto } {
    return {
      node: this.toEditDto(),
      context: {
        hasContext: this.#hasContext,
        items: this.#contextItems,
        config: cloneConfig(this.#contextConfig),
      },
    }
  }

  // ── IO ─────────────────────────────────────────────────

  /** 应用 DTO 到树节点并持久化到远端。 */
  async save(navClient: NavigationNodePatchWriter): Promise<void> {
    if (!this.navNode) {
      throw new Error('导航节点引用为空，无法保存')
    }
    const result = this.applyToNode()
    await navClient.updateNode(this.navNode.id, result.patch)
    this.markClean()
  }

  // ── 订阅 ───────────────────────────────────────────────

  /** @vcmIgnore */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  // ── 内部 ───────────────────────────────────────────────

  #bulkLoadEditDto(node: NavigationNodeEditDto): void {
    this.#id = node.id
    this.#title = node.title
    this.#icon = node.icon
    this.#nodeKind = node.nodeKind
    this.#dividerAfter = node.dividerAfter
    this.#description = node.description
    this.#path = node.path
    this.#linkTarget = node.linkTarget
    this.#childPlacement = node.childPlacement
    this.#order = node.order
    this.#hidden = node.hidden
    this.#disabled = node.disabled
    this.#refId = node.refId
    this.#permissionMode = node.permissionMode
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      listener()
    }
  }
}
