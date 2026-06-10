import {
  ClassModelKnowledgeService,
  WorkerVcmNativeKnowledgeProvider,
  createClassModelDocumentFromRuntimeDocument,
  type VcmNativeKnowledgeProvider,
} from '@spark-appworks/spark-ai/vcm-native'
import {
  vcmComponentCatalogUrl,
  vcmProjectPageSurfaceManifestUrl,
} from '@/vcm/artifact-urls'
import componentCatalogDocumentJson from '../../../generated/vcm/component-catalog.json'
import { projectPageSurfaceRuntimeMetadataDocument } from '../../../generated/vcm/dist/project-page-surface/project-page-surface-module-metadata.runtime'

export function createPageDesignVcmKnowledgeProvider(): VcmNativeKnowledgeProvider {
  if (typeof Worker !== 'undefined') {
    const worker = new Worker(
      new URL('../vcm-knowledge.worker.ts', import.meta.url),
      { type: 'module' },
    )

    return new WorkerVcmNativeKnowledgeProvider(worker, {
      manifestUrl: vcmProjectPageSurfaceManifestUrl,
      componentCatalogUrl: vcmComponentCatalogUrl,
    })
  }

  return new ClassModelKnowledgeService({
    document: createClassModelDocumentFromRuntimeDocument(projectPageSurfaceRuntimeMetadataDocument),
    componentCatalog: componentCatalogDocumentJson,
  })
}
