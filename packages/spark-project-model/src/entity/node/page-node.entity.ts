/** 页面类节点基类。 */
import { ProjectNode } from './node-base.entity'
import type { NavNodeKind } from './node-base.entity'

export abstract class PageNode extends ProjectNode {
  abstract get pageNodeKind(): 'config' | 'vue' | 'action' | 'link' | 'ref'
  get icon(): string | undefined { return this.node.icon }
  get path(): string | undefined { return this.node.path }
  get nodeKind(): NavNodeKind { return this.node.nodeKind ?? 'page' }
}
