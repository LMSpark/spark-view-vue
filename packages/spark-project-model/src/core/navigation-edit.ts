/**
 * 导航编辑领域模型 — PageNode 的导航属性子模型。
 *
 * 持有页面导航节点引用和 dirty 状态。
 * 可编辑字段以 ProjectNodeData 为真源，DTO 只在表单读写边界即时生成。
 */

import type {
  ChildPlacement,
  NavContextConfig,
  NavContextItem,
  NavNodeKind,
  NavPermissionMode,
  ProjectNodeData,
} from './node'

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

type NavigationContextEditConfigDto = {
  placeholder: string
  defaultValue: string
  paramName: string
}

type NavigationContextEditDto = {
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

const DEFAULT_NAV_ICON_BY_KIND: Record<NavNodeKind, string> = {
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
  /** @vcmIgnore */
  navNode: ProjectNodeData | null = null

  #dirty = false
  #listeners = new Set<() => void>()

  get isDirty(): boolean { return this.#dirty }

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

  /** @vcmIgnore */
  get id(): string { return this.navNode?.id ?? '' }

  get title(): string { return this.readEditDto().node.title }
  set title(v: string) { this.updateEditDto(input => { input.node.title = v }) }

  get icon(): string { return this.readEditDto().node.icon }
  set icon(v: string) { this.updateEditDto(input => { input.node.icon = v }) }

  get nodeKind(): NavNodeKind { return this.readEditDto().node.nodeKind }
  set nodeKind(v: NavNodeKind) { this.updateEditDto(input => { input.node.nodeKind = v }) }

  /** @vcmIgnore */
  get dividerAfter(): boolean { return this.readEditDto().node.dividerAfter }
  set dividerAfter(v: boolean) { this.updateEditDto(input => { input.node.dividerAfter = v }) }

  get description(): string { return this.readEditDto().node.description }
  set description(v: string) { this.updateEditDto(input => { input.node.description = v }) }

  get path(): string { return this.readEditDto().node.path }
  set path(v: string) { this.updateEditDto(input => { input.node.path = v }) }

  /** @vcmIgnore */
  get linkTarget(): NavigationNodeEditDto['linkTarget'] { return this.readEditDto().node.linkTarget }
  set linkTarget(v: NavigationNodeEditDto['linkTarget']) { this.updateEditDto(input => { input.node.linkTarget = v }) }

  /** @vcmIgnore */
  get childPlacement(): string { return this.readEditDto().node.childPlacement }
  set childPlacement(v: string) { this.updateEditDto(input => { input.node.childPlacement = v }) }

  /** @vcmIgnore */
  get order(): number { return this.readEditDto().node.order }
  set order(v: number) { this.updateEditDto(input => { input.node.order = v }) }

  get hidden(): boolean { return this.readEditDto().node.hidden }
  set hidden(v: boolean) { this.updateEditDto(input => { input.node.hidden = v }) }

  get disabled(): boolean { return this.readEditDto().node.disabled }
  set disabled(v: boolean) { this.updateEditDto(input => { input.node.disabled = v }) }

  /** @vcmIgnore */
  get refId(): string { return this.readEditDto().node.refId }
  set refId(v: string) { this.updateEditDto(input => { input.node.refId = v }) }

  /** @vcmIgnore */
  get permissionMode(): NavigationNodeEditDto['permissionMode'] { return this.readEditDto().node.permissionMode }
  set permissionMode(v: NavigationNodeEditDto['permissionMode']) { this.updateEditDto(input => { input.node.permissionMode = v }) }

  get hasContext(): boolean { return this.readEditDto().context.hasContext }
  set hasContext(v: boolean) {
    this.updateEditDto((input) => {
      input.context.hasContext = v
      if (!v) {
        input.context.items = []
        input.context.config = emptyContextConfig()
      }
    })
  }

  get contextItems(): ReadonlyArray<{ id: string; title: string }> {
    return this.readEditDto().context.items
  }

  get contextConfig(): Readonly<NavigationContextEditConfigDto> {
    return this.readEditDto().context.config
  }

  setContextItems(items: Array<{ id: string; title: string }>): void {
    this.updateEditDto((input) => {
      input.context.hasContext = items.length > 0 || input.context.hasContext
      input.context.items = items.map(item => ({ ...item }))
    })
  }

  /** @vcmIgnore */
  setContextConfig(config: NavigationContextEditConfigDto): void {
    this.updateEditDto((input) => {
      input.context.config = { ...config }
    })
  }

  /** @vcmIgnore */
  loadFromNode(node: ProjectNodeData): void {
    this.navNode = node
    this.#dirty = false
  }

  /** @vcmIgnore */
  applyToNode(): NavigationNodeEditApplyResultDto {
    if (!this.navNode) {
      throw new Error('导航节点引用为空，无法应用编辑 DTO')
    }
    return applyNavigationNodeEditDtoToNode(this.navNode, createNavigationNodeEditDto(this.navNode))
  }

  /** 切换节点类型，重置关联字段并标记 dirty。 */
  applyKindPreset(kind: NavNodeKind): void {
    this.updateEditDto((input) => {
      input.node = applyNodeKindPresetToEditDto(input.node, kind)
    })
  }

  /** @vcmIgnore */
  toEditInputDto(): { node: NavigationNodeEditDto; context: NavigationContextEditDto } {
    if (!this.navNode) {
      throw new Error('导航节点引用为空，无法生成编辑 DTO')
    }
    return createNavigationNodeEditDto(this.navNode)
  }

  /** @vcmIgnore */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  private readEditDto(): NavigationNodeEditInputDto {
    if (!this.navNode) {
      throw new Error('导航节点引用为空，无法读取编辑 DTO')
    }
    return createNavigationNodeEditDto(this.navNode)
  }

  private updateEditDto(mutator: (input: NavigationNodeEditInputDto) => void): NavigationNodeEditApplyResultDto {
    if (!this.navNode) {
      throw new Error('导航节点引用为空，无法更新编辑 DTO')
    }
    const input = createNavigationNodeEditDto(this.navNode)
    mutator(input)
    const result = applyNavigationNodeEditDtoToNode(this.navNode, input)
    this.markDirty()
    return result
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      listener()
    }
  }
}
