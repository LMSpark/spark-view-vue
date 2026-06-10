/** VCM dist 生成物 URL（build-time 产物，runtime 由 Worker 按需 fetch）。 */

export const vcmProjectModelManifestUrl = new URL(
  '../../generated/vcm/dist/project-model/manifest.json',
  import.meta.url,
).href

export const vcmProjectModelMetadataUrl = new URL(
  '../../generated/vcm/dist/project-model/project-model-module-metadata.runtime.generated.json',
  import.meta.url,
).href

export const vcmProjectPageSurfaceManifestUrl = new URL(
  '../../generated/vcm/dist/project-page-surface/manifest.json',
  import.meta.url,
).href

export const vcmProjectPageSurfaceMetadataUrl = new URL(
  '../../generated/vcm/dist/project-page-surface/project-page-surface-module-metadata.runtime.generated.json',
  import.meta.url,
).href

export const vcmComponentCatalogUrl = new URL(
  '../../generated/vcm/component-catalog.json',
  import.meta.url,
).href
