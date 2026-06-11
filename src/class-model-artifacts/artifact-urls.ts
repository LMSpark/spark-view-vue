/**
 * @module app:class-model-artifacts/artifact-urls
 * app 的 class-model-artifacts/artifact-urls 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
/** AI ClassModel 生成物 URL（build-time 产物，runtime 由 Worker 按需 fetch）。 */

export const dtsClassModelManifestUrl = new URL(
  '../../generated/dts-class-model/manifest.json',
  import.meta.url,
).href
