import type { PageNodeFileName } from './file'
import type { PageDataSetFile } from './content/dataset-file'
import type { PageRuleFile } from './content/rule-file'
import type { PageTextFile } from './content/text-file'

/** 配置页设计内容聚合（rule / pagedata / script / style）。 */
export class PageDesign {
  constructor(
    readonly rule: PageRuleFile,
    readonly dataSet: PageDataSetFile,
    readonly script: PageTextFile,
    readonly style: PageTextFile,
    private readonly files: Record<PageNodeFileName, { readonly isDirty: boolean }>,
  ) {}

  getDirtyFileNames(): PageNodeFileName[] {
    return (Object.keys(this.files) as PageNodeFileName[]).filter(name => this.files[name].isDirty)
  }

  isDirty(): boolean {
    return this.getDirtyFileNames().length > 0
  }
}
