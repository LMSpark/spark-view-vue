/**
 * documents/index — factory that produces the 4-file PageFileDocument registry.
 *
 * This registry is the SSOT for page file state in DevSystem. It replaces the
 * previous dual-plane (editFiles + pageRuleTree + pageDataTool + fileTextHistory)
 * design.
 */
import type { DataSetCrudTool } from '@spark-view/spark-data'
import type { SparkNodeTree } from '@spark-view/spark-component'
import { createPageDataDocument } from './page-data-document'
import { createRuleDocument } from './rule-document'
import { createTextDocument } from './text-document'
import type { PageFileDocument, PageFileName } from './types'

export { PAGE_FILE_NAMES } from './types'
export type { PageFileName, PageFileDocument, PageFileLoadState, LoadFromTextOptions } from './types'

export interface PageDocumentRegistry {
  'rule.json': PageFileDocument<SparkNodeTree>
  'pagedata.json': PageFileDocument<DataSetCrudTool>
  'script.js': PageFileDocument<string>
  'style.css': PageFileDocument<string>
}

export function createPageDocuments(): PageDocumentRegistry {
  return {
    'rule.json': createRuleDocument(),
    'pagedata.json': createPageDataDocument(),
    'script.js': createTextDocument('script.js'),
    'style.css': createTextDocument('style.css'),
  }
}

/** Iterate registry entries in the canonical 4-file order. */
export function forEachDocument(
  registry: PageDocumentRegistry,
  visit: (name: PageFileName, doc: PageFileDocument<unknown>) => void,
): void {
  visit('rule.json', registry['rule.json'] as PageFileDocument<unknown>)
  visit('pagedata.json', registry['pagedata.json'] as PageFileDocument<unknown>)
  visit('script.js', registry['script.js'] as PageFileDocument<unknown>)
  visit('style.css', registry['style.css'] as PageFileDocument<unknown>)
}
