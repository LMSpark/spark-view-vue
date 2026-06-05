/** ConfigSubPageNode — sub-page 配置页（四文件模型，nodeKind=sub-page，无独立 path）。 */
import { ConfigPageNode } from './config-page'
import type { ProjectPageNodeSummary } from '../navigation/node'

export class ConfigSubPageNode extends ConfigPageNode {
  override get isSubPage(): boolean { return true }

  override get family() {
    return 'config-page' as const
  }

  override toSummary(): ProjectPageNodeSummary {
    const summary = super.toSummary()
    return {
      ...summary,
      nodeKind: 'sub-page',
      designSurface: 'config-files',
    }
  }
}
