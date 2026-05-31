/** RefNode——跨项目引用。 */
import { PageNode } from './base'
import type { ProjectNodeFamily } from '../../contract/node'
export class RefNode extends PageNode {
  get family(): ProjectNodeFamily { return 'ref' }
  get pageNodeKind(): 'ref' { return 'ref' }
}
