/** Leaf project nodes: Vue system pages, actions, links, and refs. */
import { PageNode } from './page-node.entity'
import type { ProjectNodeFamily } from './module-node.entity'

export type LinkTarget = 'iframe' | 'new-tab' | 'self'

export class VuePageNode extends PageNode {
  get family(): ProjectNodeFamily { return 'vue-page' }
  get pageNodeKind(): 'vue' { return 'vue' }
  get routePath(): string { return this.path ?? '' }
}

export class ActionNode extends PageNode {
  get family(): ProjectNodeFamily { return 'system-action' }
  get pageNodeKind(): 'action' { return 'action' }
  get actionKey(): string { return this.path ?? '' }
}

export class LinkNode extends PageNode {
  get family(): ProjectNodeFamily { return 'link' }
  get pageNodeKind(): 'link' { return 'link' }
  get linkTarget(): LinkTarget | undefined { return this.node.linkTarget }
  get target(): LinkTarget | undefined { return this.linkTarget }
}

export class RefNode extends PageNode {
  get family(): ProjectNodeFamily { return 'ref' }
  get pageNodeKind(): 'ref' { return 'ref' }
  get refId(): string | undefined { return this.node.refId }
  get refPath(): string | undefined { return this.node.refPath }
  get refProjectId(): string | undefined { return this.node.refProjectId }
  get refBroken(): boolean | undefined { return this.node.refBroken }
}
