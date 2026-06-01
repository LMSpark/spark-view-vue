/** ModuleNode——分支节点。 */
import { ProjectNode } from './node-base.entity'
import type { ProjectNodeFamily } from '../../contract/node.contract'
export class ModuleNode extends ProjectNode {
  get family(): ProjectNodeFamily { return 'module' }
  get isSystemModule(): boolean { return this.nodeKind === 'system-directory' }
}
