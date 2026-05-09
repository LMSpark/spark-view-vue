import { PageDesignDatasetCatalog } from './dataset'
import { isPageDesignDatasetMethodExposed } from './dataset/edit-surface'
import { PageDesignNodeTreeCatalog } from './node-tree'
import { PageDesignTextModelCatalog } from './text-model'
import { PageDesignJsonDocCatalog } from './json-doc'

export class PageDesignEditFunctionClassifier {
  private readonly datasetCatalog = new PageDesignDatasetCatalog()

  private readonly nodeTreeCatalog = new PageDesignNodeTreeCatalog()

  private readonly textModelCatalog = new PageDesignTextModelCatalog()

  private readonly jsonDocCatalog = new PageDesignJsonDocCatalog()

  isNodeTreeWriteAction(functionId: string): boolean {
    return this.nodeTreeCatalog.parameterTable.some((row) => row.type === 'request' && row.functionId === functionId)
  }

  isDataSetWriteAction(functionId: string): boolean {
    return this.datasetCatalog.parameterTable.some(
      (row) => row.type === 'request'
        && row.functionId === functionId
        && isPageDesignDatasetMethodExposed(row.crudToolMethod),
    )
  }

  isTextModelWriteAction(functionId: string): boolean {
    return this.textModelCatalog.parameterTable.some((row) => row.type === 'request' && row.functionId === functionId)
  }

  isJsonDocWriteAction(functionId: string): boolean {
    return this.jsonDocCatalog.parameterTable.some((row) => row.type === 'request' && row.functionId === functionId)
  }

  isWriteAction(functionId: string): boolean {
    return this.isNodeTreeWriteAction(functionId)
      || this.isDataSetWriteAction(functionId)
      || this.isTextModelWriteAction(functionId)
      || this.isJsonDocWriteAction(functionId)
  }
}

/** @deprecated 使用 PageDesignEditFunctionClassifier；这里按 functionId 分类，不按 LLM action 路径分类。 */
export class PageDesignEditActionClassifier extends PageDesignEditFunctionClassifier {}

export { PageDesignEditSession } from './lifecycle'

export type { EditState, EditPhase, EditToolHost } from './lifecycle'
export type { PageDesignNodeTree } from './node-tree'
export { PageDesignJsonDocCatalog } from './json-doc'
export type { JsonDocType } from './json-doc'
