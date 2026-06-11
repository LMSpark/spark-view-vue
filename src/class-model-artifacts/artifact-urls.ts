/** AI ClassModel 生成物 URL（build-time 产物，runtime 由 Worker 按需 fetch）。 */

export const dtsClassModelManifestUrl = new URL(
  '../../generated/dts-class-model/manifest.json',
  import.meta.url,
).href
