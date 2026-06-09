/** VCM 生成物 URL（build-time 产物，runtime 由 Worker fetch）。 */

export const vcmProjectModelMetadataUrl = new URL(
  '../../generated/vcm/project-model/project-model-module-metadata.runtime.generated.json',
  import.meta.url,
).href

export const vcmProjectPageSurfaceMetadataUrl = new URL(
  '../../generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime.generated.json',
  import.meta.url,
).href

export const vcmComponentCatalogUrl = new URL(
  '../../generated/vcm/component-catalog.json',
  import.meta.url,
).href
