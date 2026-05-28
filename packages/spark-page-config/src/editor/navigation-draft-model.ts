/**
 * 导航草稿领域模型 — PageModel 的导航属性子模型。
 *
 * 持有页面导航节点的全部可编辑属性（18 字段 draft + context），
 * 以及到导航树中 NavNode 的引用。
 * 通过现有 createNavigationNodeDraft / applyNavigationNodeDraftToNode
 * 完成 NavNode ↔ draft 双向转换。
 *
 * 所有字段使用 getter/setter：任意字段赋值自动标记 dirty 并通知订阅者。
 * context 通过 setContextItems / updateContextConfig / addContextItem / removeContextItem 修改。
 */

import type { NavNode, NavNodeKind } from '../navigation/nav-model'
import type {
  NavigationNodeDraft,
  NavigationContextDraft,
  NavigationContextDraftConfig,
  NavigationNodeDraftApplyResult,
} from '../navigation/nav-editing'
import {
  createNavigationNodeDraft,
  applyNavigationNodeDraftToNode,
  applyNodeKindPresetToDraft,
} from '../navigation/nav-editing'
import type { NavigationConfigClient } from '../navigation/nav-client'

function cloneConfig(c: NavigationContextDraftConfig): NavigationContextDraftConfig {
  return { placeholder: c.placeholder, defaultValue: c.defaultValue, paramName: c.paramName }
}

function emptyContextConfig(): NavigationContextDraftConfig {
  return { placeholder: '', defaultValue: '', paramName: '' }
}

export class NavigationDraftModel {
  // ── 私有存储 ──
  private _id = ''
  private _title = ''
  private _icon = ''
  private _nodeKind: NavNodeKind = 'page'
  private _dividerAfter = false
  private _description = ''
  private _path = ''
  private _redirect = ''
  private _linkTarget: NavigationNodeDraft['linkTarget'] = 'iframe'
  private _parentPageId = ''
  private _childPlacement = ''
  private _order = 0
  private _hidden = false
  private _disabled = false
  private _refId = ''
  private _permissionMode: NavigationNodeDraft['permissionMode'] = 'masked'

  // ── 上下文 ──
  private _hasContext = false
  private _contextItems: Array<{ id: string; title: string }> = []
  private _contextConfig: NavigationContextDraftConfig = emptyContextConfig()

  // ── 树节点引用 ──
  navNode: NavNode | null = null

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
  set id(v: string) { if (this._id === v) return; this._id = v; this.markDirty() }

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

  get redirect(): string { return this._redirect }
  set redirect(v: string) { if (this._redirect === v) return; this._redirect = v; this.markDirty() }

  get linkTarget(): NavigationNodeDraft['linkTarget'] { return this._linkTarget }
  set linkTarget(v: NavigationNodeDraft['linkTarget']) { if (this._linkTarget === v) return; this._linkTarget = v; this.markDirty() }

  get parentPageId(): string { return this._parentPageId }
  set parentPageId(v: string) { if (this._parentPageId === v) return; this._parentPageId = v; this.markDirty() }

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

  get permissionMode(): NavigationNodeDraft['permissionMode'] { return this._permissionMode }
  set permissionMode(v: NavigationNodeDraft['permissionMode']) { if (this._permissionMode === v) return; this._permissionMode = v; this.markDirty() }

  // ── 上下文 getter/setter ───────────────────────────────

  get hasContext(): boolean { return this._hasContext }
  set hasContext(v: boolean) { if (this._hasContext === v) return; this._hasContext = v; this.markDirty() }

  /** 只读上下文项（不可直接 push / splice，请用 addContextItem / removeContextItem / setContextItems）。 */
  get contextItems(): ReadonlyArray<{ id: string; title: string }> { return this._contextItems }

  /** 只读上下文配置（不可直接赋值字段，请用 updateContextConfig / setContextConfig）。 */
  get contextConfig(): Readonly<NavigationContextDraftConfig> { return this._contextConfig }

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

  setContextConfig(config: NavigationContextDraftConfig): void {
    this._contextConfig = cloneConfig(config)
    this.markDirty()
  }

  updateContextConfig(patch: Partial<NavigationContextDraftConfig>): void {
    if (patch.placeholder !== undefined) this._contextConfig.placeholder = patch.placeholder
    if (patch.defaultValue !== undefined) this._contextConfig.defaultValue = patch.defaultValue
    if (patch.paramName !== undefined) this._contextConfig.paramName = patch.paramName
    this.markDirty()
  }

