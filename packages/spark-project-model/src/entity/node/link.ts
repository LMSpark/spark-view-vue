/** LinkNode——外链。 */
import { PageNode } from './base'
import type { ProjectNodeFamily } from '../../contract/node'
export class LinkNode extends PageNode {
  get family(): ProjectNodeFamily { return 'link' }
  get pageNodeKind(): 'link' { return 'link' }
}
