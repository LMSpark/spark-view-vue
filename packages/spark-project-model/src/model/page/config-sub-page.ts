/** ConfigSubPageNode — sub-page 配置页（与 page 同属四文件模型，nodeKind 区分）。 */
import { ConfigPageNode } from './config-page'

export class ConfigSubPageNode extends ConfigPageNode {
  override get family() {
    return 'config-page' as const
  }

  get isSubPage(): boolean {
    return true
  }
}
