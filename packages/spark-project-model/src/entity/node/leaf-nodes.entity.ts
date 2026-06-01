/** Leaf project nodes: Vue system pages, actions, links, and refs. */
import { PageNode } from './node-base.entity'
import type { ProjectNodeFamily } from '../../contract/node.contract'

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
}

export class RefNode extends PageNode {
  get family(): ProjectNodeFamily { return 'ref' }
  get pageNodeKind(): 'ref' { return 'ref' }
}
