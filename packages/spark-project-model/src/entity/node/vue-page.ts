/** VuePageNode——Vue 系统页面。 */
import { PageNode } from './base'
import type { ProjectNodeFamily } from '../../contract/node'
export class VuePageNode extends PageNode {
  get family(): ProjectNodeFamily { return 'vue-page' }
  get pageNodeKind(): 'vue' { return 'vue' }
  get routePath(): string { return this.path ?? '' }
}
