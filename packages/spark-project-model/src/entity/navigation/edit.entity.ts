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

type NavigationNodeEditModelPatchDto = Partial<Omit<NavigationNodeEditDto, 'id'>>

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
  // ── 私有存储 ──
  private _id = ''
  private _title = ''
  private _icon = ''
  private _nodeKind: NavNodeKind = 'page'
  private _dividerAfter = false
  private _description = ''
  private _path = ''
  private _linkTarget: NavigationNodeEditDto['linkTarget'] = 'iframe'
  private _childPlacement = ''
  private _order = 0
  private _hidden = false
  private _disabled = false
  private _refId = ''
  private _permissionMode: NavigationNodeEditDto['permissionMode'] = 'masked'

  // ── 上下文 ──
  private _hasContext = false
  private _contextItems: Array<{ id: string; title: string }> = []
  private _contextConfig: NavigationContextEditConfigDto = emptyContextConfig()

  // ── 树节点引用 ──
  navNode: ProjectNodeData | null = null

  // ── Dirty ──
  private _dirty = false
  private readonly _listeners = new Set<() => void>()

  get isDirty(): boolean {
    return this._dirty
  }

  markDirty(): void {
    if (this._dirty) return
    this._dirty = true
    this._notify()
  }

  markClean(): void {
    if (!this._dirty) return
    this._dirty = false
    this._notify()
  }

  // ── 节点属性 getter/setter（赋值即 dirty）───────────────

  get id(): string { return this._id }

  get title(): string { return this._title }
  set title(v: string) { if (this._title === v) return; this._title = v; this.markDirty() }

  get icon(): string { return this._icon }
  set icon(v: string) { if (this._icon === v) return; this._icon = v; this.markDirty() }

  get nodeKind(): NavNodeKind { return this._nodeKind }
  set nodeKind(v: NavNodeKind) { if (this._nodeKind === v) return; this._nodeKind = v; this.markDirty() }

  get dividerAfter(): boolean { return this._dividerAfter }
  set dividerAfter(v: boolean) { if (this._dividerAfter === v) return; this._dividerAfter = v; this.markDirty() }

  get description(): string { return this._description }
  set description(v: string) { if (this._description === v) return; this._description = v; this.markDirty() }

  get path(): string { return this._path }
  set path(v: string) { if (this._path === v) return; this._path = v; this.markDirty() }

  get linkTarget(): NavigationNodeEditDto['linkTarget'] { return this._linkTarget }
  set linkTarget(v: NavigationNodeEditDto['linkTarget']) { if (this._linkTarget === v) return; this._linkTarget = v; this.markDirty() }

  get childPlacement(): string { return this._childPlacement }
  set childPlacement(v: string) { if (this._childPlacement === v) return; this._childPlacement = v; this.markDirty() }

  get order(): number { return this._order }
  set order(v: number) { if (this._order === v) return; this._order = v; this.markDirty() }

  get hidden(): boolean { return this._hidden }
  set hidden(v: boolean) { if (this._hidden === v) return; this._hidden = v; this.markDirty() }

  get disabled(): boolean { return this._disabled }
  set disabled(v: boolean) { if (this._disabled === v) return; this._disabled = v; this.markDirty() }

  get refId(): string { return this._refId }
  set refId(v: string) { if (this._refId === v) return; this._refId = v; this.markDirty() }

  get permissionMode(): NavigationNodeEditDto['permissionMode'] { return this._permissionMode }
  set permissionMode(v: NavigationNodeEditDto['permissionMode']) { if (this._permissionMode === v) return; this._permissionMode = v; this.markDirty() }

  // ── 上下文 getter/setter ───────────────────────────────

  get hasContext(): boolean { return this._hasContext }
  set hasContext(v: boolean) { if (this._hasContext === v) return; this._hasContext = v; this.markDirty() }

  /** 只读上下文项（不可直接 push / splice，请用 addContextItem / removeContextItem / setContextItems）。 */
  get contextItems(): ReadonlyArray<{ id: string; title: string }> { return this._contextItems }

  /** 只读上下文配置（不可直接赋值字段，请用 updateContextConfig / setContextConfig）。 */
  get contextConfig(): Readonly<NavigationContextEditConfigDto> { return this._contextConfig }

  // ── 上下文修改方法（自动 dirty）────────────────────────

  setContextItems(items: Array<{ id: string; title: string }>): void {
    this._contextItems = items.map(i => ({ ...i }))
    this.markDirty()
  }

  addContextItem(item?: { id: string; title: string }): void {
    this._contextItems.push(item ? { ...item } : { id: '', title: '' })
    this.markDirty()
  }

  removeContextItem(index: number): void {
    if (index < 0 || index >= this._contextItems.length) return
    this._contextItems.splice(index, 1)
    this.markDirty()
  }

  setContextConfig(config: NavigationContextEditConfigDto): void {
    this._contextConfig = cloneConfig(config)
    this.markDirty()
  }

  updateContextConfig(patch: Partial<NavigationContextEditConfigDto>): void {
    if (patch.placeholder !== undefined) this._contextConfig.placeholder = patch.placeholder
    if (patch.defaultValue !== undefined) this._contextConfig.defaultValue = patch.defaultValue
    if (patch.paramName !== undefined) this._contextConfig.paramName = patch.paramName
    this.markDirty()
  }

  /** 从 NavigationNodeEditDto 批量加载字段并标记 dirty。供 AI host / 外部调用方使用。 */
  applyEditPatchDto(patch: NavigationNodeEditModelPatchDto): void {
    if (patch.title !== undefined) this._title = patch.title
    if (patch.icon !== undefined) this._icon = patch.icon
    if (patch.nodeKind !== undefined) this._nodeKind = patch.nodeKind
    if (patch.dividerAfter !== undefined) this._dividerAfter = patch.dividerAfter
    if (patch.description !== undefined) this._description = patch.description
    if (patch.path !== undefined) this._path = patch.path
    if (patch.linkTarget !== undefined) this._linkTarget = patch.linkTarget
    if (patch.childPlacement !== undefined) this._childPlacement = patch.childPlacement
    if (patch.order !== undefined) this._order = patch.order
    if (patch.hidden !== undefined) this._hidden = patch.hidden
    if (patch.disabled !== undefined) this._disabled = patch.disabled
    if (patch.refId !== undefined) this._refId = patch.refId
    if (patch.permissionMode !== undefined) this._permissionMode = patch.permissionMode
    this.markDirty()
  }

  /** 从 NavigationContextEditDto 批量加载上下文并标记 dirty。供 AI host / 外部调用方使用。 */
  applyContext(patch: Partial<NavigationContextEditDto>): void {
    if (patch.hasContext !== undefined) this._hasContext = patch.hasContext
    if (patch.items !== undefined) this._contextItems = patch.items.map(i => ({ ...i }))
    if (patch.config !== undefined) this._contextConfig = cloneConfig(patch.config)
    this.markDirty()
  }

  // ── 节点操作 ───────────────────────────────────────────

  /** 从导航树节点加载属性到 DTO 字段，绕过 setter 直接写入内部存储，然后清除 dirty。 */
  loadFromNode(node: ProjectNodeData): void {
    this.navNode = node
    const input = createNavigationNodeEditDto(node)
    this._bulkLoadEditDto(input.node)
    this._hasContext = input.context.hasContext
    this._contextItems = input.context.items.map(i => ({ ...i }))
    this._contextConfig = cloneConfig(input.context.config)
    this._dirty = false
  }

  /** 将 DTO 字段应用回树节点，返回补丁和警告。不清除 dirty（由 save 流程清除）。 */
  applyToNode(): NavigationNodeEditApplyResultDto {
    if (!this.navNode) {
      throw new Error('导航节点引用为空，无法应用编辑 DTO')
    }
    return applyNavigationNodeEditDtoToNode(this.navNode, this.toEditInputDto())
  }

  /** 切换节点类型，重置关联字段并标记 dirty。 */
  applyKindPreset(kind: NavNodeKind): void {
    const updated = applyNodeKindPresetToEditDto(this.toEditDto(), kind)
    this._bulkLoadEditDto(updated)
    this._dirty = true
    this._notify()
  }

  /** 将当前字段组装为 NavigationNodeEditDto。 */
  toEditDto(): NavigationNodeEditDto {
    return {
      id: this._id,
      title: this._title,
      icon: this._icon,
      nodeKind: this._nodeKind,
      dividerAfter: this._dividerAfter,
      description: this._description,
      path: this._path,
      linkTarget: this._linkTarget,
      childPlacement: this._childPlacement,
      order: this._order,
      hidden: this._hidden,
      disabled: this._disabled,
      refId: this._refId,
      permissionMode: this._permissionMode,
    }
  }

  /** 将当前字段 + 上下文组装为 NavigationNodeEditInputDto。 */
  toEditInputDto(): { node: NavigationNodeEditDto; context: NavigationContextEditDto } {
    return {
      node: this.toEditDto(),
      context: {
        hasContext: this._hasContext,
        items: this._contextItems,
        config: cloneConfig(this._contextConfig),
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

  subscribe(listener: () => void): () => void {
    this._listeners.add(listener)
    return () => { this._listeners.delete(listener) }
  }

  // ── 内部 ───────────────────────────────────────────────

  /** 绕过 setter 批量写入 DTO 字段，不触发 dirty。 */
  private _bulkLoadEditDto(node: NavigationNodeEditDto): void {
    this._id = node.id
    this._title = node.title
    this._icon = node.icon
    this._nodeKind = node.nodeKind
    this._dividerAfter = node.dividerAfter
    this._description = node.description
    this._path = node.path
    this._linkTarget = node.linkTarget
    this._childPlacement = node.childPlacement
    this._order = node.order
    this._hidden = node.hidden
    this._disabled = node.disabled
    this._refId = node.refId
    this._permissionMode = node.permissionMode
  }

  private _notify(): void {
    for (const listener of this._listeners) {
      listener()
    }
  }
}
