/**
 * @module app:class-model-artifacts/artifact-urls
 * 职责：提供主应用 ClassModel 静态 bundle 的 HTTP manifest URL。
 * 边界：只解析发布路径；bundle 内容由 generate + sync-class-model-static 维护。
 * AI用途：Worker 按需 fetch shard 时，用本模块定位 manifest 入口 URL。
 */

/** Vite public/ 下 ClassModel 静态目录（由 sync-class-model-static 从 generated/ 同步）。 */
export const DTS_CLASS_MODEL_MANIFEST_PATH = '/dts-class-model/manifest.json' as const

const DEFAULT_DEV_ORIGIN = 'http://127.0.0.1:5273'

/** 解析可 fetch 的 manifest 绝对 URL（浏览器 / Node e2e 共用）。 */
export function resolveDtsClassModelManifestUrl(baseUrl?: string | URL): string {
  const base = baseUrl ?? readRuntimeOrigin()
  return new URL(DTS_CLASS_MODEL_MANIFEST_PATH, base).href
}

/** pageDesign / projectPlanning 注册时使用的 manifest URL。 */
export const dtsClassModelManifestUrl = resolveDtsClassModelManifestUrl()

function readRuntimeOrigin(): string {
  if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
    const location = globalThis.location
    if (typeof location?.origin === 'string' && location.origin.length > 0) {
      return location.origin
    }
  }
  return DEFAULT_DEV_ORIGIN
}
