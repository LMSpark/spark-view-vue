/** 页面类节点基类。 */
import { ProjectNode } from './node-base.entity'
import type { NavNodeKind, NavPermissionMode } from './node-base.entity'

export abstract class PageNode extends ProjectNode {
  abstract get pageNodeKind(): 'config' | 'vue' | 'action' | 'link' | 'ref'
  get icon(): string | undefined { return this.node.icon }
  get path(): string | undefined { return this.node.path }
  get nodeKind(): NavNodeKind { return this.node.nodeKind ?? 'page' }
  get order(): number | undefined { return this.node.order }
  get hidden(): boolean | undefined { return this.node.hidden }
  get disabled(): boolean | undefined { return this.node.disabled }
  get dividerAfter(): boolean | undefined { return this.node.dividerAfter }
  get permissionMode(): NavPermissionMode | undefined { return this.node.permissionMode }
}
