import { PageDesignDatasetCatalog } from './dataset'
import { isPageDesignDatasetMethodExposed } from './dataset/edit-surface'
import { PageDesignNodeTreeCatalog } from './node-tree'
import { PageDesignTextModelCatalog } from './text-model'
import { PageDesignJsonDocCatalog } from './json-doc'

export class PageDesignEditActionClassifier {
  private readonly datasetCatalog = new PageDesignDatasetCatalog()

  private readonly nodeTreeCatalog = new PageDesignNodeTreeCatalog()

  private readonly textModelCatalog = new PageDesignTextModelCatalog()

  private readonly jsonDocCatalog = new PageDesignJsonDocCatalog()

  isNodeTreeWriteAction(action: string): boolean {
    return this.nodeTreeCatalog.parameterTable.some((row) => row.type === 'request' && row.action === action)
  }

  isDataSetWriteAction(action: string): boolean {
    return this.datasetCatalog.parameterTable.some(
      (row) => row.type === 'request'
        && row.action === action
        && isPageDesignDatasetMethodExposed(row.crudToolMethod),
    )
  }

  isTextModelWriteAction(action: string): boolean {
    return this.textModelCatalog.parameterTable.some((row) => row.type === 'request' && row.action === action)
  }

  isJsonDocWriteAction(action: string): boolean {
    return this.jsonDocCatalog.parameterTable.some((row) => row.type === 'request' && row.action === action)
  }

  isWriteAction(action: string): boolean {
    return this.isNodeTreeWriteAction(action)
      || this.isDataSetWriteAction(action)
      || this.isTextModelWriteAction(action)
      || this.isJsonDocWriteAction(action)
  }
}

export { PageDesignEditSession } from './lifecycle'

export type { EditState, EditPhase, EditToolHost } from './lifecycle'
export type { PageDesignNodeTree } from './node-tree'
export { PageDesignJsonDocCatalog } from './json-doc'
export type { JsonDocType } from './json-doc'