  /** 从 NavigationNodeDraft 批量加载字段并标记 dirty。供 AI host / 外部调用方使用。 */
  applyDraft(patch: Partial<NavigationNodeDraft>): void {
    if (patch.id !== undefined) this._id = patch.id
    if (patch.title !== undefined) this._title = patch.title
    if (patch.icon !== undefined) this._icon = patch.icon
    if (patch.nodeKind !== undefined) this._nodeKind = patch.nodeKind
    if (patch.dividerAfter !== undefined) this._dividerAfter = patch.dividerAfter
    if (patch.description !== undefined) this._description = patch.description
    if (patch.path !== undefined) this._path = patch.path
    if (patch.redirect !== undefined) this._redirect = patch.redirect
    if (patch.linkTarget !== undefined) this._linkTarget = patch.linkTarget
    if (patch.parentPageId !== undefined) this._parentPageId = patch.parentPageId
    if (patch.childPlacement !== undefined) this._childPlacement = patch.childPlacement
    if (patch.order !== undefined) this._order = patch.order
    if (patch.hidden !== undefined) this._hidden = patch.hidden
    if (patch.disabled !== undefined) this._disabled = patch.disabled
    if (patch.refId !== undefined) this._refId = patch.refId
    if (patch.permissionMode !== undefined) this._permissionMode = patch.permissionMode
    this.markDirty()
  }

  /** 从 NavigationContextDraft 批量加载上下文并标记 dirty。供 AI host / 外部调用方使用。 */
  applyContext(patch: Partial<NavigationContextDraft>): void {
    if (patch.hasContext !== undefined) this._hasContext = patch.hasContext
    if (patch.items !== undefined) this._contextItems = patch.items.map(i => ({ ...i }))
    if (patch.config !== undefined) this._contextConfig = cloneConfig(patch.config)
    this.markDirty()
  }

  // ── 节点操作 ───────────────────────────────────────────

  /** 从导航树节点加载属性到草稿字段，绕过 setter 直接写入内部存储，然后清除 dirty。 */
  loadFromNode(node: NavNode): void {
    this.navNode = node
    const input = createNavigationNodeDraft(node)
    this._bulkLoadDraft(input.draft)
    this._hasContext = input.context.hasContext
    this._contextItems = input.context.items.map(i => ({ ...i }))
    this._contextConfig = cloneConfig(input.context.config)
    this._dirty = false
  }

  /** 将草稿字段应用回树节点，返回补丁和警告。不清除 dirty（由 save 流程清除）。 */
  applyToNode(): NavigationNodeDraftApplyResult {
    if (!this.navNode) {
      throw new Error('导航节点引用为空，无法应用草稿')
    }
    return applyNavigationNodeDraftToNode(this.navNode, this.toDraftInput())
  }

  /** 切换节点类型，重置关联字段并标记 dirty。 */
  applyKindPreset(kind: NavNodeKind): void {
    const updated = applyNodeKindPresetToDraft(this.toDraft(), kind)
    this._bulkLoadDraft(updated)
    this._dirty = true
    this._notify()
  }

  /** 将当前字段组装为 NavigationNodeDraft。 */
  toDraft(): NavigationNodeDraft {
    return {
      id: this._id,
      title: this._title,
      icon: this._icon,
      nodeKind: this._nodeKind,
      dividerAfter: this._dividerAfter,
      description: this._description,
      path: this._path,
      redirect: this._redirect,
      linkTarget: this._linkTarget,
      parentPageId: this._parentPageId,
      childPlacement: this._childPlacement,
      order: this._order,
      hidden: this._hidden,
      disabled: this._disabled,
      refId: this._refId,
      permissionMode: this._permissionMode,
    }
  }

  /** 将当前字段 + 上下文组装为 NavigationNodeDraftInput。 */
  toDraftInput(): { draft: NavigationNodeDraft; context: NavigationContextDraft } {
    return {
      draft: this.toDraft(),
      context: {
        hasContext: this._hasContext,
        items: this._contextItems,
        config: cloneConfig(this._contextConfig),
      },
    }
  }

  // ── IO ─────────────────────────────────────────────────

  /** 应用草稿到树节点并持久化到远端。 */
  async save(navClient: NavigationConfigClient): Promise<void> {
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

  /** 绕过 setter 批量写入 draft 字段，不触发 dirty。 */
  private _bulkLoadDraft(draft: NavigationNodeDraft): void {
    this._id = draft.id
    this._title = draft.title
    this._icon = draft.icon
    this._nodeKind = draft.nodeKind
    this._dividerAfter = draft.dividerAfter
    this._description = draft.description
    this._path = draft.path
    this._redirect = draft.redirect
    this._linkTarget = draft.linkTarget
    this._parentPageId = draft.parentPageId
    this._childPlacement = draft.childPlacement
    this._order = draft.order
    this._hidden = draft.hidden
    this._disabled = draft.disabled
    this._refId = draft.refId
    this._permissionMode = draft.permissionMode
  }

  private _notify(): void {
    for (const listener of this._listeners) {
      listener()
    }
  }
}
