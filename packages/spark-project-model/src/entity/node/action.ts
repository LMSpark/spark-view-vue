/** ActionNode——系统动作。 */
import { PageNode } from './base'
import type { ProjectNodeFamily } from '../../contract/node'
export class ActionNode extends PageNode {
  get family(): ProjectNodeFamily { return 'system-action' }
  get pageNodeKind(): 'action' { return 'action' }
  get actionKey(): string { return this.path ?? '' }
}
