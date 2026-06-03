/** Leaf project nodes: Vue system pages, actions, links, and refs. */
import { ProjectNode } from './node-base.entity'
import type { ProjectNodeFamily } from './module-node.entity'

export class VuePageNode extends ProjectNode {
  get family(): ProjectNodeFamily { return 'vue-page' }
}

export class ActionNode extends ProjectNode {
  get family(): ProjectNodeFamily { return 'system-action' }
}

export class LinkNode extends ProjectNode {
  get family(): ProjectNodeFamily { return 'link' }
}

export class RefNode extends ProjectNode {
  get family(): ProjectNodeFamily { return 'ref' }
}
